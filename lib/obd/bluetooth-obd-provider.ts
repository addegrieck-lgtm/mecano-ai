import { ELM327Provider } from "./elm327-provider";
import { OBDError, type OBDTransport } from "./obd-provider";

/**
 * Transport Bluetooth Low Energy (Web Bluetooth) pour adaptateurs OBD de type ELM327 / STN.
 *
 * ⚠️ Limites connues :
 * - Web Bluetooth n'est disponible que sur Chrome/Edge (Android, desktop). Il n'est PAS disponible
 *   sur iOS Safari : sur iPhone, une application native (Swift/CoreBluetooth ou Capacitor) devra
 *   implémenter l'interface OBDTransport.
 * - Les adaptateurs « Bluetooth Classic » (SPP) ne sont pas accessibles depuis un navigateur.
 * - Chaque fabricant expose ses propres UUID de service : les profils ci-dessous couvrent les plus
 *   courants mais un boîtier donné peut nécessiter un profil supplémentaire.
 */

interface BleProfile {
  name: string;
  service: string | number;
  notify: string | number;
  write: string | number;
}

export const BLE_PROFILES: BleProfile[] = [
  { name: "ELM327 BLE (FFF0)", service: 0xfff0, notify: 0xfff1, write: 0xfff2 },
  { name: "ELM327 BLE (FFE0)", service: 0xffe0, notify: 0xffe1, write: 0xffe1 },
  {
    name: "Vgate iCar Pro BLE",
    service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    notify: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
    write: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  },
];

// Typage minimal de Web Bluetooth (évite une dépendance @types).
interface BleCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BleCharacteristic>;
  stopNotifications(): Promise<BleCharacteristic>;
  writeValue(data: BufferSource): Promise<void>;
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
  properties?: { write?: boolean; writeWithoutResponse?: boolean };
}
interface BleService {
  getCharacteristic(uuid: string | number): Promise<BleCharacteristic>;
}
interface BleServer {
  connected: boolean;
  connect(): Promise<BleServer>;
  disconnect(): void;
  getPrimaryService(uuid: string | number): Promise<BleService>;
}
interface BleDevice extends EventTarget {
  name?: string;
  gatt?: BleServer;
}
interface BluetoothApi {
  requestDevice(options: { acceptAllDevices?: boolean; filters?: unknown[]; optionalServices?: (string | number)[] }): Promise<BleDevice>;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function bluetoothSupportMessage(): string | null {
  if (isWebBluetoothSupported()) return null;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "Web Bluetooth n'est pas disponible sur iOS. Utilisez le simulateur, ou une future application native MECANO AI pour connecter un boîtier réel.";
  }
  return "Web Bluetooth n'est pas disponible sur ce navigateur. Utilisez Chrome ou Edge (Android / ordinateur) en HTTPS ou sur localhost.";
}

export class WebBluetoothTransport implements OBDTransport {
  readonly kind = "BLUETOOTH" as const;
  private device?: BleDevice;
  private server?: BleServer;
  private notifyChar?: BleCharacteristic;
  private writeChar?: BleCharacteristic;
  private buffer = "";
  private waiter?: { resolve: (v: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
  private queue: Promise<unknown> = Promise.resolve();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  async open(): Promise<{ deviceName?: string }> {
    const message = bluetoothSupportMessage();
    if (message) throw new OBDError(message);
    const bt = (navigator as unknown as { bluetooth: BluetoothApi }).bluetooth;
    try {
      this.device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BLE_PROFILES.map((p) => p.service) });
    } catch {
      throw new OBDError("Aucun boîtier sélectionné.");
    }
    if (!this.device.gatt) throw new OBDError("Ce périphérique n'expose pas de service BLE.");
    this.device.addEventListener("gattserverdisconnected", () => this.failPending("Boîtier déconnecté"));
    this.server = await this.device.gatt.connect();

    for (const profile of BLE_PROFILES) {
      try {
        const service = await this.server.getPrimaryService(profile.service);
        this.notifyChar = await service.getCharacteristic(profile.notify);
        this.writeChar = await service.getCharacteristic(profile.write);
        break;
      } catch {
        // profil suivant
      }
    }
    if (!this.notifyChar || !this.writeChar) {
      this.server.disconnect();
      throw new OBDError("Boîtier non reconnu : aucun profil OBD BLE compatible. Ce boîtier nécessite peut-être un profil spécifique.");
    }
    await this.notifyChar.startNotifications();
    this.notifyChar.addEventListener("characteristicvaluechanged", this.onData);
    return { deviceName: this.device.name ?? "Boîtier OBD BLE" };
  }

  private onData = (event: Event) => {
    const value = (event.target as BleCharacteristic).value;
    if (!value) return;
    this.buffer += this.decoder.decode(value.buffer as ArrayBuffer);
    if (this.buffer.includes(">") && this.waiter) {
      const out = this.buffer;
      this.buffer = "";
      clearTimeout(this.waiter.timer);
      this.waiter.resolve(out);
      this.waiter = undefined;
    }
  };

  private failPending(msg: string) {
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.reject(new OBDError(msg));
      this.waiter = undefined;
    }
  }

  async close(): Promise<void> {
    this.failPending("Déconnexion");
    try {
      this.notifyChar?.removeEventListener("characteristicvaluechanged", this.onData);
      await this.notifyChar?.stopNotifications();
    } catch {
      /* ignore */
    }
    if (this.server?.connected) this.server.disconnect();
    this.server = undefined;
  }

  isOpen(): boolean {
    return !!this.server?.connected;
  }

  /** Les commandes sont sérialisées : un ELM327 ne traite qu'une requête à la fois. */
  send(command: string, timeoutMs = 3000): Promise<string> {
    const run = async () => {
      if (!this.writeChar || !this.isOpen()) throw new OBDError("Boîtier non connecté");
      this.buffer = "";
      const response = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.waiter = undefined;
          reject(new OBDError(`Délai dépassé pour la commande ${command}`));
        }, timeoutMs);
        this.waiter = { resolve, reject, timer };
      });
      const data = this.encoder.encode(`${command}\r`);
      if (this.writeChar.writeValueWithoutResponse && this.writeChar.properties?.writeWithoutResponse) {
        await this.writeChar.writeValueWithoutResponse(data);
      } else {
        await this.writeChar.writeValue(data);
      }
      return response;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

export class BluetoothOBDProvider extends ELM327Provider {
  constructor(transport: OBDTransport = new WebBluetoothTransport()) {
    super(transport);
  }
}
