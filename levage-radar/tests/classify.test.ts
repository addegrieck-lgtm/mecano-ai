import { describe, expect, it } from "vitest";
import { categorize, classify, matchCpv } from "@/lib/radar/classify";
import { baseScore, finalScore, personalFactors } from "@/lib/radar/score";
import { duplicateReason } from "@/lib/radar/dedup";
import { departmentFromPostalCode, distanceKm, normalizeDepartment } from "@/lib/radar/geo";
import { NOW } from "./helpers";

describe("classification levage / électricité", () => {
  it("reconnaît une VGP d'appareils de levage comme INSPECTION levage", () => {
    const c = classify({ title: "Vérifications générales périodiques (VGP) des appareils et accessoires de levage" });
    expect(c.domain).toBe("LEVAGE");
    expect(c.serviceType).toBe("INSPECTION");
    expect(c.details.explanation.join(" ")).toMatch(/levage/i);
  });

  it("reconnaît une vérification électrique périodique", () => {
    const c = classify({ title: "Vérification périodique des installations électriques des bâtiments communaux" });
    expect(c.domain).toBe("ELECTRICITE");
    expect(c.serviceType).toBe("INSPECTION");
  });

  it("ne confond pas des TRAVAUX électriques avec une vérification", () => {
    const c = classify({ title: "Travaux de rénovation électrique - lot 05 électricité CFO/CFA", cpvCodes: ["45311000-0"] });
    expect(c.domain).toBe("ELECTRICITE");
    expect(c.serviceType).toBe("TRAVAUX");
    const cat = categorize(c, { noticeKind: "contract", deadlineAt: "2026-12-01" }, NOW);
    expect(cat.category).toBe("SIGNAL");
    expect(c.details.explanation.join(" ")).toMatch(/pas une mission de vérification/);
  });

  it("détecte un marché multiservices de contrôles réglementaires sans le mot levage dans le titre", () => {
    const c = classify({ title: "Contrôles réglementaires et vérifications périodiques des bâtiments et équipements", description: "Marché multisites." });
    expect(c.domain).toBe("MIXTE");
    expect(["MULTISERVICE", "INSPECTION"]).toContain(c.serviceType);
  });

  it("détecte un lot pertinent dans un marché plus large", () => {
    const c = classify({
      title: "Maintenance multitechnique du patrimoine départemental",
      lots: [{ title: "Lot 3 : vérification des ponts roulants et palans" }, { title: "Lot 1 : chauffage" }],
    });
    expect(["LEVAGE", "MIXTE"]).toContain(c.domain);
  });

  it("classe hors domaine un marché sans lien", () => {
    const c = classify({ title: "Fourniture de denrées alimentaires pour la restauration scolaire" });
    expect(c.domain).toBe("AUCUN");
    expect(categorize(c, { noticeKind: "contract", deadlineAt: null }, NOW).category).toBe("IRRELEVANT");
  });

  it("ne retient pas un domaine sur un terme générique isolé", () => {
    const c = classify({ title: "Contrôle d'accès électrique du parking" });
    expect(c.domain).toBe("AUCUN");
  });

  it("classe les sources anglaises (TED)", () => {
    expect(classify({ title: "Thorough examination of lifting equipment (LOLER)" }).domain).toBe("LEVAGE");
    expect(classify({ title: "Periodic electrical inspection and testing (EICR)" }).domain).toBe("ELECTRICITE");
  });

  it("utilise les codes CPV par préfixe le plus spécifique", () => {
    expect(matchCpv("71631100-1")?.label).toMatch(/machines/);
    expect(matchCpv("45310000")?.serviceType).toBe("TRAVAUX");
    expect(matchCpv("15000000")).toBeNull();
  });
});

describe("catégories", () => {
  const c = classify({ title: "Vérification des appareils de levage" });
  it("consultation ouverte / clôturée selon la date limite publiée", () => {
    expect(categorize(c, { noticeKind: "contract", deadlineAt: "2026-11-01" }, NOW).category).toBe("ACTIVE");
    expect(categorize(c, { noticeKind: "contract", deadlineAt: "2026-10-01" }, NOW).category).toBe("CLOSED");
  });
  it("date limite absente : active mais signalée", () => {
    const r = categorize(c, { noticeKind: "contract", deadlineAt: null }, NOW);
    expect(r.category).toBe("ACTIVE");
    expect(r.reason).toMatch(/non publiée/);
  });
  it("attribution, pré-information, annulation, appel à fournisseurs", () => {
    expect(categorize(c, { noticeKind: "award", deadlineAt: null }, NOW).category).toBe("AWARDED");
    expect(categorize(c, { noticeKind: "award", deadlineAt: null, durationMonths: 36 }, NOW).category).toBe("CONTRACT_WATCH");
    expect(categorize(c, { noticeKind: "prior_info", deadlineAt: null }, NOW).category).toBe("UPCOMING");
    expect(categorize(c, { noticeKind: "cancellation", deadlineAt: null }, NOW).category).toBe("CLOSED");
    const sc = classify({ title: "Appel à manifestation d'intérêt : référencement de prestataires pour la vérification des appareils de levage" });
    expect(categorize(sc, { noticeKind: "contract", deadlineAt: "2026-12-01" }, NOW).category).toBe("SUPPLIER_CALL");
  });
});

describe("score explicable", () => {
  it("est borné 0..100 et chaque facteur est listé", () => {
    const c = classify({ title: "VGP des appareils de levage et ponts roulants", cpvCodes: ["71631100"] });
    const { score, factors } = baseScore(
      { classification: c, category: "ACTIVE", deadlineAt: "2026-11-30", publishedAt: "2026-10-10", amount: 80000, reliability: "high", buyerHistoryCount: 3, titleHasDomainTerm: true },
      NOW,
    );
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThanOrEqual(100);
    expect(factors.reduce((s, f) => s + f.points, 0)).toBeGreaterThanOrEqual(score);
    expect(factors.map((f) => f.label).join(" ")).toMatch(/inspection/i);
  });

  it("pénalise les travaux et les consultations clôturées", () => {
    const c = classify({ title: "Travaux d'installation électrique" });
    const s1 = baseScore({ classification: c, category: "SIGNAL", deadlineAt: null, publishedAt: "2026-10-10", amount: null, reliability: "high", buyerHistoryCount: 0, titleHasDomainTerm: true }, NOW);
    const c2 = classify({ title: "Vérification des installations électriques" });
    const s2 = baseScore({ classification: c2, category: "ACTIVE", deadlineAt: "2026-11-30", publishedAt: "2026-10-10", amount: null, reliability: "high", buyerHistoryCount: 0, titleHasDomainTerm: true }, NOW);
    expect(s2.score).toBeGreaterThan(s1.score);
  });

  it("applique les préférences personnelles (rayon, départements, domaines)", () => {
    const near = personalFactors({ department: "69", domain: "LEVAGE", country: "FR" }, { homeDepartment: "42", radiusKm: 100 });
    expect(near.some((f) => f.points > 0)).toBe(true);
    const far = personalFactors({ department: "29", domain: "LEVAGE", country: "FR" }, { homeDepartment: "69", radiusKm: 100 });
    expect(far.some((f) => f.points < 0)).toBe(true);
    expect(finalScore(50, far)).toBeLessThan(50);
    expect(finalScore(0, near)).toBe(0);
  });
});

describe("déduplication", () => {
  const cand = {
    id: "x",
    title: "Vérifications périodiques des appareils de levage",
    buyerName: "Ville de Lyon",
    publishedAt: "2026-10-01",
    department: "69",
    reference: "26-100001",
    refs: ["26-100001"],
    urls: ["https://www.boamp.fr/pages/avis/?q=idweb:26-100001"],
  };
  it("par référence croisée", () => {
    expect(duplicateReason({ sourceRef: "600001-2026", title: "Autre titre", buyerName: null, publishedAt: null, department: null, crossRefs: ["26-100001"], url: null, noticeKind: "contract" }, cand)).toMatch(/Référence/);
  });
  it("par acheteur + titre similaire + dates proches", () => {
    expect(
      duplicateReason({ sourceRef: "y", title: "Vérification périodique des appareils de levage", buyerName: "VILLE DE LYON", publishedAt: "2026-10-03", department: "69", crossRefs: [], url: null, noticeKind: "contract" }, cand),
    ).toMatch(/titre similaire/);
  });
  it("pas de fusion entre acheteurs différents", () => {
    expect(
      duplicateReason({ sourceRef: "y", title: "Vérifications périodiques des appareils de levage", buyerName: "Ville de Paris", publishedAt: "2026-10-01", department: "75", crossRefs: [], url: null, noticeKind: "contract" }, cand),
    ).toBeNull();
  });
});

describe("géographie", () => {
  it("normalise les départements", () => {
    expect(normalizeDepartment("1")).toBe("01");
    expect(normalizeDepartment("2a")).toBe("2A");
    expect(normalizeDepartment("974")).toBe("974");
    expect(normalizeDepartment("99")).toBeNull();
    expect(departmentFromPostalCode("69003")).toBe("69");
    expect(departmentFromPostalCode("20090")).toBe("2A");
  });
  it("calcule une distance approximative", () => {
    const d = distanceKm("75", "69")!;
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(420);
  });
});
