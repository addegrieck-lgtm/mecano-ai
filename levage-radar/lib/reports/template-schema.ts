import { z } from "zod";

/**
 * Définition d'un modèle de mission (stockée en JSON, versionnée, validée par un responsable).
 * Les modèles ne sont pas figés dans le code : ce schéma décrit ce qu'un responsable technique peut configurer.
 */
const key = z.string().regex(/^[a-z][a-z0-9_]{0,48}$/, "Clé : minuscules, chiffres et _ (commence par une lettre)");

export const FieldSchema = z.object({
  key,
  label: z.string().min(1).max(150),
  type: z.enum(["text", "textarea", "number", "date", "datetime", "select", "multiselect", "boolean"]),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(150)).max(100).optional(),
  unit: z.string().max(20).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(200).optional(),
  help: z.string().max(500).optional(),
  section: z.string().max(60).optional(),
  /** Affichage conditionnel : le champ n'existe que si `field` vaut `equals` (ou l'une des valeurs). */
  showIf: z.object({ field: key, equals: z.union([z.string(), z.boolean(), z.array(z.string())]) }).optional(),
  /** false : champ de travail non repris dans l'export. */
  export: z.boolean().optional(),
});
export type Field = z.infer<typeof FieldSchema>;

export const ItemTypeSchema = z.object({
  key,
  label: z.string().min(1).max(100),
  pluralLabel: z.string().max(100).optional(),
  fields: z.array(FieldSchema).max(80),
  /** Types parents autorisés (ex. un circuit sous un tableau). Vide = élément de premier niveau. */
  parentTypes: z.array(key).optional(),
  labelField: key.optional(),
});
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const MeasurementTypeSchema = z.object({
  key,
  label: z.string().min(1).max(120),
  units: z.array(z.string().min(1).max(20)).min(1).max(10),
  appliesTo: z.array(key).max(30),
  help: z.string().max(500).optional(),
});
export type MeasurementType = z.infer<typeof MeasurementTypeSchema>;

export const TemplateDefinitionSchema = z
  .object({
    domain: z.enum(["LEVAGE", "ELECTRICITE"]),
    headerFields: z.array(FieldSchema).max(80),
    itemTypes: z.array(ItemTypeSchema).min(1).max(30),
    measurementTypes: z.array(MeasurementTypeSchema).max(50).default([]),
    observationPriorities: z
      .array(z.object({ key, label: z.string().min(1).max(80) }))
      .max(10)
      .default([]),
    treatmentStatuses: z
      .array(z.object({ key, label: z.string().min(1).max(80) }))
      .max(10)
      .default([
        { key: "a_traiter", label: "À traiter" },
        { key: "a_verifier", label: "À vérifier" },
        { key: "traitee", label: "Traitée" },
      ]),
    requiredAttachments: z
      .array(z.object({ key, label: z.string().min(1).max(150), itemType: key.optional(), kind: z.enum(["photo", "document"]) }))
      .max(20)
      .default([]),
    /** Points à cocher manuellement avant l'export / le passage « prêt à finaliser ». */
    checklist: z.array(z.string().min(1).max(300)).max(40).default([]),
    exportOptions: z.object({ includePhotos: z.boolean().default(true), includeMeasurements: z.boolean().default(true) }).default({ includePhotos: true, includeMeasurements: true }),
    /** Mention obligatoire affichée sur l'écran et sur l'export. */
    notice: z.string().max(1000).default("Document de travail préparatoire — ne constitue pas un rapport officiel."),
  })
  .superRefine((d, ctx) => {
    const itemKeys = new Set(d.itemTypes.map((t) => t.key));
    const dup = (arr: string[]) => arr.find((k, i) => arr.indexOf(k) !== i);
    const dh = dup(d.headerFields.map((f) => f.key));
    if (dh) ctx.addIssue({ code: "custom", message: `Champ d'en-tête en double : ${dh}` });
    const di = dup(d.itemTypes.map((t) => t.key));
    if (di) ctx.addIssue({ code: "custom", message: `Type d'élément en double : ${di}` });
    for (const t of d.itemTypes) {
      const df = dup(t.fields.map((f) => f.key));
      if (df) ctx.addIssue({ code: "custom", message: `Champ en double dans ${t.key} : ${df}` });
      for (const p of t.parentTypes ?? []) if (!itemKeys.has(p)) ctx.addIssue({ code: "custom", message: `Type parent inconnu dans ${t.key} : ${p}` });
      for (const f of t.fields) {
        if ((f.type === "select" || f.type === "multiselect") && !f.options?.length) ctx.addIssue({ code: "custom", message: `Options manquantes : ${t.key}.${f.key}` });
        if (f.showIf && !t.fields.some((x) => x.key === f.showIf!.field)) ctx.addIssue({ code: "custom", message: `Condition sur un champ inconnu : ${t.key}.${f.key}` });
      }
    }
    for (const f of d.headerFields) {
      if ((f.type === "select" || f.type === "multiselect") && !f.options?.length) ctx.addIssue({ code: "custom", message: `Options manquantes : ${f.key}` });
      if (f.showIf && !d.headerFields.some((x) => x.key === f.showIf!.field)) ctx.addIssue({ code: "custom", message: `Condition sur un champ inconnu : ${f.key}` });
    }
    for (const m of d.measurementTypes) for (const a of m.appliesTo) if (!itemKeys.has(a)) ctx.addIssue({ code: "custom", message: `Relevé ${m.key} : type d'élément inconnu ${a}` });
  });
export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;

export function parseDefinition(input: unknown): TemplateDefinition {
  return TemplateDefinitionSchema.parse(input);
}

// ---------------------------------------------------------------------------
// Validation des valeurs saisies
// ---------------------------------------------------------------------------

export function isVisible(field: Field, values: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const v = values[field.showIf.field];
  const eq = field.showIf.equals;
  if (Array.isArray(eq)) return eq.includes(String(v));
  return v === eq || String(v) === String(eq);
}

export const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Vérifie et normalise une valeur ; renvoie un message d'erreur ou la valeur normalisée. */
export function coerceValue(field: Field, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (isEmpty(raw)) return { ok: true, value: null };
  switch (field.type) {
    case "text":
    case "textarea": {
      const s = String(raw);
      const max = field.type === "text" ? 500 : 10000;
      if (s.length > max) return { ok: false, error: `${field.label} : ${max} caractères maximum` };
      if (field.pattern) {
        try {
          if (!new RegExp(`^(?:${field.pattern})$`).test(s)) return { ok: false, error: `${field.label} : format invalide` };
        } catch {
          /* motif invalide : ignoré */
        }
      }
      return { ok: true, value: s };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", ".").replace(/\s/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} : nombre invalide` };
      if (field.min !== undefined && n < field.min) return { ok: false, error: `${field.label} : minimum ${field.min}` };
      if (field.max !== undefined && n > field.max) return { ok: false, error: `${field.label} : maximum ${field.max}` };
      return { ok: true, value: n };
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? { ok: true, value: String(raw) } : { ok: false, error: `${field.label} : date invalide` };
    case "datetime":
      return Number.isNaN(new Date(String(raw)).getTime()) ? { ok: false, error: `${field.label} : date/heure invalide` } : { ok: true, value: String(raw) };
    case "select":
      return field.options?.includes(String(raw)) ? { ok: true, value: String(raw) } : { ok: false, error: `${field.label} : valeur non autorisée` };
    case "multiselect": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const bad = arr.find((v) => !field.options?.includes(v));
      return bad ? { ok: false, error: `${field.label} : valeur non autorisée (${bad})` } : { ok: true, value: arr };
    }
    case "boolean":
      return { ok: true, value: raw === true || raw === "true" || raw === "on" };
  }
}

export type MissingInfo = { level: "bloquant" | "a_verifier"; message: string; target?: string };

/** Champs obligatoires manquants / en attente pour un ensemble de valeurs. */
export function missingFields(fields: Field[], values: Record<string, unknown>, pending: string[], prefix: string): MissingInfo[] {
  const out: MissingInfo[] = [];
  for (const f of fields) {
    if (!isVisible(f, values)) continue;
    if (pending.includes(f.key)) out.push({ level: "a_verifier", message: `${prefix}${f.label} : laissé en attente`, target: f.key });
    else if (f.required && isEmpty(values[f.key])) out.push({ level: "bloquant", message: `${prefix}${f.label} : champ obligatoire non renseigné`, target: f.key });
  }
  return out;
}
