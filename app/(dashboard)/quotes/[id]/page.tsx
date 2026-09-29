"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BellRing, Check, Mail, Printer, Save, Send, Trash2, Undo2, Wrench, X } from "lucide-react";
import { useAction, useApp, useData } from "@/components/app/app-provider";
import { ConfirmDialog, ErrorState, Loading, PageHeader, Pill, Section } from "@/components/app/common";
import { InterventionFormDialog } from "@/components/interventions/intervention-form";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { QuoteEditor, QuoteTotalsView, fromEditable, toEditable, type EditableLine } from "@/components/quotes/quote-editor";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { fmtDate, INTERVENTION_STATUS, QUOTE_STATUS } from "@/lib/format";
import { formatEuro, lineTotal } from "@/lib/quotes/calc";

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { services, garage, version } = useApp();
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<{ version: number; lines: EditableLine[] } | null>(null);
  const lines = draft && draft.version === version ? draft.lines : null;
  const setLines = (l: EditableLine[] | null) => setDraft(l ? { version, lines: l } : null);
  const [createIntervention, setCreateIntervention] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data, loading, error } = useData(
    async (s) => {
      const quote = await s.work.quote(id);
      const interventions = (await s.work.interventions({ vehicle_id: quote.vehicle_id })).filter((i) => i.quote_id === id);
      return { quote, interventions };
    },
    [id],
  );
  if (loading || !services) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Devis introuvable"} />;
  const { quote: q, interventions } = data;
  const editable = can(services.ctx, "quotes:write") && (q.status === "DRAFT" || q.status === "SENT" || q.status === "EXPIRED");
  const current = lines ?? q.items.map(toEditable);
  const dirty = lines !== null;
  const canApprove = can(services.ctx, "quotes:approve");
  const mailto = q.client?.email
    ? `mailto:${q.client.email}?subject=${encodeURIComponent(`Votre devis ${q.number} — ${garage?.name ?? ""}`)}&body=${encodeURIComponent(
        `Bonjour ${q.client.first_name},\n\nNous revenons vers vous concernant le devis ${q.number} (${formatEuro(q.totals.totalTTC)} TTC) pour votre ${q.vehicle?.make} ${q.vehicle?.model}.\n\nN'hésitez pas à nous contacter.\n\n${garage?.name ?? ""}\n${garage?.phone ?? ""}`,
      )}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: "/quotes", label: "Devis" }}
        title={
          <span className="flex items-center gap-2">
            Devis {q.number} <Pill tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Pill>
          </span>
        }
        subtitle={`Créé le ${fmtDate(q.created_at)}${q.sent_at ? ` · envoyé le ${fmtDate(q.sent_at)}` : ""}${q.valid_until ? ` · valable jusqu'au ${fmtDate(q.valid_until)}` : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimer / PDF
            </Button>
            {q.status === "DRAFT" && can(services.ctx, "quotes:write") && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        }
      />

      {q.needsFollowUp && (
        <div className="no-print flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center">
          <BellRing className="size-4 text-warning" />
          <span className="flex-1">
            <b>Relance à prévoir</b> — devis envoyé le {fmtDate(q.sent_at)} sans réponse. (Aucun SMS payant : relance par téléphone ou email.)
          </span>
          {mailto && (
            <a href={mailto} onClick={() => run((s) => s.work.markFollowedUp(id, "EMAIL_DEMO"), "Relance email préparée et journalisée")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 text-sm">
              <Mail className="size-3.5" /> Email
            </a>
          )}
          <Button size="sm" variant="secondary" onClick={() => run((s) => s.work.markFollowedUp(id, "PHONE"), "Relance journalisée")}>
            <Check className="size-3.5" /> Relance effectuée
          </Button>
        </div>
      )}

      {/* Document (imprimable) */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row">
          <div>
            <div className="text-lg font-bold">{garage?.name}</div>
            <div className="text-sm text-muted-foreground">
              {garage?.legal_name && <div>{garage.legal_name}</div>}
              <div>
                {garage?.address} {garage?.postal_code} {garage?.city}
              </div>
              <div>
                {garage?.phone} {garage?.email && `· ${garage.email}`}
              </div>
              {garage?.siret && <div>SIRET {garage.siret}</div>}
            </div>
          </div>
          <div className="text-sm sm:text-right">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Client</div>
            {q.client ? (
              <Link href={`/clients/${q.client.id}`} className="font-semibold hover:text-primary">
                {q.client.first_name} {q.client.last_name}
              </Link>
            ) : (
              <div>—</div>
            )}
            <div className="text-muted-foreground">{q.client?.address}</div>
            <div className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Véhicule</div>
            {q.vehicle && (
              <Link href={`/vehicles/${q.vehicle.id}`} className="font-semibold hover:text-primary">
                {q.vehicle.make} {q.vehicle.model} · {q.vehicle.registration}
              </Link>
            )}
          </div>
        </div>
        {q.diagnostic_id && (
          <Link href={`/diagnostics/${q.diagnostic_id}`} className="no-print mb-3 inline-block text-xs text-primary hover:underline">
            ← Diagnostic associé
          </Link>
        )}
        {q.notes && <p className="mb-4 text-sm text-muted-foreground">{q.notes}</p>}

        {editable ? (
          <div className="no-print">
            <QuoteEditor lines={current} onChange={setLines} vatRate={q.vat_rate} />
            {dirty && (
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLines(null)}>
                  <Undo2 className="size-4" /> Annuler
                </Button>
                <Button disabled={pending} onClick={() => run((s) => s.work.updateQuote(id, { items: current.map(fromEditable) }), "Devis enregistré")}>
                  <Save className="size-4" /> Enregistrer
                </Button>
              </div>
            )}
          </div>
        ) : null}
        <div className={editable ? "hidden print:block" : ""}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="py-2">Désignation</th>
                <th className="py-2">Réf.</th>
                <th className="py-2 text-right">Qté</th>
                <th className="py-2 text-right">PU HT</th>
                <th className="py-2 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it) => (
                <tr key={it.id} className="border-b border-border/50">
                  <td className="py-2">{it.label}</td>
                  <td className="py-2 font-mono text-xs">{it.reference}</td>
                  <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{formatEuro(it.unit_price)}</td>
                  <td className="py-2 text-right tabular-nums">{formatEuro(lineTotal(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <QuoteTotalsView lines={q.items} vatRate={q.vat_rate} />
          </div>
        </div>
      </div>

      {/* Actions de statut */}
      <div className="no-print flex flex-wrap gap-2">
        {q.status === "DRAFT" && can(services.ctx, "quotes:write") && (
          <Button size="lg" disabled={pending || dirty} onClick={() => run((s) => s.work.setQuoteStatus(id, "SENT"), "Devis marqué comme envoyé")}>
            <Send className="size-4" /> Marquer comme envoyé
          </Button>
        )}
        {(q.status === "SENT" || q.status === "DRAFT") && canApprove && (
          <>
            <Button size="lg" className="bg-success text-background hover:bg-success/80" disabled={pending || dirty} onClick={() => run((s) => s.work.setQuoteStatus(id, "ACCEPTED"), "Devis accepté")}>
              <Check className="size-4" /> Accepté par le client
            </Button>
            <Button size="lg" variant="destructive" disabled={pending || dirty} onClick={() => run((s) => s.work.setQuoteStatus(id, "REFUSED"), "Devis refusé")}>
              <X className="size-4" /> Refusé
            </Button>
          </>
        )}
        {(q.status === "REFUSED" || q.status === "EXPIRED" || q.status === "SENT") && can(services.ctx, "quotes:write") && (
          <Button size="lg" variant="outline" disabled={pending} onClick={() => run((s) => s.work.setQuoteStatus(id, "DRAFT"), "Devis repassé en brouillon")}>
            <Undo2 className="size-4" /> Repasser en brouillon
          </Button>
        )}
        {q.status === "ACCEPTED" && can(services.ctx, "interventions:write") && (
          <Button size="lg" onClick={() => setCreateIntervention(true)}>
            <Wrench className="size-4" /> Créer l&apos;intervention
          </Button>
        )}
      </div>

      {interventions.length > 0 && (
        <Section title="Interventions liées" icon={Wrench} className="no-print">
          {interventions.map((i) => (
            <Link key={i.id} href={`/interventions/${i.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:border-primary/40">
              <span>{i.title}</span>
              <Pill tone={INTERVENTION_STATUS[i.status].tone}>{INTERVENTION_STATUS[i.status].label}</Pill>
            </Link>
          ))}
        </Section>
      )}

      <Section title="Photos du devis" className="no-print">
        <PhotoGallery entityType="quote" entityId={id} vehicleId={q.vehicle_id} />
      </Section>

      <InterventionFormDialog open={createIntervention} onOpenChange={setCreateIntervention} fromQuoteId={id} defaults={{ team_id: q.team_id ?? "", mechanic_id: q.mechanic_id ?? "" }} onSaved={(i) => router.push(`/interventions/${i.id}`)} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce brouillon ?"
        description="Le devis et ses lignes seront supprimés."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await run((s) => s.work.deleteQuote(id), "Devis supprimé");
          router.push("/quotes");
        }}
      />
    </div>
  );
}
