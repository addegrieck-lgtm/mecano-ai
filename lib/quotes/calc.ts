import type { QuoteItem } from "@/types";

export const PRICE_TO_FILL = "Prix à renseigner";

export interface QuoteTotals {
  totalHT: number;
  vatAmount: number;
  totalTTC: number;
  laborHT: number;
  partsHT: number;
  servicesHT: number;
  laborHours: number;
  missingPrices: number;
}

export const roundCents = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function lineTotal(item: Pick<QuoteItem, "quantity" | "unit_price">): number | null {
  if (item.unit_price === null || item.unit_price === undefined) return null;
  return roundCents(item.quantity * item.unit_price);
}

/** Calcul HT / TVA / TTC. Les lignes sans prix sont exclues du total et comptées dans missingPrices. */
export function computeTotals(items: Pick<QuoteItem, "kind" | "quantity" | "unit_price">[], vatRate: number): QuoteTotals {
  let laborHT = 0;
  let partsHT = 0;
  let servicesHT = 0;
  let laborHours = 0;
  let missingPrices = 0;
  for (const item of items) {
    const total = lineTotal(item);
    if (item.kind === "LABOR") laborHours += item.quantity;
    if (total === null) {
      missingPrices++;
      continue;
    }
    if (item.kind === "LABOR") laborHT += total;
    else if (item.kind === "PART") partsHT += total;
    else servicesHT += total;
  }
  const totalHT = roundCents(laborHT + partsHT + servicesHT);
  const vatAmount = roundCents((totalHT * vatRate) / 100);
  return {
    totalHT,
    vatAmount,
    totalTTC: roundCents(totalHT + vatAmount),
    laborHT: roundCents(laborHT),
    partsHT: roundCents(partsHT),
    servicesHT: roundCents(servicesHT),
    laborHours: roundCents(laborHours),
    missingPrices,
  };
}

export function formatEuro(v: number | null | undefined): string {
  if (v === null || v === undefined) return PRICE_TO_FILL;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
}
