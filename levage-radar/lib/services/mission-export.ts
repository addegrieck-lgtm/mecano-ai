import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { audit } from "@/lib/audit";
import { attachments, exportsLog, fileBlobs } from "@/lib/db/schema";
import { PdfBuilder } from "@/lib/exports/pdf";
import { isEmpty, isVisible, type Field } from "@/lib/reports/template-schema";
import { getMissionFull, missionHistory, saveSnapshot, statusLabel } from "./missions";

const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : null;

function display(f: Field, v: unknown): string | null {
  if (isEmpty(v)) return null;
  if (f.type === "boolean") return v ? "Oui" : "Non";
  if (Array.isArray(v)) return v.join(", ");
  if (f.type === "datetime") return fmtDateTime(String(v));
  if (f.type === "date") return new Date(String(v)).toLocaleDateString("fr-FR");
  return `${v}${f.unit ? ` ${f.unit}` : ""}`;
}

/** Brouillon structuré : uniquement les données réellement saisies, avec libellés, et les manques explicites. */
export async function buildDraft(ctx: Ctx, id: string) {
  const full = await getMissionFull(ctx, id);
  const { mission: m, definition: def } = full;
  const fieldsOut = (fields: Field[], values: Record<string, unknown>, pending: string[]) =>
    fields
      .filter((f) => f.export !== false && isVisible(f, values))
      .map((f) => ({ key: f.key, label: f.label, value: values[f.key] ?? null, display: display(f, values[f.key]), pending: pending.includes(f.key), required: !!f.required }));
  const itemsOut = full.items.map((it) => {
    const t = def.itemTypes.find((x) => x.key === it.itemType);
    return {
      id: it.id,
      parentId: it.parentId,
      type: it.itemType,
      typeLabel: t?.label ?? it.itemType,
      label: it.label,
      fields: t ? fieldsOut(t.fields, it.data, it.pendingFields) : [],
      remainingChecks: it.remainingChecks,
      measurements: full.measurements
        .filter((x) => x.itemId === it.id)
        .map((x) => ({ id: x.id, label: x.label, value: x.value, unit: x.unit, measuredAt: x.measuredAt, instrument: x.instrument, context: x.context, origin: x.origin })),
      observations: full.observations.filter((o) => o.itemId === it.id),
      attachments: full.attachments.filter((a) => a.itemId === it.id),
    };
  });
  return {
    format: "levage-radar/brouillon-rapport",
    formatVersion: 1,
    notice: def.notice,
    generatedAt: new Date().toISOString(),
    mission: {
      id: m.id,
      domain: m.domain,
      title: m.title,
      internalRef: m.internalRef,
      status: statusLabel(ctx, m.status),
      version: m.version,
      scheduledAt: m.scheduledAt,
      address: m.address,
      client: full.client?.name ?? null,
      site: full.site ? { name: full.site.name, address: [full.site.address, full.site.postalCode, full.site.city].filter(Boolean).join(" ") } : null,
      inspector: full.inspector?.name ?? null,
      template: full.template,
      generalNotes: m.generalNotes,
      fields: fieldsOut(def.headerFields, m.data, m.pendingFields),
    },
    items: itemsOut,
    measurementsWithoutItem: full.measurements.filter((x) => !x.itemId),
    observationsWithoutItem: full.observations.filter((o) => !o.itemId),
    attachmentsWithoutItem: full.attachments.filter((a) => !a.itemId),
    missing: full.missing,
    checklist: def.checklist.map((label, i) => ({ label, checked: ((m.data as Record<string, unknown>)._checklist as boolean[] | undefined)?.[i] === true })),
    priorities: def.observationPriorities,
    treatmentStatuses: def.treatmentStatuses,
  };
}

export async function exportMissionJson(ctx: Ctx, id: string) {
  requirePerm(ctx, "reports.export");
  const draft = await buildDraft(ctx, id);
  const snap = await saveSnapshot(ctx, id, `Export JSON v${draft.mission.version}`);
  const filename = `brouillon-${(draft.mission.internalRef ?? draft.mission.id).replace(/[^\w-]/g, "_")}-v${draft.mission.version}.json`;
  await ctx.db.insert(exportsLog).values({ orgId: ctx.org.id, userId: ctx.user.id, kind: "mission_json", entityId: id, filename });
  await audit(ctx, "mission", id, "export", { format: "json", snapshotId: snap.id });
  return { json: JSON.stringify(draft, null, 2), filename };
}

export async function exportMissionPdf(ctx: Ctx, id: string, opts: { includeHistory?: boolean } = {}) {
  requirePerm(ctx, "reports.export");
  const draft = await buildDraft(ctx, id);
  const full = await getMissionFull(ctx, id);
  const def = full.definition;
  const m = draft.mission;
  const pdf = await PdfBuilder.create(m.title, `BROUILLON non officiel — ${m.title} — version ${m.version} — généré le ${fmtDateTime(new Date())} par LEVAGE RADAR`);
  pdf.banner(`BROUILLON DE TRAVAIL — NON OFFICIEL. ${def.notice}`);
  pdf.heading(m.title, 1);
  pdf.keyValues([
    ["Domaine", m.domain === "LEVAGE" ? "Levage" : "Électricité"],
    ["Modèle", full.template ? `${full.template.name} (v${full.template.version})` : null],
    ["Statut du dossier", m.status],
    ["Client", m.client],
    ["Site", m.site ? `${m.site.name}${m.site.address ? ` — ${m.site.address}` : ""}` : null],
    ["Adresse d'intervention", m.address],
    ["Date d'intervention", fmtDateTime(m.scheduledAt)],
    ["Inspecteur", m.inspector],
    ["Référence interne", m.internalRef],
  ]);
  pdf.heading("Informations de la mission");
  pdf.keyValues(m.fields.map((f) => [f.label + (f.pending ? " (en attente)" : ""), f.display]));
  if (m.generalNotes) {
    pdf.heading("Notes générales", 3);
    pdf.paragraph(m.generalNotes);
  }

  const photoIds = def.exportOptions.includePhotos ? full.attachments.filter((a) => a.kind === "photo" && (a.mime === "image/jpeg" || a.mime === "image/png")).map((a) => a.id) : [];
  const blobs = photoIds.length
    ? await ctx.db
        .select({ id: attachments.id, data: fileBlobs.data, mime: attachments.mime, caption: attachments.caption, filename: attachments.filename })
        .from(attachments)
        .innerJoin(fileBlobs, eq(fileBlobs.id, attachments.blobId))
        .where(and(inArray(attachments.id, photoIds), isNull(attachments.deletedAt)))
    : [];
  const photo = (id: string) => blobs.find((b) => b.id === id);

  const priorityLabel = (k: string | null) => draft.priorities.find((p) => p.key === k)?.label ?? k;
  const treatmentLabel = (k: string | null) => draft.treatmentStatuses.find((p) => p.key === k)?.label ?? k;
  const obsLines = (list: typeof full.observations) =>
    list.map(
      (o) =>
        `${o.kind === "anomalie" ? "Anomalie" : "Observation"} : ${o.description}${o.location ? ` — localisation : ${o.location}` : ""}${o.internalPriority ? ` — ${priorityLabel(o.internalPriority)} (priorité interne, non réglementaire)` : ""}${o.technicalReference ? ` — réf. ${o.technicalReference}${o.referenceVerified ? " (vérifiée)" : " (NON vérifiée)"}` : ""}${o.inspectorComment ? ` — commentaire : ${o.inspectorComment}` : ""} — état : ${treatmentLabel(o.treatmentStatus)}${o.needsVerification ? " — À VÉRIFIER" : ""}`,
    );

  const roots = draft.items.filter((i) => !i.parentId);
  const childrenOf = (id: string) => draft.items.filter((i) => i.parentId === id);
  const renderItem = async (it: (typeof draft.items)[number], depth: number) => {
    pdf.heading(`${it.typeLabel} — ${it.label}`, depth === 0 ? 2 : 3);
    pdf.keyValues(it.fields.map((f) => [f.label + (f.pending ? " (en attente)" : ""), f.display]));
    if (def.exportOptions.includeMeasurements && it.measurements.length) {
      pdf.paragraph("Relevés saisis :", { bold: true });
      pdf.bullets(it.measurements.map((x) => `${x.label} : ${x.value} ${x.unit} — mesuré le ${fmtDateTime(x.measuredAt)}${x.instrument ? ` — appareil : ${x.instrument}` : ""}${x.context ? ` — ${x.context}` : ""} (${x.origin})`));
    }
    if (it.observations.length) {
      pdf.paragraph("Observations / anomalies :", { bold: true });
      pdf.bullets(obsLines(it.observations));
    }
    if (it.remainingChecks) pdf.paragraph(`Éléments restant à vérifier : ${it.remainingChecks}`, { color: [0.6, 0.3, 0] });
    for (const a of it.attachments) {
      const p = photo(a.id);
      if (p) await pdf.image(new Uint8Array(p.data), p.mime, p.caption ?? p.filename);
      else pdf.paragraph(`Pièce jointe : ${a.filename}${a.caption ? ` — ${a.caption}` : ""}`, { size: 8.5 });
    }
    for (const c of childrenOf(it.id)) await renderItem(c, depth + 1);
  };
  pdf.heading(def.domain === "LEVAGE" ? "Équipements" : "Installations, zones et équipements");
  if (!roots.length) pdf.paragraph("Aucun élément saisi.", { color: [0.6, 0.3, 0] });
  for (const it of roots) await renderItem(it, 0);

  if (draft.observationsWithoutItem.length) {
    pdf.heading("Observations générales");
    pdf.bullets(obsLines(draft.observationsWithoutItem));
  }
  if (draft.measurementsWithoutItem.length && def.exportOptions.includeMeasurements) {
    pdf.heading("Relevés généraux");
    pdf.bullets(draft.measurementsWithoutItem.map((x) => `${x.label} : ${x.value} ${x.unit} — ${fmtDateTime(x.measuredAt)}`));
  }
  const otherAtt = draft.attachmentsWithoutItem;
  if (otherAtt.length) {
    pdf.heading("Pièces jointes");
    for (const a of otherAtt) {
      const p = photo(a.id);
      if (p) await pdf.image(new Uint8Array(p.data), p.mime, p.caption ?? p.filename);
      else pdf.paragraph(`${a.filename}${a.caption ? ` — ${a.caption}` : ""}`);
    }
  }
  pdf.heading("Informations manquantes ou à vérifier");
  if (draft.missing.length) pdf.bullets(draft.missing.map((x) => `${x.level === "bloquant" ? "[OBLIGATOIRE]" : "[À vérifier]"} ${x.message}`));
  else pdf.paragraph("Aucune information manquante détectée par rapport au modèle. Cela ne signifie pas que le dossier est complet ou conforme.");
  pdf.heading("Checklist", 3);
  pdf.bullets(draft.checklist.map((c) => `${c.checked ? "[x]" : "[ ]"} ${c.label}`));
  if (opts.includeHistory) {
    const hist = await missionHistory(ctx, id);
    pdf.heading("Historique (extrait)");
    pdf.bullets(hist.slice(0, 60).map((h) => `${fmtDateTime(h.createdAt)} — ${h.user ?? "système"} — ${h.action}`));
  }
  const bytes = await pdf.bytes();
  const snap = await saveSnapshot(ctx, id, `Export PDF v${m.version}`);
  const filename = `brouillon-${(m.internalRef ?? m.id).replace(/[^\w-]/g, "_")}-v${m.version}.pdf`;
  await ctx.db.insert(exportsLog).values({ orgId: ctx.org.id, userId: ctx.user.id, kind: "mission_pdf", entityId: id, filename });
  await audit(ctx, "mission", id, "export", { format: "pdf", snapshotId: snap.id });
  return { bytes, filename };
}
