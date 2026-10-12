import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { audit } from "@/lib/audit";
import { exportsLog } from "@/lib/db/schema";
import { toCsv } from "@/lib/exports/csv";
import { PdfBuilder } from "@/lib/exports/pdf";
import { connectorInfo } from "@/lib/connectors/registry";
import { CATEGORIES, DOMAINS, SERVICE_TYPES, TRACKING_STATUSES, type Category, type OppDomain, type TrackingStatus } from "@/lib/radar/types";
import { COUNTRY_NAMES } from "@/lib/radar/geo";
import { getOpportunity, searchOpportunities, type OppRow, type SearchFilters } from "./opportunities";
import type { ServiceType } from "@/lib/radar/dictionaries";

const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "");
const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "";

export const CSV_FIELDS: Record<string, { label: string; get: (o: OppRow) => unknown }> = {
  title: { label: "Titre", get: (o) => o.title },
  buyer: { label: "Acheteur", get: (o) => o.buyerName },
  domain: { label: "Domaine", get: (o) => DOMAINS[o.domain as OppDomain] },
  category: { label: "Catégorie", get: (o) => CATEGORIES[o.category as Category] },
  serviceType: { label: "Type de prestation", get: (o) => SERVICE_TYPES[o.serviceType as ServiceType] },
  score: { label: "Score", get: (o) => o.score },
  status: { label: "Statut de suivi", get: (o) => TRACKING_STATUSES[(o.tracking?.status ?? "NOUVEAU") as TrackingStatus] },
  country: { label: "Pays", get: (o) => (o.country ? (COUNTRY_NAMES[o.country] ?? o.country) : "") },
  region: { label: "Région", get: (o) => o.region },
  department: { label: "Département", get: (o) => o.department },
  city: { label: "Ville", get: (o) => o.city },
  publishedAt: { label: "Date de publication", get: (o) => o.publishedAt },
  deadlineAt: { label: "Date limite", get: (o) => fmtDateTime(o.deadlineAt) },
  amount: { label: "Montant publié", get: (o) => o.publishedAmount },
  currency: { label: "Devise", get: (o) => o.amountCurrency },
  duration: { label: "Durée publiée", get: (o) => o.durationText },
  reference: { label: "Référence de l'avis", get: (o) => o.reference },
  source: { label: "Source", get: (o) => connectorInfo(o.primarySourceId ?? "")?.name ?? o.primarySourceId },
  url: { label: "Lien officiel", get: (o) => o.officialUrl },
  collectedAt: { label: "Date de collecte", get: (o) => fmtDateTime(o.collectedAt) },
  reliability: { label: "Fiabilité des données", get: (o) => o.reliability },
  reason: { label: "Justification", get: (o) => o.relevanceReason },
};
export const DEFAULT_CSV_FIELDS = ["title", "buyer", "domain", "category", "score", "department", "publishedAt", "deadlineAt", "amount", "reference", "source", "url"];

export async function exportOpportunitiesCsv(ctx: Ctx, filters: SearchFilters, fields: string[], opts: { demo?: boolean } = {}) {
  requirePerm(ctx, "opps.export");
  const keys = fields.filter((f) => f in CSV_FIELDS);
  const use = keys.length ? keys : DEFAULT_CSV_FIELDS;
  const res = await searchOpportunities(ctx, { ...filters, page: 1, pageSize: 500 }, opts);
  const rows = res.all.slice(0, 3000);
  const csv = toCsv(
    use.map((k) => CSV_FIELDS[k].label),
    rows.map((o) => use.map((k) => CSV_FIELDS[k].get(o))),
  );
  const filename = `opportunites-${new Date().toISOString().slice(0, 10)}${opts.demo ? "-DEMO" : ""}.csv`;
  await ctx.db.insert(exportsLog).values({ orgId: ctx.org.id, userId: ctx.user.id, kind: "opportunities_csv", filename, rowCount: rows.length });
  await audit(ctx, "export", null, "opportunities_csv", { rows: rows.length, fields: use });
  return { csv, filename };
}

/** Fiche de synthèse texte destinée à être reprise MANUELLEMENT dans le logiciel commercial officiel. */
export async function opportunitySummaryText(ctx: Ctx, id: string): Promise<string> {
  const d = await getOpportunity(ctx, id);
  const o = d.opp;
  const lines = [
    `FICHE DE SYNTHÈSE — ${o.title}`,
    `(préparée par LEVAGE RADAR le ${fmtDate(new Date())} — à reprendre manuellement dans l'outil officiel)`,
    "",
    `Acheteur : ${o.buyerName ?? "non publié"}`,
    `Localisation : ${[o.city, o.department ? `dép. ${o.department}` : null, o.region, o.country ? COUNTRY_NAMES[o.country] ?? o.country : null].filter(Boolean).join(", ") || "non publiée"}`,
    `Domaine : ${DOMAINS[o.domain as OppDomain]} — ${SERVICE_TYPES[o.serviceType as ServiceType]}`,
    `Catégorie : ${CATEGORIES[o.category as Category]}`,
    `Référence : ${o.reference ?? "—"}`,
    `Publication : ${o.publishedAt ? fmtDate(o.publishedAt) : "non publiée"}`,
    `Date limite : ${o.deadlineAt ? fmtDateTime(o.deadlineAt) : "non publiée par la source"}`,
    `Montant : ${o.publishedAmount ? `${Number(o.publishedAmount).toLocaleString("fr-FR")} ${o.amountCurrency ?? ""} (publié par la source)` : "non publié"}`,
    `Durée : ${o.durationText ?? "non publiée"}`,
    `Procédure : ${o.procedureType ?? "non précisée"}`,
    `Lien officiel : ${o.officialUrl ?? "—"}`,
    "",
    "Lots :",
    ...(d.lots.length ? d.lots.map((l) => `  - ${l.lotNumber ? `Lot ${l.lotNumber} : ` : ""}${l.title}${l.relevant ? " [pertinent]" : ""}`) : ["  (aucun lot publié ou extrait)"]),
    "",
    `Pertinence (score ${d.score}/100) : ${o.relevanceReason}`,
    "",
    "Notes internes :",
    ...(d.notes.length ? d.notes.map((n) => `  - ${fmtDate(n.createdAt)} ${n.author ?? ""} : ${n.body}`) : ["  (aucune)"]),
    "",
    "Pièces demandées / critères : consulter le règlement de consultation sur la source officielle (non collecté automatiquement).",
  ];
  await audit(ctx, "opportunity", id, "summary_export");
  return lines.join("\n");
}

export async function opportunityPdf(ctx: Ctx, id: string): Promise<{ bytes: Uint8Array; filename: string }> {
  requirePerm(ctx, "opps.export");
  const d = await getOpportunity(ctx, id);
  const o = d.opp;
  const pdf = await PdfBuilder.create(o.title, `LEVAGE RADAR — synthèse commerciale générée le ${fmtDateTime(new Date())} — document de travail interne, non officiel. Vérifier l'avis source.`);
  if (o.isDemo) pdf.banner("DONNÉES DE DÉMONSTRATION FICTIVES — ne correspond à aucun avis réel.");
  pdf.heading(o.title, 1);
  pdf.keyValues([
    ["Acheteur", o.buyerName],
    ["Domaine", `${DOMAINS[o.domain as OppDomain]} — ${SERVICE_TYPES[o.serviceType as ServiceType]}`],
    ["Catégorie", CATEGORIES[o.category as Category]],
    ["Score", `${d.score}/100`],
    ["Statut de suivi", TRACKING_STATUSES[(d.tracking?.status ?? "NOUVEAU") as TrackingStatus]],
    ["Localisation", [o.city, o.department ? `dép. ${o.department}` : null, o.region, o.country ? (COUNTRY_NAMES[o.country] ?? o.country) : null].filter(Boolean).join(", ")],
    ["Publication", o.publishedAt ? fmtDate(o.publishedAt) : null],
    ["Date limite", o.deadlineAt ? fmtDateTime(o.deadlineAt) : "Non publiée par la source"],
    ["Montant", o.publishedAmount ? `${Number(o.publishedAmount).toLocaleString("fr-FR")} ${o.amountCurrency ?? ""} (montant publié)` : "Non publié"],
    ["Durée", o.durationText],
    ["Procédure", o.procedureType],
    ["Référence", o.reference],
    ["Lien officiel", o.officialUrl],
    ["Collecté le", fmtDateTime(o.collectedAt)],
  ]);
  if (o.description) {
    pdf.heading("Description publiée");
    pdf.paragraph(o.description.slice(0, 6000));
  }
  if (d.lots.length) {
    pdf.heading("Lots");
    pdf.bullets(d.lots.map((l) => `${l.lotNumber ? `Lot ${l.lotNumber} : ` : ""}${l.title}${l.relevant ? " (pertinent)" : ""}`));
  }
  pdf.heading("Pertinence et score");
  pdf.paragraph(o.relevanceReason);
  pdf.bullets([...o.scoreFactors, ...d.personal].map((f) => `${f.points >= 0 ? "+" : ""}${f.points} : ${f.label}${f.kind === "personal" ? " (préférence personnelle)" : ""}`));
  pdf.heading("Sources");
  pdf.bullets(d.notices.map((n) => `${connectorInfo(n.sourceId)?.name ?? n.sourceId} — réf. ${n.sourceRef} — ${n.url ?? ""} (${n.licence ?? ""})`));
  if (d.notes.length) {
    pdf.heading("Notes internes");
    pdf.bullets(d.notes.map((n) => `${fmtDate(n.createdAt)} — ${n.author ?? ""} : ${n.body}`));
  }
  const bytes = await pdf.bytes();
  const filename = `synthese-${(o.reference ?? o.id).replace(/[^\w-]/g, "_")}.pdf`;
  await ctx.db.insert(exportsLog).values({ orgId: ctx.org.id, userId: ctx.user.id, kind: "opportunity_pdf", entityId: id, filename });
  await audit(ctx, "opportunity", id, "pdf_export");
  return { bytes, filename };
}
