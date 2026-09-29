import { CAUSES } from "@/data/causes";
import type { Part, PriceCatalogItem, QuoteItemKind } from "@/types";

export interface SuggestedLine {
  kind: QuoteItemKind;
  label: string;
  reference: string | null;
  quantity: number;
  unit_price: number | null;
  source: "catalog" | "parts" | "none";
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "")
    .trim();

function findPart(parts: Part[], name: string): Part | undefined {
  const words = norm(name).split(/\s+/).filter((w) => w.length > 2);
  return parts.find((p) => {
    const n = norm(p.name);
    return words.every((w) => n.includes(w));
  });
}

/**
 * Pré-remplit un devis à partir de la cause retenue.
 * RÈGLE : aucun prix n'est inventé. Les prix proviennent uniquement du catalogue du garage
 * (price_catalog, parts). À défaut : unit_price = null → « Prix à renseigner ».
 */
export function suggestQuoteLines(opts: {
  causeId: string | null;
  recommendedRepair?: string | null;
  catalog: PriceCatalogItem[];
  parts: Part[];
  laborHourlyRate?: number | null;
  includeDiagnostic?: boolean;
}): SuggestedLine[] {
  const { catalog, parts } = opts;
  const lines: SuggestedLine[] = [];
  const byKey = (key: string) => catalog.find((c) => c.key === key);
  const hourly = byKey("labor_hour")?.unit_price ?? opts.laborHourlyRate ?? null;

  if (opts.includeDiagnostic !== false) {
    const diag = byKey("diagnostic");
    lines.push({
      kind: "SERVICE",
      label: diag?.label ?? "Diagnostic électronique",
      reference: null,
      quantity: 1,
      unit_price: diag?.unit_price ?? null,
      source: diag?.unit_price != null ? "catalog" : "none",
    });
  }

  const cause = opts.causeId ? CAUSES[opts.causeId] : undefined;
  const repairLabel = opts.recommendedRepair || cause?.repair.label;
  if (repairLabel) {
    const item = cause?.repair.catalogKey ? byKey(cause.repair.catalogKey) : undefined;
    if (item?.category === "SERVICE" && item.unit_price != null) {
      lines.push({ kind: "SERVICE", label: item.label, reference: null, quantity: 1, unit_price: item.unit_price, source: "catalog" });
    } else if (item?.default_hours != null) {
      lines.push({
        kind: "LABOR",
        label: `Main-d'œuvre — ${item.label}`,
        reference: null,
        quantity: item.default_hours,
        unit_price: hourly,
        source: hourly != null ? "catalog" : "none",
      });
    } else {
      lines.push({ kind: "LABOR", label: `Main-d'œuvre — ${repairLabel} (temps à renseigner)`, reference: null, quantity: 1, unit_price: hourly, source: hourly != null ? "catalog" : "none" });
    }
  }

  for (const name of cause?.repair.parts ?? []) {
    const part = findPart(parts, name);
    lines.push({
      kind: "PART",
      label: part ? `${part.name}${part.brand ? ` (${part.brand})` : ""}` : name,
      reference: part?.reference ?? null,
      quantity: 1,
      unit_price: part?.price ?? null,
      source: part?.price != null ? "parts" : "none",
    });
  }
  return lines;
}
