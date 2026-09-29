import { BluetoothOBDProvider } from "./bluetooth-obd-provider";
import type { DiagnosticTroubleCode, LiveData, OBDProvider, OBDProviderKind, VehicleInfo } from "./obd-provider";
import { toTroubleCodes } from "./obd-parser";
import { SimulatorOBDProvider, SIMULATOR_SCENARIOS } from "./simulator-obd-provider";

/**
 * Service OBD (hors React). Centralise l'état de connexion ; les composants s'y abonnent
 * via useSyncExternalStore. Aucune logique Bluetooth ne vit dans les composants.
 */

export type ObdStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ObdState {
  status: ObdStatus;
  providerKind: OBDProviderKind;
  scenarioId: string;
  simulatorVin?: string;
  deviceName?: string;
  error?: string;
  vehicleInfo?: VehicleInfo;
  dtcs: DiagnosticTroubleCode[];
  dtcsReadAt?: string;
  live?: LiveData;
  liveHistory: { t: number; data: LiveData }[];
  streaming: boolean;
  connectedAt?: string;
  busy: boolean;
  /** Références applicatives opaques (session OBD enregistrée, véhicule associé). */
  meta: { sessionId?: string; vehicleId?: string };
}

type Listener = () => void;

export interface ObdServiceOptions {
  createProvider?: (kind: OBDProviderKind, state: ObdState) => OBDProvider;
  liveIntervalMs?: number;
}

const INITIAL: ObdState = {
  status: "disconnected",
  providerKind: "SIMULATOR",
  scenarioId: SIMULATOR_SCENARIOS[1].id,
  dtcs: [],
  liveHistory: [],
  streaming: false,
  busy: false,
  meta: {},
};

export class ObdService {
  private state: ObdState = INITIAL;
  private listeners = new Set<Listener>();
  private provider?: OBDProvider;
  private timer?: ReturnType<typeof setInterval>;
  private readonly createProvider: (kind: OBDProviderKind, state: ObdState) => OBDProvider;
  private readonly liveIntervalMs: number;

  constructor(opts: ObdServiceOptions = {}) {
    this.createProvider =
      opts.createProvider ??
      ((kind, state) => (kind === "SIMULATOR" ? new SimulatorOBDProvider({ scenarioId: state.scenarioId, vin: state.simulatorVin }) : new BluetoothOBDProvider()));
    this.liveIntervalMs = opts.liveIntervalMs ?? 1000;
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<ObdState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  setMeta(meta: ObdState["meta"]) {
    this.set({ meta: { ...this.state.meta, ...meta } });
  }

  setProviderKind(kind: OBDProviderKind) {
    if (this.state.status === "connected") return;
    this.set({ providerKind: kind, error: undefined });
  }

  setScenario(id: string) {
    this.set({ scenarioId: id });
    if (this.provider instanceof SimulatorOBDProvider) this.provider.setScenario(id);
  }

  setSimulatorVin(vin: string | undefined) {
    this.set({ simulatorVin: vin });
    if (vin && this.provider instanceof SimulatorOBDProvider) this.provider.setVin(vin);
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    this.set({ busy: true, error: undefined });
    try {
      return await fn();
    } catch (e) {
      this.set({ error: (e as Error).message });
      throw e;
    } finally {
      this.set({ busy: false });
    }
  }

  async connect(): Promise<VehicleInfo> {
    if (this.state.status === "connected") return this.state.vehicleInfo ?? {};
    this.set({ status: "connecting", error: undefined, dtcs: [], live: undefined, liveHistory: [], vehicleInfo: undefined });
    try {
      this.provider = this.createProvider(this.state.providerKind, this.state);
      await this.provider.connect();
      const info = await this.provider.readVehicleInfo();
      this.set({ status: "connected", vehicleInfo: info, deviceName: this.provider.getDeviceName?.(), connectedAt: new Date().toISOString() });
      return info;
    } catch (e) {
      this.provider = undefined;
      this.set({ status: "error", error: (e as Error).message });
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.stopLive();
    try {
      await this.provider?.disconnect();
    } finally {
      this.provider = undefined;
      this.set({ status: "disconnected", streaming: false, busy: false, meta: {} });
    }
  }

  private requireProvider(): OBDProvider {
    if (!this.provider || this.state.status !== "connected") throw new Error("Boîtier OBD non connecté");
    return this.provider;
  }

  readDTCs(): Promise<DiagnosticTroubleCode[]> {
    return this.guard(async () => {
      const codes = await this.requireProvider().readDTCs();
      const dtcs = toTroubleCodes(codes);
      this.set({ dtcs, dtcsReadAt: new Date().toISOString() });
      return dtcs;
    });
  }

  clearDTCs(): Promise<void> {
    return this.guard(async () => {
      await this.requireProvider().clearDTCs();
      this.set({ dtcs: [], dtcsReadAt: new Date().toISOString() });
    });
  }

  readLiveData(): Promise<LiveData> {
    return this.guard(async () => {
      const data = await this.requireProvider().readLiveData();
      this.pushLive(data);
      return data;
    });
  }

  private pushLive(data: LiveData) {
    const liveHistory = [...this.state.liveHistory, { t: Date.now(), data }].slice(-60);
    this.set({ live: data, liveHistory });
  }

  startLive() {
    if (this.timer) return;
    this.set({ streaming: true });
    let inFlight = false;
    this.timer = setInterval(async () => {
      if (inFlight || !this.provider) return;
      inFlight = true;
      try {
        this.pushLive(await this.provider.readLiveData());
      } catch (e) {
        this.set({ error: (e as Error).message });
        this.stopLive();
      } finally {
        inFlight = false;
      }
    }, this.liveIntervalMs);
  }

  stopLive() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.state.streaming) this.set({ streaming: false });
  }
}

let singleton: ObdService | null = null;
export function getObdService(): ObdService {
  if (!singleton) singleton = new ObdService();
  return singleton;
}
