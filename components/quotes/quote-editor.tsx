"use client";

import { Package, Plus, Trash2, Wrench } from "lucide-react";
import { useData } from "@/components/app/app-provider";
import { NativeSelect, TextInput } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { computeTotals, formatEuro, lineTotal, PRICE_TO_FILL } from "@/lib/quotes/calc";
import type { QuoteItemKind } from "@/types";

export interface EditableLine {
  kind: QuoteItemKind;
  label: string;
  reference: string;
  quantity: string;
  unit_price: string;
}

export const toEditable = (i: { kind: QuoteItemKind; label: string; reference?: string | null; quantity: number; unit_price: number | null }): EditableLine => ({
  kind: i.kind,
  label: i.label,
  reference: i.reference ?? "",
  quantity: String(i.quantity),
  unit_price: i.unit_price == null ? "" : String(i.unit_price),
});

export const fromEditable = (l: EditableLine) => ({
  kind: l.kind,
  label: l.label,
  reference: l.reference || null,
  quantity: Number(l.quantity.replace(",", ".")) || 0,
  unit_price: l.unit_price === "" ? null : Number(l.unit_price.replace(",", ".")),
});

const KIND_LABEL: Record<QuoteItemKind, string> = { LABOR: "Main-d'œuvre", PART: "Pièce", SERVICE: "Prestation" };

export function QuoteTotalsView({ lines, vatRate }: { lines: { kind: QuoteItemKind; quantity: number; unit_price: number | null }[]; vatRate: number }) {
  const t = computeTotals(lines, vatRate);
  return (
    <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Main-d&apos;œuvre ({t.laborHours} h)</span>
        <span>{formatEuro(t.laborHT)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Pièces</span>
        <span>{formatEuro(t.partsHT)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Prestations</span>
        <span>{formatEuro(t.servicesHT)}</span>
      </div>
      <div className="flex justify-between border-t pt-1 font-medium">
        <span>Total HT</span>
        <span>{formatEuro(t.totalHT)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>TVA {vatRate} %</span>
        <span>{formatEuro(t.vatAmount)}</span>
      </div>
      <div className="flex justify-between border-t pt-1 text-lg font-bold">
        <span>Total TTC</span>
        <span className="text-primary">{formatEuro(t.totalTTC)}</span>
      </div>
      {t.missingPrices > 0 && <div className="mt-1 rounded-md bg-warning/15 px-2 py-1 text-xs text-warning">{t.missingPrices} ligne(s) : « {PRICE_TO_FILL} » — non incluses dans le total</div>}
    </div>
  );
}

export function QuoteEditor({ lines, onChange, vatRate }: { lines: EditableLine[]; onChange: (l: EditableLine[]) => void; vatRate: number }) {
  const { data } = useData(async (s) => ({ catalog: await s.crm.catalog(), parts: await s.crm.parts() }));
  const update = (i: number, patch: Partial<EditableLine>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const hourly = data?.catalog.find((c) => c.key === "labor_hour")?.unit_price ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[110px_1fr_110px_80px_110px_100px_36px] gap-2 px-1 text-xs font-semibold text-muted-foreground uppercase md:grid">
        <span>Type</span>
        <span>Libellé</span>
        <span>Référence</span>
        <span>Qté</span>
        <span>PU HT (€)</span>
        <span className="text-right">Total HT</span>
        <span />
      </div>
      {lines.map((l, i) => {
        const parsed = fromEditable(l);
        const total = lineTotal(parsed);
        return (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-[110px_1fr_110px_80px_110px_100px_36px] md:items-center md:border-0 md:p-0">
            <NativeSelect value={l.kind} onChange={(e) => update(i, { kind: e.target.value as QuoteItemKind })} aria-label="Type de ligne">
              {(Object.keys(KIND_LABEL) as QuoteItemKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
            <TextInput value={l.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Libellé" className="col-span-2 md:col-span-1" maxLength={200} aria-label="Libellé" />
            <TextInput value={l.reference} onChange={(e) => update(i, { reference: e.target.value })} placeholder="Réf." maxLength={80} aria-label="Référence" />
            <TextInput value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} inputMode="decimal" aria-label="Quantité" />
            <TextInput value={l.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} inputMode="decimal" placeholder={PRICE_TO_FILL} aria-label="Prix unitaire HT" className={l.unit_price === "" ? "border-warning/60" : ""} />
            <span className={`text-right text-sm tabular-nums ${total === null ? "text-warning" : ""}`}>{total === null ? "À renseigner" : formatEuro(total)}</span>
            <button type="button" onClick={() => onChange(lines.filter((_, k) => k !== i))} className="flex justify-end text-muted-foreground hover:text-destructive md:justify-center" aria-label="Supprimer la ligne">
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...lines, { kind: "LABOR", label: "Main-d'œuvre", reference: "", quantity: "1", unit_price: hourly != null ? String(hourly) : "" }])}>
          <Wrench className="size-3.5" /> Main-d&apos;œuvre
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...lines, { kind: "PART", label: "", reference: "", quantity: "1", unit_price: "" }])}>
          <Package className="size-3.5" /> Pièce libre
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...lines, { kind: "SERVICE", label: "", reference: "", quantity: "1", unit_price: "" }])}>
          <Plus className="size-3.5" /> Prestation libre
        </Button>
        {data && (
          <>
            <NativeSelect
              value=""
              className="h-8 w-auto text-xs"
              onChange={(e) => {
                const c = data.catalog.find((x) => x.id === e.target.value);
                if (!c) return;
                if (c.category === "LABOR" && c.default_hours != null) onChange([...lines, { kind: "LABOR", label: `Main-d'œuvre — ${c.label}`, reference: "", quantity: String(c.default_hours), unit_price: hourly != null ? String(hourly) : "" }]);
                else onChange([...lines, { kind: c.category === "LABOR" ? "LABOR" : "SERVICE", label: c.label, reference: "", quantity: "1", unit_price: c.unit_price != null ? String(c.unit_price) : "" }]);
              }}
            >
              <option value="">+ Catalogue du garage…</option>
              {data.catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} {c.unit_price != null ? `(${formatEuro(c.unit_price)})` : c.default_hours != null ? `(${c.default_hours} h)` : ""}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value=""
              className="h-8 w-auto text-xs"
              onChange={(e) => {
                const p = data.parts.find((x) => x.id === e.target.value);
                if (p) onChange([...lines, { kind: "PART", label: `${p.name}${p.brand ? ` (${p.brand})` : ""}`, reference: p.reference, quantity: "1", unit_price: p.price != null ? String(p.price) : "" }]);
              }}
            >
              <option value="">+ Pièce en stock…</option>
              {data.parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.reference} · stock {p.stock}
                </option>
              ))}
            </NativeSelect>
          </>
        )}
      </div>
      <QuoteTotalsView lines={lines.map(fromEditable)} vatRate={vatRate} />
    </div>
  );
}
