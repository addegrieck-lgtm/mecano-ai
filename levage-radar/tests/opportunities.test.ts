import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/lib/db";
import { sources, syncRuns } from "@/lib/db/schema";
import { ingestNotices } from "@/lib/radar/ingest";
import {
  addNote,
  assignOpportunity,
  createAlert,
  createTask,
  dashboardStats,
  getOpportunity,
  listTasks,
  parseSearch,
  saveSearch,
  searchOpportunities,
  setTaskDone,
  setTrackingStatus,
  toggleFavorite,
} from "@/lib/services/opportunities";
import { exportOpportunitiesCsv, opportunityPdf, opportunitySummaryText } from "@/lib/services/opp-exports";
import { generateDailyReport, reportText, type DailyReportContent } from "@/lib/radar/daily-report";
import { answerQuestion } from "@/lib/assistant/engine";
import { updatePreferences } from "@/lib/services/users";
import { createOrgWithUsers, createTestDb, notice } from "./helpers";

let db: DB;
let close: () => Promise<void>;
const now = new Date();
const inDays = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString().slice(0, 10);

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(sources).values([{ id: "boamp" }, { id: "ted" }]);
  await ingestNotices(db, [
    notice({ sourceRef: "L1", title: "VGP des appareils de levage du port", buyerName: "Port de Testville", department: "13", deadlineAt: inDays(20), publishedAt: daysAgo(1) }),
    notice({ sourceRef: "E1", title: "Vérification périodique des installations électriques des écoles", buyerName: "Ville de Testville", department: "69", deadlineAt: inDays(5), publishedAt: daysAgo(2), cpvCodes: ["71631300"], description: null }),
    notice({ sourceRef: "W1", title: "Travaux d'installation électrique du gymnase", buyerName: "Ville de Testville", department: "69", cpvCodes: ["45310000"], description: null }),
    notice({ sourceRef: "A1", title: "Contrôle des ponts roulants", buyerName: "Métropole Test", noticeKind: "award", noticeTypeRaw: "Résultat de marché", department: "59", deadlineAt: null, durationMonths: 48 }),
    notice({ sourceRef: "X1", title: "Fourniture de mobilier scolaire", description: null, cpvCodes: [] }),
  ]);
});
afterEach(async () => close());

describe("recherche avancée", () => {
  it("filtre par domaine (mixte inclus) et masque le hors-domaine", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const lev = await searchOpportunities(ctx.BUSINESS, parseSearch({ domain: "LEVAGE" }));
    expect(lev.items.map((o) => o.reference).sort()).toEqual(["A1", "L1"]);
    const all = await searchOpportunities(ctx.BUSINESS, parseSearch({}));
    expect(all.items.find((o) => o.reference === "X1")).toBeUndefined();
    const withIrr = await searchOpportunities(ctx.BUSINESS, parseSearch({ includeIrrelevant: "1" }));
    expect(withIrr.items.find((o) => o.reference === "X1")).toBeDefined();
  });

  it("consultations ouvertes, catégories, département, rayon, plein texte, score min", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const open = await searchOpportunities(ctx.BUSINESS, parseSearch({ open: "1" }));
    expect(open.items.every((o) => o.isOpen)).toBe(true);
    expect(open.items.map((o) => o.reference).sort()).toEqual(["E1", "L1"]);
    expect((await searchOpportunities(ctx.BUSINESS, parseSearch({ category: "AWARDED,CONTRACT_WATCH" }))).items.map((o) => o.reference)).toEqual(["A1"]);
    expect((await searchOpportunities(ctx.BUSINESS, parseSearch({ department: "69" }))).total).toBe(2);
    expect((await searchOpportunities(ctx.BUSINESS, parseSearch({ radiusFrom: "42", radiusKm: "80" }))).items.every((o) => o.department === "69")).toBe(true);
    expect((await searchOpportunities(ctx.BUSINESS, parseSearch({ q: "écoles électriques" }))).items[0]?.reference).toBe("E1");
    const min = await searchOpportunities(ctx.BUSINESS, parseSearch({ minScore: "60" }));
    expect(min.items.every((o) => o.score >= 60)).toBe(true);
    expect((await searchOpportunities(ctx.BUSINESS, parseSearch({ sort: "deadline", open: "1" }))).items[0].reference).toBe("E1");
  });

  it("rejette des filtres invalides", () => {
    expect(() => parseSearch({ publishedFrom: "hier" })).toThrow(/Date invalide/);
    expect(() => parseSearch({ domain: "PLOMBERIE" })).toThrow();
  });

  it("refuse l'accès au radar sans permission", async () => {
    const { ctx } = await createOrgWithUsers(db);
    await expect(searchOpportunities(ctx.INSPECTOR_LIFT, parseSearch({}))).rejects.toThrow(/Accès refusé/);
  });

  it("préférences personnelles : rayon modifie le score affiché", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const before = (await searchOpportunities(ctx.BUSINESS, parseSearch({ q: "écoles" }))).items[0].score;
    await updatePreferences(ctx.BUSINESS, { homeDepartment: "69", radiusKm: 50, digestFrequency: "daily", emailEnabled: false });
    const after = (await searchOpportunities(ctx.BUSINESS, parseSearch({ q: "écoles" }))).items[0];
    expect(after.score).toBeGreaterThan(before);
    expect(after.personal.length).toBeGreaterThan(0);
  });
});

describe("suivi commercial", () => {
  it("statuts, favoris, responsable, notes, tâches, historique d'audit — isolés par organisation", async () => {
    const a = await createOrgWithUsers(db, "Org A");
    const b = await createOrgWithUsers(db, "Org B");
    const id = (await searchOpportunities(a.ctx.BUSINESS, parseSearch({ q: "port" }))).items[0].id;
    await setTrackingStatus(a.ctx.BUSINESS, id, "EN_ANALYSE");
    expect(await toggleFavorite(a.ctx.BUSINESS, id)).toBe(true);
    await assignOpportunity(a.ctx.BUSINESS, id, a.ctx.ADMIN.user.id);
    await expect(assignOpportunity(a.ctx.BUSINESS, id, b.ctx.ADMIN.user.id)).rejects.toThrow(/inconnu/);
    await addNote(a.ctx.BUSINESS, "opportunity", id, "Appeler l'acheteur");
    const task = await createTask(a.ctx.BUSINESS, { title: "Préparer le dossier", opportunityId: id, dueAt: inDays(3), remindAt: inDays(1) });
    const d = await getOpportunity(a.ctx.BUSINESS, id);
    expect(d.tracking?.status).toBe("EN_ANALYSE");
    expect(d.tracking?.favorite).toBe(true);
    expect(d.notes).toHaveLength(1);
    expect(d.tasks).toHaveLength(1);
    // L'autre organisation ne voit ni le suivi ni les notes
    const other = await getOpportunity(b.ctx.BUSINESS, id);
    expect(other.tracking).toBeNull();
    expect(other.notes).toHaveLength(0);
    await expect(setTaskDone(b.ctx.BUSINESS, task.id, true)).rejects.toThrow(/introuvable/);
    await setTaskDone(a.ctx.BUSINESS, task.id, true);
    expect(await listTasks(a.ctx.BUSINESS, { scope: "all", done: true })).toHaveLength(1);
  });

  it("« non pertinent » retire de la liste par défaut ; « transmis » est une déclaration manuelle", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const id = (await searchOpportunities(ctx.BUSINESS, parseSearch({ q: "port" }))).items[0].id;
    await setTrackingStatus(ctx.BUSINESS, id, "NON_PERTINENT", "Hors zone");
    expect((await searchOpportunities(ctx.BUSINESS, parseSearch({ q: "port" }))).total).toBe(0);
    expect((await searchOpportunities(ctx.BUSINESS, parseSearch({ q: "port", status: "NON_PERTINENT" }))).total).toBe(1);
    await setTrackingStatus(ctx.BUSINESS, id, "TRANSMIS_MANUELLEMENT");
    await expect(setTrackingStatus(ctx.READER, id, "EN_ANALYSE")).rejects.toThrow(/Accès refusé/);
  });

  it("recherches enregistrées et alertes", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const s = await saveSearch(ctx.BUSINESS, "Levage ouvert", "?domain=LEVAGE&open=1");
    expect(s.query).toBe("domain=LEVAGE&open=1");
    await expect(saveSearch(ctx.BUSINESS, "Bad", "publishedFrom=demain")).rejects.toThrow();
    await expect(createAlert(ctx.BUSINESS, { name: "Mot-clé", kind: "keyword" })).rejects.toThrow(/Mot-clé requis/);
    await createAlert(ctx.BUSINESS, { name: "Ponts", kind: "keyword", keyword: "ponts roulants" });
  });
});

describe("tableau de bord, exports, rapport quotidien, assistant", () => {
  it("tableau de bord : indicateurs réels et sources en défaut", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const s = await dashboardStats(ctx.BUSINESS);
    expect(s.levage).toBe(2);
    expect(s.elec).toBe(2);
    expect(s.deadlines).toBe(1);
    expect(s.awarded).toBe(1);
    expect(s.sourceProblems.map((p) => p.id).sort()).toEqual(["boamp", "ted"]); // jamais collectées
    expect(s.byRegion.find((r) => r.region === "Auvergne-Rhône-Alpes")?.n).toBe(2);
  });

  it("export CSV avec champs choisis et protection des formules ; permission requise", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const { csv } = await exportOpportunitiesCsv(ctx.BUSINESS, parseSearch({}), ["title", "buyer", "score"]);
    expect(csv.startsWith("﻿Titre;Acheteur;Score")).toBe(true);
    expect(csv.split("\r\n").length).toBeGreaterThan(3);
    await expect(exportOpportunitiesCsv(ctx.READER, parseSearch({}), [])).rejects.toThrow(/Accès refusé/);
  });

  it("synthèse texte et PDF", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const id = (await searchOpportunities(ctx.BUSINESS, parseSearch({ q: "port" }))).items[0].id;
    expect(await opportunitySummaryText(ctx.BUSINESS, id)).toMatch(/à reprendre manuellement/);
    const pdf = await opportunityPdf(ctx.BUSINESS, id);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("rapport quotidien : « échec » si aucune source n'a été collectée (pas de faux succès)", async () => {
    const { org } = await createOrgWithUsers(db);
    const r = await generateDailyReport(db, org.id);
    const content = r.content as unknown as DailyReportContent;
    expect(r.status).toBe("failed");
    expect(content.statusMessage).toMatch(/ne reflète PAS/);
    expect(reportText(content, (p) => `https://x${p}`).subject).toMatch(/NON effectuée/);
  });

  it("rapport quotidien : « ok » après collectes réussies, sections renseignées et liens", async () => {
    const { org } = await createOrgWithUsers(db);
    for (const id of ["boamp", "ted"]) await db.insert(syncRuns).values({ sourceId: id, trigger: "cron", status: "success", finishedAt: new Date() });
    const r = await generateDailyReport(db, org.id);
    const c = r.content as unknown as DailyReportContent;
    expect(r.status).toBe("ok");
    expect(c.sections.find((s) => s.key === "new_levage")!.items.length).toBe(1);
    expect(c.sections.find((s) => s.key === "deadlines")!.items.length).toBe(1);
    const txt = reportText(c, (p) => `https://app.test${p}`);
    expect(txt.text).toContain("https://app.test/radar/");
  });

  it("assistant (règles) : répond depuis les données, signale les manques, ne prétend rien d'autre", async () => {
    const { ctx } = await createOrgWithUsers(db);
    const r = await answerQuestion(ctx.BUSINESS, "Quelles opportunités électriques restent ouvertes ?");
    expect(r.items.length).toBe(1);
    expect(r.items[0].title).toMatch(/électriques/);
    expect(r.missing.join(" ")).toMatch(/BOAMP et TED/);
    const buyers = await answerQuestion(ctx.BUSINESS, "Quels acheteurs publient régulièrement des marchés de vérification ?");
    expect(buyers.paragraphs[0]).toBeTruthy();
    const resume = await answerQuestion(ctx.BUSINESS, "Résume cette consultation et liste les pièces demandées", { oppIds: [r.items[0].id] });
    expect(resume.missing.join(" ")).toMatch(/ne sont pas collectés/);
    await expect(answerQuestion(ctx.INSPECTOR_LIFT, "x")).rejects.toThrow(/Accès refusé/);
  });
});
