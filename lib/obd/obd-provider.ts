import type { VehicleLiveData } from "@/types";

export type { VehicleLiveData };
/** Alias demandé par la spécification. */
export type LiveData = VehicleLiveData;

export interface DiagnosticTroubleCode {
  code: string;
  description?: string;
}

export interface VehicleInfo {
  vin?: string;
  protocol?: string;
  adapter?: string;
}

export type OBDProviderKind = "SIMULATOR" | "BLUETOOTH";

/**
 * Contrat unique pour tout boîtier OBD. Le système de diagnostic ne dépend que de cette interface :
 * remplacer SimulatorOBDProvider par BluetoothOBDProvider (ou un futur WifiOBDProvider / natif iOS)
 * ne demande aucune réécriture du reste de l'application.
 */
export interface OBDProvider {
  readonly kind: OBDProviderKind;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionStatus(): Promise<boolean>;
  readVehicleInfo(): Promise<VehicleInfo>;
  readDTCs(): Promise<string[]>;
  clearDTCs(): Promise<void>;
  readLiveData(): Promise<LiveData>;
  /** Nom de l'appareil (si connu). */
  getDeviceName?(): string | undefined;
}

/**
 * Couche transport : un canal texte capable d'envoyer une commande ELM327/ST et de
 * renvoyer la réponse brute (jusqu'au prompt ">"). Permet d'isoler BLE, Wi-Fi, série, natif…
 */
export interface OBDTransport {
  readonly kind: OBDProviderKind;
  open(): Promise<{ deviceName?: string }>;
  close(): Promise<void>;
  isOpen(): boolean;
  send(command: string, timeoutMs?: number): Promise<string>;
}

export class OBDError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OBDError";
  }
}
