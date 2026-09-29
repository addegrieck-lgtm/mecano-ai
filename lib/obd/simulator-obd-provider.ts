import { ELM327Provider } from "./elm327-provider";
import type { OBDTransport, VehicleLiveData } from "./obd-provider";

/**
 * Simulateur OBD : émule un adaptateur ELM327 branché sur un véhicule.
 * Les réponses sont générées au format brut ELM327 puis décodées par le même parser
 * que le vrai boîtier → le parcours complet (transport → parser → diagnostic) est exercé sans matériel.
 * Les valeurs sont SIMULÉES et identifiées comme telles dans l'interface.
 */

export interface SimulatorScenario {
  id: string;
  label: string;
  dtcs: string[];
  /** Valeurs de base du véhicule simulé (moteur chaud, ralenti). */
  live: Required<Pick<VehicleLiveData, "rpm" | "coolantTemperature" | "batteryVoltage" | "engineLoad" | "throttlePosition" | "intakeAirTemperature" | "shortFuelTrimB1" | "longFuelTrimB1" | "speed">>;
  /** Amplitude d'instabilité du régime (ratés). */
  rpmJitter: number;
}

const IDLE = { rpm: 850, speed: 0, coolantTemperature: 91, batteryVoltage: 14.2, engineLoad: 22, throttlePosition: 14, intakeAirTemperature: 28, shortFuelTrimB1: 1.6, longFuelTrimB1: 2.3 };

export const SIMULATOR_SCENARIOS: SimulatorScenario[] = [
  { id: "no_fault", label: "Aucun défaut", dtcs: [], live: IDLE, rpmJitter: 10 },
  { id: "p0302", label: "P0302 — Raté cylindre 2", dtcs: ["P0302"], live: { ...IDLE, rpm: 830 }, rpmJitter: 70 },
  { id: "p0420", label: "P0420 — Efficacité catalyseur", dtcs: ["P0420"], live: IDLE, rpmJitter: 10 },
  { id: "p0401", label: "P0401 — Débit EGR insuffisant", dtcs: ["P0401"], live: { ...IDLE, engineLoad: 25 }, rpmJitter: 15 },
  {
    id: "multiple",
    label: "Défauts multiples (P0300, P0171, P0420)",
    dtcs: ["P0300", "P0171", "P0420"],
    live: { ...IDLE, rpm: 810, shortFuelTrimB1: 12.5, longFuelTrimB1: 17.2 },
    rpmJitter: 90,
  },
];

export interface SimulatedVehicle {
  vin: string;
  label: string;
}

/** VIN fictifs des véhicules de démonstration (cohérents avec data/demo-data.ts). */
export const SIMULATOR_VEHICLES: SimulatedVehicle[] = [
  { vin: "WVWZZZAUZHW098765", label: "Volkswagen Golf 7 1.4 TSI (2017)" },
  { vin: "VF15RBJ0D61234567", label: "Renault Clio IV 0.9 TCe (2016)" },
  { vin: "VF3LBBHZHJS145230", label: "Peugeot 308 1.6 BlueHDi (2018)" },
  { vin: "VR7ACYHZKML112233", label: "Citroën C5 Aircross 1.5 BlueHDi (2020)" },
];

export interface SimulatorOptions {
  scenarioId?: string;
  vin?: string;
  /** Latence simulée (ms). 0 dans les tests. */
  latencyMs?: number;
  random?: () => number;
}

const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, "0");

export class SimulatorTransport implements OBDTransport {
  readonly kind = "SIMULATOR" as const;
  private open_ = false;
  scenario: SimulatorScenario;
  vin: string;
  private dtcs: string[];
  private latency: number;
  private random: () => number;

  constructor(opts: SimulatorOptions = {}) {
    this.scenario = SIMULATOR_SCENARIOS.find((s) => s.id === opts.scenarioId) ?? SIMULATOR_SCENARIOS[1];
    this.vin = opts.vin ?? SIMULATOR_VEHICLES[0].vin;
    this.dtcs = [...this.scenario.dtcs];
    this.latency = opts.latencyMs ?? 350;
    this.random = opts.random ?? Math.random;
  }

  setScenario(id: string) {
    const s = SIMULATOR_SCENARIOS.find((x) => x.id === id);
    if (s) {
      this.scenario = s;
      this.dtcs = [...s.dtcs];
    }
  }

  private wait(ms: number) {
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  }

  async open() {
    await this.wait(this.latency * 2);
    this.open_ = true;
    return { deviceName: "Simulateur OBD (ELM327 v1.5)" };
  }

  async close() {
    this.open_ = false;
  }

  isOpen() {
    return this.open_;
  }

  private jitter(amplitude: number) {
    return (this.random() * 2 - 1) * amplitude;
  }

  async send(command: string): Promise<string> {
    if (!this.open_) throw new Error("Transport fermé");
    await this.wait(this.latency / 10);
    const cmd = command.replace(/\s/g, "").toUpperCase();
    const l = this.scenario.live;
    const ok = "OK\r\r>";
    if (cmd === "ATZ") return "\r\rELM327 v1.5\r\r>";
    if (cmd.startsWith("AT") && cmd !== "ATRV" && cmd !== "ATDP") return ok;
    if (cmd === "ATDP") return "AUTO, ISO 15765-4 (CAN 11/500)\r\r>";
    if (cmd === "ATRV") return `${(l.batteryVoltage + this.jitter(0.1)).toFixed(1)}V\r\r>`;
    if (cmd === "0100") return "41 00 BE 3E B8 11\r\r>";
    if (cmd === "03") {
      const payload = this.dtcs.map(dtcToHex).join(" ");
      return `43 ${hex(this.dtcs.length)}${payload ? " " + payload : ""}\r\r>`;
    }
    if (cmd === "04") {
      this.dtcs = [];
      return "44\r\r>";
    }
    if (cmd === "0902") {
      const bytes = [...this.vin].map((c) => hex(c.charCodeAt(0)));
      return `014\r0: 49 02 01 ${bytes.slice(0, 3).join(" ")}\r1: ${bytes.slice(3, 10).join(" ")}\r2: ${bytes.slice(10, 17).join(" ")}\r\r>`;
    }
    if (cmd.startsWith("01") && cmd.length === 4) {
      const pid = cmd.slice(2);
      switch (pid) {
        case "04":
          return `41 04 ${hex(((l.engineLoad + this.jitter(1.5)) * 255) / 100)}\r\r>`;
        case "05":
          return `41 05 ${hex(l.coolantTemperature + Math.round(this.jitter(1)) + 40)}\r\r>`;
        case "06":
          return `41 06 ${hex(((l.shortFuelTrimB1 + this.jitter(1.5)) * 128) / 100 + 128)}\r\r>`;
        case "07":
          return `41 07 ${hex((l.longFuelTrimB1 * 128) / 100 + 128)}\r\r>`;
        case "0C": {
          const v = Math.round((l.rpm + this.jitter(this.scenario.rpmJitter)) * 4);
          return `41 0C ${hex(v >> 8)} ${hex(v & 0xff)}\r\r>`;
        }
        case "0D":
          return `41 0D ${hex(l.speed)}\r\r>`;
        case "0F":
          return `41 0F ${hex(l.intakeAirTemperature + 40)}\r\r>`;
        case "11":
          return `41 11 ${hex(((l.throttlePosition + this.jitter(0.5)) * 255) / 100)}\r\r>`;
        default:
          return "NO DATA\r\r>";
      }
    }
    return "?\r\r>";
  }
}

export function dtcToHex(code: string): string {
  const letter = { P: 0, C: 1, B: 2, U: 3 }[code[0] as "P" | "C" | "B" | "U"] ?? 0;
  const a = (letter << 6) | (parseInt(code[1], 16) << 4) | parseInt(code[2], 16);
  const b = parseInt(code.slice(3), 16);
  return `${hex(a)} ${hex(b)}`;
}

export class SimulatorOBDProvider extends ELM327Provider {
  readonly simulator: SimulatorTransport;

  constructor(opts: SimulatorOptions = {}) {
    const transport = new SimulatorTransport(opts);
    super(transport);
    this.simulator = transport;
  }

  setScenario(id: string) {
    this.simulator.setScenario(id);
  }

  setVin(vin: string) {
    this.simulator.vin = vin;
  }
}
