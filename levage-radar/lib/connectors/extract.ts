/** Outils d'extraction défensive dans des structures JSON hétérogènes (formats BOAMP / eForms). */

type Visit = (key: string, value: unknown, path: string[]) => void;

export function walk(node: unknown, visit: Visit, path: string[] = [], depth = 0) {
  if (depth > 40 || node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, visit, [...path, String(i)], depth + 1));
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      visit(k, v, [...path, k]);
      walk(v, visit, [...path, k], depth + 1);
    }
  }
}

/** Texte d'une valeur scalaire ou d'un nœud { "#text": … } / { "_": … } / { value: … }. */
export function textOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const t = textOf(x);
      if (t) return t;
    }
    return null;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["#text", "_", "value", "$", "text"]) if (k in o) return textOf(o[k]);
  }
  return null;
}

/** Texte multilingue TED : { fra: […], eng: […] } ou { FRA: "…" } → préférence FR puis EN. */
export function pickLang(v: unknown, prefs = ["fra", "FRA", "fr", "eng", "ENG", "en"]): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const t = pickLang(x, prefs);
      if (t) return t;
    }
    return null;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const p of prefs) if (p in o) {
      const t = pickLang(o[p], prefs);
      if (t) return t;
    }
    for (const val of Object.values(o)) {
      const t = pickLang(val, prefs);
      if (t) return t;
    }
  }
  return null;
}

export function asArray<T = unknown>(v: unknown): T[] {
  if (v === null || v === undefined) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

export function parseAmount(v: unknown): number | null {
  const t = textOf(v);
  if (!t) return null;
  const n = Number(t.replace(/\s| /g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Date publiée → YYYY-MM-DD (aucune date inventée : null si non interprétable). */
export function toIsoDate(v: unknown): string | null {
  const t = textOf(v);
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const fr = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  const compact = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

/** Date-heure publiée → ISO 8601 (fuseau Europe/Paris supposé seulement si la source n'en donne pas : signalé). */
export function toIsoDateTime(v: unknown): string | null {
  const t = textOf(v);
  if (!t) return null;
  const d = new Date(t.length === 10 ? `${t}T23:59:59` : t);
  if (Number.isNaN(d.getTime())) {
    const date = toIsoDate(t);
    return date ? new Date(`${date}T23:59:59`).toISOString() : null;
  }
  return d.toISOString();
}

export const CPV_RE = /^\d{8}(-\d)?$/;
