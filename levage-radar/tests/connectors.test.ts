import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boampNoticeKind, boampQueries, createBoampConnector, mapBoampRecord } from "@/lib/connectors/boamp";
import { createTedConnector, mapTedNotice, tedNoticeKind, tedQueries } from "@/lib/connectors/ted";
import { httpRequest } from "@/lib/connectors/http";
import { BOAMP_RECORD, TED_NOTICE } from "./fixtures/connectors";

const noSleep = async () => {};

describe("BOAMP : transformation", () => {
  it("normalise un enregistrement sans inventer de valeur", () => {
    const n = mapBoampRecord(BOAMP_RECORD)!;
    expect(n.sourceRef).toBe("26-999001");
    expect(n.department).toBe("69");
    expect(n.noticeKind).toBe("contract");
    expect(n.publishedAt).toBe("2026-10-08");
    expect(n.deadlineAt).toBe(new Date("2026-11-11T12:00:00+01:00").toISOString());
    expect(n.cpvCodes).toContain("71631100");
    expect(n.amount).toBe(45000);
    expect(n.durationMonths).toBe(36);
    expect(n.lots).toHaveLength(2);
    expect(n.description).toMatch(/ponts roulants/);
    expect(n.city).toBe("Lyon");
  });

  it("laisse vides les champs absents", () => {
    const n = mapBoampRecord({ idweb: "1", objet: "Vérification des installations électriques" })!;
    expect(n.deadlineAt).toBeNull();
    expect(n.amount).toBeNull();
    expect(n.department).toBeNull();
    expect(n.buyerName).toBeNull();
  });

  it("interprète la nature de l'avis", () => {
    expect(boampNoticeKind({ nature_categorise_libelle: "Résultat de marché" })).toBe("award");
    expect(boampNoticeKind({ nature_libelle: "Avis rectificatif" })).toBe("corrigendum");
    expect(boampNoticeKind({ nature_libelle: "Avis de pré-information" })).toBe("prior_info");
    expect(boampNoticeKind({ nature_libelle: "Avis d'annulation" })).toBe("cancellation");
  });

  it("construit des requêtes ODSQL incrémentales", () => {
    const q = boampQueries("2026-10-01");
    expect(q.length).toBeGreaterThan(1);
    expect(q[0]).toContain('dateparution >= "2026-10-01"');
    expect(q[0]).toContain('"appareils de levage"');
  });

  it("interroge l'API et pagine (fetch simulé)", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ total_count: 1, results: [BOAMP_RECORD] }), { status: 200 });
    }) as typeof fetch;
    const c = createBoampConnector({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    const r = await c.fetch({ since: "2026-10-01", maxPages: 2, log: () => {} });
    expect(r.notices).toHaveLength(1); // dédupliqué entre requêtes
    expect(calls[0]).toContain("boamp-datadila.opendatasoft.com");
    expect(new URL(calls[0]).searchParams.get("order_by")).toBe("dateparution desc");
  });

  it("échoue explicitement si aucune requête n'aboutit", async () => {
    const fetchImpl = (async () => new Response("boom", { status: 403 })) as unknown as typeof fetch;
    const c = createBoampConnector({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    await expect(c.fetch({ since: "2026-10-01", maxPages: 1, log: () => {} })).rejects.toThrow(/403/);
  });
});

describe("TED : transformation", () => {
  it("normalise un avis multilingue", () => {
    const n = mapTedNotice(TED_NOTICE)!;
    expect(n.sourceRef).toBe("654321-2026");
    expect(n.title).toMatch(/installations électriques/);
    expect(n.country).toBe("FR");
    expect(n.buyerName).toBe("Région fictive");
    expect(n.publishedAt).toBe("2026-10-09");
    expect(n.amount).toBe(120000);
    expect(n.currency).toBe("EUR");
    expect(n.url).toBe("https://ted.europa.eu/fr/notice/-/detail/654321-2026");
  });

  it("types d'avis", () => {
    expect(tedNoticeKind("can-standard")).toBe("award");
    expect(tedNoticeKind("pin-only")).toBe("prior_info");
    expect(tedNoticeKind("cn-standard")).toBe("contract");
    expect(tedNoticeKind("corr")).toBe("corrigendum");
  });

  describe("requêtes", () => {
    const prev = process.env.TED_COUNTRIES;
    beforeEach(() => {
      process.env.TED_COUNTRIES = "FRA,BEL";
    });
    afterEach(() => {
      process.env.TED_COUNTRIES = prev;
    });
    it("filtre date + pays", () => {
      const q = tedQueries("2026-10-01");
      expect(q[0]).toContain("PD>=20261001");
      expect(q[0]).toContain("buyer-country=FRA OR buyer-country=BEL");
      expect(q[0]).toContain('FT~"appareils de levage"');
    });
  });

  it("repli sur un jeu de champs minimal si l'API refuse un champ (400)", async () => {
    const bodies: { fields: string[] }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      if (body.fields.includes("deadline")) return new Response('{"message":"unknown field deadline"}', { status: 400 });
      return new Response(JSON.stringify({ notices: [TED_NOTICE], totalNoticeCount: 1 }), { status: 200 });
    }) as typeof fetch;
    const c = createTedConnector({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    const r = await c.fetch({ since: "2026-10-01", maxPages: 1, log: () => {} });
    expect(r.notices).toHaveLength(1);
    expect(r.warnings.join(" ")).toMatch(/jeu minimal/);
    expect(bodies[1].fields).not.toContain("deadline");
  });
});

describe("HTTP : reprises", () => {
  it("réessaie sur 503 puis réussit", async () => {
    let n = 0;
    const fetchImpl = (async () => (++n < 3 ? new Response("down", { status: 503 }) : new Response("{}", { status: 200 }))) as unknown as typeof fetch;
    const res = await httpRequest("https://example.org/x", {}, { fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    expect(res.status).toBe(200);
    expect(n).toBe(3);
  });
  it("abandonne après le nombre maximal de tentatives", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    await expect(httpRequest("https://example.org/y", {}, { fetchImpl, sleep: noSleep, minIntervalMs: 0, retries: 2 })).rejects.toThrow(/3 tentatives/);
  });
  it("ne réessaie pas une erreur 4xx", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response("bad", { status: 404 });
    }) as unknown as typeof fetch;
    await expect(httpRequest("https://example.org/z", {}, { fetchImpl, sleep: noSleep, minIntervalMs: 0 })).rejects.toThrow(/404/);
    expect(n).toBe(1);
  });
});
