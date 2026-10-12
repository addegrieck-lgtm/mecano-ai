import { missingFields, type MissingInfo, type TemplateDefinition } from "./template-schema";

/**
 * Informations manquantes ou à vérifier d'un dossier (module pur : utilisé par le serveur ET par l'éditeur hors ligne).
 * Ne produit jamais de verdict de conformité : uniquement l'écart entre la saisie et le modèle.
 */
type MissionLike = { clientId: string | null; scheduledAt: unknown; inspectorId: string | null; data: Record<string, unknown>; pendingFields: string[] };
type ItemLike = { id: string; parentId: string | null; itemType: string; label: string; data: Record<string, unknown>; pendingFields: string[]; remainingChecks: string | null };
type ObsLike = { description: string; needsVerification: boolean; technicalReference: string | null; referenceVerified: boolean };

type FullData = {
  mission: MissionLike;
  definition: TemplateDefinition;
  items: ItemLike[];
  observations: ObsLike[];
  attachments: { kind: string; itemId: string | null }[];
};


export function checklistState(m: Pick<MissionLike, "data">, def: TemplateDefinition): boolean[] {
  const raw = (m.data as Record<string, unknown>)._checklist;
  const arr = Array.isArray(raw) ? raw : [];
  return def.checklist.map((_, i) => arr[i] === true);
}

export function computeMissing(d: FullData): MissingInfo[] {
  const out: MissingInfo[] = [];
  const m = d.mission;
  if (!m.clientId) out.push({ level: "bloquant", message: "Client non renseigné", target: "clientId" });
  if (!m.scheduledAt) out.push({ level: "bloquant", message: "Date d'intervention non renseignée", target: "scheduledAt" });
  if (!m.inspectorId) out.push({ level: "bloquant", message: "Inspecteur non renseigné", target: "inspectorId" });
  out.push(...missingFields(d.definition.headerFields, m.data, m.pendingFields, ""));
  const topLevel = d.items.filter((i) => !i.parentId);
  if (!topLevel.length) out.push({ level: "bloquant", message: d.definition.domain === "LEVAGE" ? "Aucun équipement saisi" : "Aucun élément (zone, tableau, équipement) saisi" });
  for (const it of d.items) {
    const t = d.definition.itemTypes.find((x) => x.key === it.itemType);
    if (!t) {
      out.push({ level: "a_verifier", message: `${it.label} : type d'élément absent du modèle` });
      continue;
    }
    out.push(...missingFields(t.fields, it.data, it.pendingFields, `${it.label} — `));
    if (it.remainingChecks?.trim()) out.push({ level: "a_verifier", message: `${it.label} — éléments restant à vérifier : ${it.remainingChecks.trim().slice(0, 120)}` });
    for (const req of d.definition.requiredAttachments.filter((r) => r.itemType === it.itemType)) {
      if (!d.attachments.some((a) => a.itemId === it.id && a.kind === req.kind)) out.push({ level: "bloquant", message: `${it.label} — pièce attendue : ${req.label}` });
    }
  }
  for (const req of d.definition.requiredAttachments.filter((r) => !r.itemType)) {
    if (!d.attachments.some((a) => a.kind === req.kind)) out.push({ level: "bloquant", message: `Pièce attendue : ${req.label}` });
  }
  for (const o of d.observations) {
    if (o.needsVerification) out.push({ level: "a_verifier", message: `Observation à vérifier / compléter : ${o.description.slice(0, 80)}` });
    if (o.technicalReference && !o.referenceVerified) out.push({ level: "a_verifier", message: `Référence technique non vérifiée : ${o.technicalReference.slice(0, 80)}` });
  }
  const cl = checklistState(m, d.definition);
  const unchecked = d.definition.checklist.filter((_, i) => !cl[i]);
  if (unchecked.length) out.push({ level: "a_verifier", message: `Checklist avant export : ${unchecked.length} point(s) non coché(s)` });
  return out;
}

