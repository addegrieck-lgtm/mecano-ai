import { describe, expect, it } from "vitest";
import { bytesToDtc, parseDTCs, parseMode01, parseVIN, parseVoltage, toTroubleCodes } from "@/lib/obd/obd-parser";
import { dtcToHex, SimulatorOBDProvider, SIMULATOR_SCENARIOS } from "@/lib/obd/simulator-obd-provider";
import { ObdService } from "@/lib/obd/obd-service";

const fixed = () => 0.5; // jitter nul

describe("Parser OBD", () => {
  it("décode les PID mode 01", () => {
    expect(parseMode01("41 0C 1A F8\r\r>")).toEqual({ pid: "0C", key: "rpm", value: 1726 });
    expect(parseMode01("41 05 7B")?.value).toBe(83);
    expect(parseMode01("41 0D 32")?.value).toBe(50);
    expect(parseMode01("41 04 FF")?.value).toBe(100);
    expect(parseMode01("41 11 80")?.value).toBeCloseTo(50.2, 1);
    expect(parseMode01("SEARCHING...\r41 0F 44\r>")?.value).toBe(28);
    expect(parseMode01("NO DATA")).toBeNull();
  });

  it("décode la tension batterie", () => {
    expect(parseVoltage("14.2V\r>")).toBe(14.2);
    expect(parseVoltage("12V")).toBe(12);
  });

  it("décode les codes défaut (CAN et non-CAN)", () => {
    expect(bytesToDtc(0x03, 0x02)).toBe("P0302");
    expect(bytesToDtc(0x44, 0x20)).toBe("C0420");
    expect(bytesToDtc(0xc1, 0x00)).toBe("U0100");
    expect(parseDTCs("43 02 03 02 04 20\r>")).toEqual(["P0302", "P0420"]); // CAN avec comptage
    expect(parseDTCs("43 03 02 04 20 00 00\r>")).toEqual(["P0302", "P0420"]); // non-CAN, bourrage
    expect(parseDTCs("43 00\r>")).toEqual([]);
    expect(parseDTCs("NO DATA")).toEqual([]);
  });

  it("décode un VIN multi-trames", () => {
    const vin = "WVWZZZAUZHW098765";
    const b = [...vin].map((c) => c.charCodeAt(0).toString(16).toUpperCase());
    const raw = `014\r0: 49 02 01 ${b.slice(0, 3).join(" ")}\r1: ${b.slice(3, 10).join(" ")}\r2: ${b.slice(10).join(" ")}\r\r>`;
    expect(parseVIN(raw)).toBe(vin);
  });

  it("aller-retour encodage / décodage d'un DTC", () => {
    for (const code of ["P0300", "P0171", "P0299", "P0135"]) expect(parseDTCs(`43 01 ${dtcToHex(code)}`)).toEqual([code]);
  });

  it("enrichit les codes avec leur description", () => {
    expect(toTroubleCodes(["P0302"])[0].description).toMatch(/cylindre 2/);
    expect(toTroubleCodes(["P1999"])[0].description).toMatch(/non disponible/);
  });
});

describe("Simulateur OBD", () => {
  it("connexion / déconnexion", async () => {
    const obd = new SimulatorOBDProvider({ latencyMs: 0, random: fixed });
    expect(await obd.getConnectionStatus()).toBe(false);
    await obd.connect();
    expect(await obd.getConnectionStatus()).toBe(true);
    await obd.disconnect();
    expect(await obd.getConnectionStatus()).toBe(false);
    await expect(obd.readDTCs()).rejects.toThrow(/non connecté/);
  });

  it("lit le VIN, les DTC et les données live via le parser", async () => {
    const obd = new SimulatorOBDProvider({ latencyMs: 0, random: fixed, scenarioId: "p0302", vin: "WVWZZZAUZHW098765" });
    await obd.connect();
    expect((await obd.readVehicleInfo()).vin).toBe("WVWZZZAUZHW098765");
    expect(await obd.readDTCs()).toEqual(["P0302"]);
    const live = await obd.readLiveData();
    expect(live.rpm).toBe(830);
    expect(live.coolantTemperature).toBe(91);
    expect(live.batteryVoltage).toBe(14.2);
    expect(live.speed).toBe(0);
    expect(live.engineLoad).toBeGreaterThan(20);
  });

  it("gère tous les scénarios et l'effacement des codes", async () => {
    for (const s of SIMULATOR_SCENARIOS) {
      const obd = new SimulatorOBDProvider({ latencyMs: 0, random: fixed, scenarioId: s.id });
      await obd.connect();
      expect((await obd.readDTCs()).sort()).toEqual([...s.dtcs].sort());
      await obd.clearDTCs();
      expect(await obd.readDTCs()).toEqual([]);
    }
  });
});

describe("Service OBD (hors React)", () => {
  it("expose l'état de connexion et les lectures", async () => {
    const svc = new ObdService({ createProvider: () => new SimulatorOBDProvider({ latencyMs: 0, random: fixed, scenarioId: "multiple" }) });
    const states: string[] = [];
    svc.subscribe(() => states.push(svc.getSnapshot().status));
    await svc.connect();
    expect(svc.getSnapshot().status).toBe("connected");
    expect(states).toContain("connecting");
    const dtcs = await svc.readDTCs();
    expect(dtcs.map((d) => d.code).sort()).toEqual(["P0171", "P0300", "P0420"]);
    const live = await svc.readLiveData();
    expect(live.longFuelTrimB1).toBeGreaterThan(10);
    await svc.clearDTCs();
    expect(svc.getSnapshot().dtcs).toEqual([]);
    await svc.disconnect();
    expect(svc.getSnapshot().status).toBe("disconnected");
  });
});
