import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { lots, notices, opportunities, opportunityHistory, sources, syncRuns } from "@/lib/db/schema";
import { ingestNotices, closeExpired } from "@/lib/radar/ingest";
import { runCollection } from "@/lib/radar/collect";
import { mapBoampRecord } from "@/lib/connectors/boamp";
import { mapTedNotice } from "@/lib/connectors/ted";
import type { Connector } from "@/lib/connectors/types";
import { createTestDb, notice, NOW } from "./helpers";
import { BOAMP_AWARD_RECORD, BOAMP_RECORD, TED_NOTICE } from "./fixtures/connectors";

let db: DB;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(sources).values([{ id: "boamp" }, { id: "ted" }]);
});
afterEach(async () => close());

describe("ingestion", () => {
  it("crée une opportunité qualifiée, avec lots, acheteur et historique", async () => {
    const stats = await ingestNotices(db, [mapBoampRecord(BOAMP_RECORD)!], { now: NOW });
    expect(stats.created).toBe(1);
    const [o] = await db.select().from(opportunities);
    expect(o.domain).toBe("LEVAGE");
    expect(o.category).toBe("ACTIVE");
    expect(o.serviceType).toBe("INSPECTION");
    expect(o.region).toBe("Auvergne-Rhône-Alpes");
    expect(o.baseScore).toBeGreaterThan(50);
    expect(o.scoreFactors.length).toBeGreaterThan(2);
    expect(o.publishedAmount).toBe("45000");
    expect(await db.select().from(lots)).toHaveLength(2);
    expect(await db.select().from(opportunityHistory)).toHaveLength(1);
  });

  it("ne recrée pas un avis inchangé et historise une modification", async () => {
    const n = notice({ sourceRef: "A1" });
    await ingestNotices(db, [n], { now: NOW });
    expect((await ingestNotices(db, [n], { now: NOW })).unchanged).toBe(1);
    const changed = { ...n, deadlineAt: "2026-11-30T12:00:00.000Z" };
    expect((await ingestNotices(db, [changed], { now: NOW })).updated).toBe(1);
    const hist = await db.select().from(opportunityHistory);
    const upd = hist.find((h) => h.kind === "updated")!;
    expect(upd.changes.deadlineAt).toBeDefined();
  });

  it("fusionne un doublon d'une autre source sans perdre les références", async () => {
    await ingestNotices(db, [notice({ sourceRef: "26-1", buyerName: "Ville de Testville", title: "Vérification des installations électriques des écoles" })], { now: NOW });
    const stats = await ingestNotices(
      db,
      [notice({ sourceId: "ted", sourceRef: "1111-2026", buyerName: "VILLE DE TESTVILLE", title: "Vérifications des installations électriques des écoles", amount: 50000, currency: "EUR", publishedAt: "2026-10-07" })],
      { now: NOW },
    );
    expect(stats.merged).toBe(1);
    expect(await db.select().from(opportunities)).toHaveLength(1);
    const ns = await db.select().from(notices);
    expect(ns.map((n) => n.sourceId).sort()).toEqual(["boamp", "ted"]);
    const [o] = await db.select().from(opportunities);
    expect(o.publishedAmount).toBe("50000"); // complété depuis la seconde source
  });

  it("fait évoluer une consultation en marché attribué via l'avis d'attribution lié", async () => {
    await ingestNotices(db, [mapBoampRecord(BOAMP_RECORD)!], { now: NOW });
    const stats = await ingestNotices(db, [mapBoampRecord(BOAMP_AWARD_RECORD)!], { now: new Date("2026-12-21") });
    expect(stats.merged).toBe(1);
    const [o] = await db.select().from(opportunities);
    expect(["AWARDED", "CONTRACT_WATCH"]).toContain(o.category);
    expect(o.awardedAt).toBe("2026-12-20");
  });

  it("garde les résultats hors domaine marqués non pertinents", async () => {
    const s = await ingestNotices(db, [notice({ title: "Fourniture de repas", description: null, cpvCodes: [] })], { now: NOW });
    expect(s.irrelevant).toBe(1);
    const [o] = await db.select().from(opportunities);
    expect(o.category).toBe("IRRELEVANT");
    expect(o.baseScore).toBe(0);
  });

  it("clôture les consultations dont la date limite est dépassée", async () => {
    await ingestNotices(db, [notice({ deadlineAt: "2026-10-20T10:00:00.000Z" })], { now: NOW });
    expect(await closeExpired(db, new Date("2026-10-21"))).toBe(1);
    const [o] = await db.select().from(opportunities);
    expect(o.category).toBe("CLOSED");
  });

  it("intègre un avis TED", async () => {
    await ingestNotices(db, [mapTedNotice(TED_NOTICE)!], { now: NOW });
    const [o] = await db.select().from(opportunities);
    expect(o.domain).toBe("ELECTRICITE");
    expect(o.country).toBe("FR");
    expect(o.primarySourceId).toBe("ted");
  });
});

describe("collecte", () => {
  const ok: Connector = {
    info: { id: "boamp", name: "BOAMP", status: "implemented", geography: "", dataTypes: [], access: "", method: "", frequency: "", licence: "", officialUrl: "", coverageLimits: [] },
    fetch: async () => ({ notices: [notice({ sourceRef: "C1" })], warnings: [], nextCursor: {} }),
  };
  const ko: Connector = { info: { ...ok.info, id: "ted" }, fetch: async () => Promise.reject(new Error("API indisponible")) };

  it("journalise une collecte réussie et une source en échec sans bloquer les autres", async () => {
    const res = await runCollection(db, { trigger: "manual", connectors: [ok, ko], now: NOW });
    expect(res.find((r) => r.sourceId === "boamp")?.status).toBe("success");
    expect(res.find((r) => r.sourceId === "ted")?.status).toBe("failed");
    const runs = await db.select().from(syncRuns);
    expect(runs).toHaveLength(2);
    const [ted] = await db.select().from(sources).where(eq(sources.id, "ted"));
    expect(ted.consecutiveFailures).toBe(1);
    expect(ted.lastError).toMatch(/indisponible/);
    expect(ted.lastSuccessAt).toBeNull();
  });

  it("relance d'une seule source", async () => {
    const res = await runCollection(db, { trigger: "retry", connectors: [ok, ko], sourceIds: ["boamp"], now: NOW });
    expect(res).toHaveLength(1);
  });

  it("collecte incrémentale : part de la dernière réussite − 2 jours", async () => {
    let since = "";
    const spy: Connector = { ...ok, fetch: async (p) => ((since = p.since), { notices: [], warnings: [], nextCursor: {} }) };
    await runCollection(db, { trigger: "cron", connectors: [spy], now: NOW });
    expect(since).toBe("2026-09-12"); // premier passage : 30 jours
    await runCollection(db, { trigger: "cron", connectors: [spy], now: new Date("2026-10-13T08:00:00Z") });
    expect(since).toBe("2026-10-10");
  });
});
