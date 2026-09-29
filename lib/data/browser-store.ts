import { MemoryStore, type Snapshot } from "./store";

/**
 * Store local-first pour le mode DEMO : l'ensemble des données est conservé en mémoire
 * et persisté dans IndexedDB (pas de limite de 5 Mo comme localStorage, photos incluses).
 * Fonctionne hors connexion.
 */
const DB_NAME = "mecano-ai";
const STORE = "kv";
const KEY = "db-v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export class BrowserStore extends MemoryStore {
  private pending: Promise<void> = Promise.resolve();

  static async load(seed: () => Snapshot): Promise<{ store: BrowserStore; seeded: boolean }> {
    let snapshot: Snapshot | undefined;
    try {
      snapshot = await idbGet<Snapshot>(KEY);
    } catch {
      snapshot = undefined;
    }
    const seeded = !snapshot;
    const store = new BrowserStore(snapshot ?? seed());
    if (seeded) await store.afterWrite();
    return { store, seeded };
  }

  protected override async afterWrite(): Promise<void> {
    const snap = this.data;
    // sérialise les écritures pour éviter qu'une ancienne version écrase une plus récente
    this.pending = this.pending.then(() => idbSet(KEY, snap)).catch((e) => console.error("[MECANO AI] Persistance locale impossible", e));
    return this.pending;
  }

  async replaceAll(snapshot: Snapshot): Promise<void> {
    this.data = snapshot;
    await this.afterWrite();
  }
}
