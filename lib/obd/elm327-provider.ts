import { OBDError, type LiveData, type OBDProvider, type OBDProviderKind, type OBDTransport, type VehicleInfo } from "./obd-provider";
import { NO_DATA, PIDS, parseDTCs, parseMode01, parseVIN, parseVoltage } from "./obd-parser";

/**
 * Implémentation OBDProvider basée sur le jeu de commandes ELM327 (compatible STN/OBDLink).
 * Le transport (BLE, Wi-Fi, simulateur…) est injecté : aucune dépendance au matériel ici.
 */
export class ELM327Provider implements OBDProvider {
  readonly kind: OBDProviderKind;
  private connected = false;
  private deviceName?: string;
  private protocol?: string;
  private adapter?: string;

  constructor(protected readonly transport: OBDTransport) {
    this.kind = transport.kind;
  }

  getDeviceName() {
    return this.deviceName;
  }

  async connect(): Promise<void> {
    const { deviceName } = await this.transport.open();
    this.deviceName = deviceName;
    try {
      this.adapter = (await this.transport.send("ATZ", 4000)).replace(/[>\r\n]/g, " ").trim();
      for (const cmd of ["ATE0", "ATL0", "ATS1", "ATH0", "ATSP0"]) await this.transport.send(cmd);
      // Première requête : déclenche la détection automatique du protocole véhicule.
      const probe = await this.transport.send("0100", 10000);
      if (/UNABLE TO CONNECT|BUS INIT|CAN ERROR/i.test(probe)) {
        throw new OBDError("Le boîtier répond mais le véhicule ne communique pas. Vérifier que le contact est mis.");
      }
      this.protocol = (await this.transport.send("ATDP")).replace(/[>\r\n]/g, " ").trim();
      this.connected = true;
    } catch (e) {
      await this.transport.close().catch(() => undefined);
      this.connected = false;
      throw e instanceof OBDError ? e : new OBDError(`Initialisation du boîtier impossible : ${(e as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await this.transport.close();
  }

  async getConnectionStatus(): Promise<boolean> {
    return this.connected && this.transport.isOpen();
  }

  private ensure() {
    if (!this.connected || !this.transport.isOpen()) throw new OBDError("Boîtier OBD non connecté");
  }

  async readVehicleInfo(): Promise<VehicleInfo> {
    this.ensure();
    const raw = await this.transport.send("0902", 6000);
    return { vin: parseVIN(raw), protocol: this.protocol, adapter: this.adapter };
  }

  async readDTCs(): Promise<string[]> {
    this.ensure();
    const raw = await this.transport.send("03", 6000);
    return parseDTCs(raw, "43");
  }

  async clearDTCs(): Promise<void> {
    this.ensure();
    const raw = await this.transport.send("04", 6000);
    if (NO_DATA.test(raw) && !/44/.test(raw)) throw new OBDError("Effacement refusé par le calculateur (contact mis, moteur arrêté ?)");
  }

  async readLiveData(): Promise<LiveData> {
    this.ensure();
    const data: LiveData = {};
    for (const pid of Object.values(PIDS)) {
      if (pid === PIDS.controlModuleVoltage) continue;
      const parsed = parseMode01(await this.transport.send(`01${pid}`));
      if (parsed) (data as Record<string, number>)[parsed.key] = parsed.value;
    }
    const v = parseVoltage(await this.transport.send("ATRV"));
    if (v !== undefined) data.batteryVoltage = v;
    return data;
  }
}
