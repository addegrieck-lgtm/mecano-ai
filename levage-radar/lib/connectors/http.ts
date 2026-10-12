/**
 * Client HTTP des connecteurs : délai maximal, reprises avec attente exponentielle sur 429 / 5xx / erreurs réseau
 * (en respectant Retry-After), espacement minimal entre deux requêtes vers un même hôte.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

const lastCall = new Map<string, number>();

export type HttpOptions = {
  retries?: number;
  timeoutMs?: number;
  minIntervalMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function userAgent() {
  const contact = process.env.CONNECTOR_CONTACT_EMAIL;
  return `LevageRadar/0.1 (veille marchés publics${contact ? `; contact: ${contact}` : ""})`;
}

export async function httpRequest(url: string, init: RequestInit = {}, opts: HttpOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const minInterval = opts.minIntervalMs ?? 1000;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const host = new URL(url).host;

  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    const wait = (lastCall.get(host) ?? 0) + minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`Délai dépassé (${timeoutMs} ms)`)), timeoutMs);
    const onAbort = () => ctrl.abort(opts.signal?.reason);
    opts.signal?.addEventListener("abort", onAbort);
    try {
      const res = await doFetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: { "User-Agent": userAgent(), Accept: "application/json", ...(init.headers ?? {}) },
      });
      if (res.ok) return res;
      const body = (await res.text().catch(() => "")).slice(0, 2000);
      const err = new HttpError(`HTTP ${res.status} sur ${host}`, res.status, body);
      if (res.status === 429 || res.status >= 500) {
        lastErr = err;
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 2 ** attempt * 2000);
        attempt++;
        continue;
      }
      throw err; // 4xx : erreur de requête, inutile de réessayer
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (opts.signal?.aborted) throw e;
      lastErr = e;
      await sleep(2 ** attempt * 2000);
      attempt++;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Échec après ${retries + 1} tentatives vers ${host} : ${msg}`);
}

export async function httpJson<T>(url: string, init: RequestInit = {}, opts: HttpOptions = {}): Promise<T> {
  const res = await httpRequest(url, init, opts);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Réponse non JSON reçue de ${new URL(url).host}`);
  }
}
