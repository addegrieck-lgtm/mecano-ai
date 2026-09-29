import { describe, expect, it } from "vitest";
import { computeTotals, formatEuro, PRICE_TO_FILL } from "@/lib/quotes/calc";
import { suggestQuoteLines } from "@/lib/quotes/suggest";
import { as, demoStore } from "./helpers";

describe("Calcul des devis", () => {
  it("calcule HT, TVA et TTC", () => {
    const t = computeTotals(
      [
        { kind: "LABOR", quantity: 1.5, unit_price: 68 },
        { kind: "PART", quantity: 2, unit_price: 12.5 },
        { kind: "SERVICE", quantity: 1, unit_price: 59 },
      ],
      20,
    );
    expect(t.laborHT).toBe(102);
    expect(t.partsHT).toBe(25);
    expect(t.servicesHT).toBe(59);
    expect(t.totalHT).toBe(186);
    expect(t.vatAmount).toBe(37.2);
    expect(t.totalTTC).toBe(223.2);
    expect(t.laborHours).toBe(1.5);
  });

  it("arrondit au centime", () => {
    const t = computeTotals([{ kind: "PART", quantity: 3, unit_price: 0.333 }], 20);
    expect(t.totalHT).toBe(1);
    expect(t.totalTTC).toBe(1.2);
  });

  it("exclut les lignes sans prix et les compte", () => {
    const t = computeTotals(
      [
        { kind: "PART", quantity: 1, unit_price: null },
        { kind: "LABOR", quantity: 1, unit_price: 50 },
      ],
      20,
    );
    expect(t.missingPrices).toBe(1);
    expect(t.totalTTC).toBe(60);
    expect(formatEuro(null)).toBe(PRICE_TO_FILL);
  });

  it("ajoute des lignes et recalcule", async () => {
    const store = demoStore();
    const emma = await as(store, "u-emma");
    const q = await emma.work.createQuote({ vehicle_id: "v-golf", items: [{ kind: "SERVICE", label: "Vidange", quantity: 1, unit_price: 89 }] });
    let view = await emma.work.quote(q.id);
    expect(view.totals.totalTTC).toBe(106.8);
    await emma.work.updateQuote(q.id, {
      items: [...view.items, { kind: "PART", label: "Filtre à huile", quantity: 1, unit_price: 9 }],
    });
    view = await emma.work.quote(q.id);
    expect(view.items).toHaveLength(2);
    expect(view.totals.totalHT).toBe(98);
    expect(view.totals.totalTTC).toBe(117.6);
  });

  it("refuse d'envoyer un devis contenant des prix à renseigner", async () => {
    const store = demoStore();
    const emma = await as(store, "u-emma");
    await expect(emma.work.setQuoteStatus("q-draft-1", "SENT")).rejects.toThrow(/Prix à renseigner/);
  });

  it("la suggestion n'invente aucun prix", () => {
    const lines = suggestQuoteLines({ causeId: "catalyst", catalog: [], parts: [], laborHourlyRate: null });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.unit_price === null)).toBe(true);
    expect(lines.some((l) => l.kind === "PART" && /Catalyseur/.test(l.label))).toBe(true);
  });

  it("la suggestion utilise le catalogue et les pièces du garage", async () => {
    const store = demoStore();
    const catalog = (await store.list("price_catalog")).filter((c) => c.garage_id === "g-dupont");
    const parts = (await store.list("parts")).filter((c) => c.garage_id === "g-dupont");
    const lines = suggestQuoteLines({ causeId: "ignition_coil", catalog, parts });
    const labor = lines.find((l) => l.kind === "LABOR")!;
    expect(labor.quantity).toBe(0.5);
    expect(labor.unit_price).toBe(68);
    const part = lines.find((l) => l.kind === "PART")!;
    expect(part.reference).toBe("DEMO-BOB-001");
    expect(part.unit_price).toBe(62);
  });

  it("marque les devis envoyés à relancer", async () => {
    const store = demoStore();
    const paul = await as(store, "u-paul");
    const q = (await paul.work.quotes()).find((x) => x.id === "q-308-1")!;
    expect(q.needsFollowUp).toBe(true);
    await paul.work.markFollowedUp(q.id, "PHONE");
    expect((await paul.work.quote(q.id)).needsFollowUp).toBe(false);
  });
});

describe("Numérotation des devis", () => {
  it("incrémente à partir du plus grand numéro de l'année", async () => {
    const store = demoStore();
    const emma = await as(store, "u-emma");
    const a = await emma.work.createQuote({ vehicle_id: "v-golf", items: [] });
    const b = await emma.work.createQuote({ vehicle_id: "v-golf", items: [] });
    const n = (x: string) => Number(x.split("-").pop());
    expect(n(b.number)).toBe(n(a.number) + 1);
    expect(a.number.startsWith(`D-${new Date().getFullYear()}-`)).toBe(true);
    expect(a.number).toMatch(/-\d{4}$/);
  });
});
