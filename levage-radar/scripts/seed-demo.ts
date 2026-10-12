/**
 * Données de DÉMONSTRATION (fictives) — uniquement si ENABLE_DEMO_DATA=true.
 * Elles sont marquées is_demo=true, rattachées à la source « demo », et ne s'affichent que dans
 * l'espace « démonstration » (jamais mélangées aux données réelles, exclues des rapports quotidiens).
 */
import { openDb } from "./_db";
import { sources } from "../lib/db/schema";
import { ingestNotices } from "../lib/radar/ingest";
import type { NormalizedNotice } from "../lib/radar/types";

if (process.env.ENABLE_DEMO_DATA !== "true") {
  console.error("Refusé : définissez ENABLE_DEMO_DATA=true pour créer des données de démonstration.");
  process.exit(1);
}
const day = (d: number) => new Date(Date.now() + d * 86400000);
const base = (i: number, o: Partial<NormalizedNotice>): NormalizedNotice => ({
  sourceId: "demo",
  sourceRef: `DEMO-${i}`,
  url: null,
  title: "",
  description: null,
  buyerName: null,
  buyerNationalId: null,
  isPublic: true,
  country: "FR",
  department: null,
  city: null,
  address: null,
  noticeKind: "contract",
  noticeTypeRaw: "Avis de marché (fictif)",
  publishedAt: day(-2).toISOString().slice(0, 10),
  deadlineAt: day(20).toISOString(),
  sourceUpdatedAt: null,
  awardedAt: null,
  amount: null,
  currency: null,
  durationText: null,
  durationMonths: null,
  selectionCriteria: null,
  procedureType: null,
  cpvCodes: [],
  lots: [],
  crossRefs: [],
  reliability: "high",
  licence: "Données fictives de démonstration",
  raw: { demo: true },
  ...o,
});
const notices: NormalizedNotice[] = [
  base(1, { title: "[DÉMO] Vérifications générales périodiques des appareils de levage", buyerName: "Ville fictive de Démoville", department: "69", city: "Lyon", cpvCodes: ["71631100"] }),
  base(2, { title: "[DÉMO] Vérification périodique des installations électriques des écoles", buyerName: "Ville fictive de Démoville", department: "69", deadlineAt: day(4).toISOString(), cpvCodes: ["71631300"] }),
  base(3, { title: "[DÉMO] Contrôles réglementaires multisites des bâtiments départementaux", buyerName: "Département fictif", department: "38", lots: [{ number: "2", title: "Appareils de levage et ponts roulants", description: null, cpvCodes: [] }, { number: "3", title: "Installations électriques", description: null, cpvCodes: [] }] }),
  base(4, { title: "[DÉMO] Travaux de rénovation électrique du gymnase", buyerName: "Commune fictive", department: "42", cpvCodes: ["45310000"] }),
  base(5, { title: "[DÉMO] VGP des nacelles et chariots élévateurs", buyerName: "Hôpital fictif", department: "13", noticeKind: "award", noticeTypeRaw: "Avis d'attribution (fictif)", deadlineAt: null, durationMonths: 36, durationText: "36 mois", awardedAt: day(-40).toISOString().slice(0, 10) }),
  base(6, { title: "[DÉMO] Thorough examination of lifting equipment (LOLER)", buyerName: "Fictive Port Authority", country: "BE", deadlineAt: day(30).toISOString() }),
];
const { db, close, migrate } = await openDb();
await migrate();
await db.insert(sources).values({ id: "demo", enabled: false }).onConflictDoNothing();
const stats = await ingestNotices(db, notices, { isDemo: true });
console.log("Données de démonstration (fictives) :", stats);
await close();
