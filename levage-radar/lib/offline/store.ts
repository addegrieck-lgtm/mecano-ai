/**
 * Stockage local des dossiers pour le mode hors ligne (navigateur uniquement).
 * - IndexedDB ; chaque enregistrement est chiffré en AES-GCM 256 avec une clé WebCrypto NON EXTRACTIBLE
 *   générée sur l'appareil et propre à l'utilisateur. Cela protège contre la lecture directe des fichiers
 *   du navigateur, pas contre un appareil compromis ou déverrouillé par un tiers (voir docs/SECURITE.md).
 * - Effacement complet : à la déconnexion volontaire, ou si un autre utilisateur se connecte sur l'appareil.
 */
const DB_NAME = "levage-radar-offline";
const VERSION = 1;
const STORES = ["meta", "snapshots", "queue", "files"] as const;
type StoreName = (typeof STORES)[number];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => {
      db.close();
      resolve(r ? (r.result as T) : undefined);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

const get = <T>(store: StoreName, key: string) => tx<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
const put = (store: StoreName, key: string, value: unknown) => tx(store, "readwrite", (s) => void s.put(value, key));
const del = (store: StoreName, key: string) => tx(store, "readwrite", (s) => void s.delete(key));
const keys = (store: StoreName) => tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys());

let cachedKey: { userId: string; key: CryptoKey } | null = null;

/** Prépare le stockage pour l'utilisateur : efface les données d'un autre utilisateur, crée la clé si besoin. */
export async function initOfflineStore(userId: string): Promise<boolean> {
  if (typeof indexedDB === "undefined" || !crypto?.subtle) return false;
  const owner = await get<string>("meta", "owner");
  if (owner && owner !== userId) await wipeOfflineData();
  let key = await get<CryptoKey>("meta", "key");
  if (!key || owner !== userId) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await put("meta", "key", key);
    await put("meta", "owner", userId);
  }
  cachedKey = { userId, key };
  return true;
}

async function encrypt(value: unknown): Promise<{ iv: Uint8Array; data: ArrayBuffer }> {
  if (!cachedKey) throw new Error("Stockage hors ligne non initialisé");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new TextEncoder().encode(JSON.stringify(value));
  return { iv, data: await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, cachedKey.key, bytes as BufferSource) };
}

async function decrypt<T>(rec: { iv: Uint8Array; data: ArrayBuffer } | undefined, raw = false): Promise<T | null> {
  if (!rec || !cachedKey) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv as BufferSource }, cachedKey.key, rec.data);
    return (raw ? plain : JSON.parse(new TextDecoder().decode(plain))) as T;
  } catch {
    return null;
  }
}

export async function saveSnapshot(missionId: string, snapshot: unknown) {
  await put("snapshots", missionId, { ...(await encrypt(snapshot)), savedAt: Date.now() });
}
export async function loadSnapshot<T>(missionId: string): Promise<{ data: T; savedAt: number } | null> {
  const rec = await get<{ iv: Uint8Array; data: ArrayBuffer; savedAt: number }>("snapshots", missionId);
  const data = await decrypt<T>(rec);
  return data && rec ? { data, savedAt: rec.savedAt } : null;
}

export async function saveQueue(missionId: string, ops: unknown[]) {
  if (!ops.length) await del("queue", missionId);
  else await put("queue", missionId, await encrypt(ops));
}
export async function loadQueue<T>(missionId: string): Promise<T[]> {
  return (await decrypt<T[]>(await get("queue", missionId))) ?? [];
}

export type PendingFile = { id: string; missionId: string; kind: "photo" | "document"; itemId: string | null; observationId: string | null; caption: string; filename: string; mime: string };
export async function savePendingFile(meta: PendingFile, data: ArrayBuffer) {
  await put("files", meta.id, { meta: await encrypt(meta), blob: await encrypt(data) });
}
export async function listPendingFiles(missionId: string): Promise<(PendingFile & { data: ArrayBuffer })[]> {
  const out: (PendingFile & { data: ArrayBuffer })[] = [];
  for (const k of (await keys("files")) ?? []) {
    const rec = await get<{ meta: { iv: Uint8Array; data: ArrayBuffer }; blob: { iv: Uint8Array; data: ArrayBuffer } }>("files", String(k));
    const meta = await decrypt<PendingFile>(rec?.meta);
    if (!meta || meta.missionId !== missionId) continue;
    const data = await decrypt<ArrayBuffer>(rec?.blob, true);
    if (data) out.push({ ...meta, data });
  }
  return out;
}
export const removePendingFile = (id: string) => del("files", id);

/** Nombre total d'opérations et de fichiers non synchronisés sur l'appareil. */
export async function pendingCount(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const q = (await keys("queue"))?.length ?? 0;
    const f = (await keys("files"))?.length ?? 0;
    return q + f;
  } catch {
    return 0;
  }
}

export async function wipeOfflineData() {
  cachedKey = null;
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
