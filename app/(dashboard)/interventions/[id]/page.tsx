"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Ban, Camera, CheckCircle2, FileText, Package, PackageOpen, Pencil, Play, Plus, Star, Stethoscope, Trash2, Wrench } from "lucide-react";
import { useAction, useData, useServices } from "@/components/app/app-provider";
import { ConfirmDialog, ErrorState, Field, FormDialog, KeyValue, Loading, NativeSelect, PageHeader, Pill, Section, TextArea, TextInput } from "@/components/app/common";
import { InterventionFormDialog } from "@/components/interventions/intervention-form";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Button, buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { fmtDateTime, fmtDuration, INTERVENTION_STATUS } from "@/lib/format";
import { formatEuro } from "@/lib/quotes/calc";
import { cn } from "@/lib/utils";
import type { InterventionPart } from "@/types";

export default function InterventionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useServices();
  const { run, pending } = useAction();
  const [edit, setEdit] = useState(false);
  const [complete, setComplete] = useState(false);
  const [actual, setActual] = useState("");
  const [review, setReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [partName, setPartName] = useState("");
  const { data, loading, error } = useData(
    async (svc) => ({ ...(await svc.work.intervention(id)), teams: await svc.org.teams(), members: await svc.org.members(), parts: await svc.crm.parts(), now: Date.now() }),
    [id],
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Intervention introuvable"} />;
  const { intervention: i, vehicle, client, quote, diagnostic, canEdit, teams, members, parts, now } = data;
  const st = INTERVENTION_STATUS[i.status];
  const team = teams.find((t) => t.id === i.team_id);
  const mech = members.find((m) => m.profile.id === i.mechanic_id)?.profile;
  const setParts = (p: InterventionPart[]) => run((svc) => svc.work.setInterventionParts(id, p), "Pièces mises à jour");
  const elapsed = i.started_at ? Math.round((now - new Date(i.started_at).getTime()) / 60000) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: "/interventions", label: "Interventions" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {i.title} <Pill tone={st.tone}>{st.label}</Pill>
          </span>
        }
        subtitle={vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.registration}${client ? ` · ${client.first_name} ${client.last_name}` : ""}` : undefined}
        actions={
          <>
            {canEdit && i.status !== "COMPLETED" && (
              <Button variant="outline" onClick={() => setEdit(true)}>
                <Pencil className="size-4" /> Modifier / affecter
              </Button>
            )}
            {can(s.ctx, "interventions:delete") && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        }
      />

      {canEdit && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {i.status === "WAITING" && (
            <Button size="lg" className="h-14 text-base font-bold" disabled={pending} onClick={() => run((svc) => svc.work.setInterventionStatus(id, "IN_PROGRESS"), "Intervention démarrée")}>
              <Play className="size-5" /> COMMENCER
            </Button>
          )}
          {(i.status === "IN_PROGRESS" || i.status === "WAITING_PART") && (
            <Button
              size="lg"
              className="h-14 bg-success text-base font-bold text-background hover:bg-success/80"
              disabled={pending}
              onClick={() => {
                setActual(elapsed ? String(elapsed) : i.planned_duration_minutes?.toString() ?? "");
                setComplete(true);
              }}
            >
              <CheckCircle2 className="size-5" /> CLÔTURER
            </Button>
          )}
          {i.status === "IN_PROGRESS" && (
            <Button size="lg" variant="secondary" className="h-14" disabled={pending} onClick={() => run((svc) => svc.work.setInterventionStatus(id, "WAITING_PART"), "En attente de pièce")}>
              <PackageOpen className="size-5" /> Attente pièce
            </Button>
          )}
          {i.status === "WAITING_PART" && (
            <Button size="lg" variant="secondary" className="h-14" disabled={pending} onClick={() => run((svc) => svc.work.setInterventionStatus(id, "IN_PROGRESS"), "Reprise de l'intervention")}>
              <Play className="size-5" /> Reprendre
            </Button>
          )}
          {i.status !== "COMPLETED" && i.status !== "CANCELLED" && (
            <Button size="lg" variant="outline" className="h-14" disabled={pending} onClick={() => run((svc) => svc.work.setInterventionStatus(id, "CANCELLED"), "Intervention annulée")}>
              <Ban className="size-5" /> Annuler
            </Button>
          )}
        </div>
      )}

      {i.status === "COMPLETED" && (
        <div className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success/10 p-4 sm:flex-row sm:items-center">
          <CheckCircle2 className="size-6 text-success" />
          <div className="flex-1">
            <div className="font-semibold">Véhicule terminé</div>
            <div className="text-sm text-muted-foreground">Clôturée le {fmtDateTime(i.completed_at)} · durée réelle {fmtDuration(i.actual_duration_minutes)}</div>
          </div>
          {quote && (
            <Link href={`/quotes/${quote.id}`} className={buttonVariants({ variant: "outline" })}>
              <FileText className="size-4" /> Voir facture
            </Link>
          )}
          {data.review ? (
            <Pill tone="warning">
              {"★".repeat(data.review.rating)}
              {"☆".repeat(5 - data.review.rating)}
            </Pill>
          ) : (
            <Button onClick={() => setReview(true)}>
              <Star className="size-4" /> Laisser un avis
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Détails" icon={Wrench}>
          <KeyValue
            items={[
              ["Véhicule", vehicle ? <Link key="v" href={`/vehicles/${vehicle.id}`} className="text-primary">{`${vehicle.make} ${vehicle.model}`}</Link> : "—"],
              ["Client", client ? `${client.first_name} ${client.last_name}` : "—"],
              ["Équipe", team ? <span key="t" className="flex items-center justify-end gap-1.5"><span className="size-2 rounded-full" style={{ background: team.color }} />{team.name}</span> : "—"],
              ["Mécanicien", mech ? `${mech.first_name} ${mech.name}` : "Non attribué"],
              ["Planifiée", fmtDateTime(i.scheduled_at)],
              ["Durée prévue", fmtDuration(i.planned_duration_minutes)],
              ["Démarrée", fmtDateTime(i.started_at)],
              ["Durée réelle", i.status === "COMPLETED" ? fmtDuration(i.actual_duration_minutes) : elapsed != null ? `${fmtDuration(elapsed)} (en cours)` : "—"],
            ]}
          />
          {i.description && <p className="mt-3 text-sm whitespace-pre-line text-muted-foreground">{i.description}</p>}
        </Section>
        <Section title="Dossier" icon={FileText}>
          <div className="flex flex-col gap-2 text-sm">
            {diagnostic ? (
              <Link href={`/diagnostics/${diagnostic.id}`} className="flex items-center gap-2 rounded-lg border p-3 hover:border-primary/40">
                <Stethoscope className="size-4 text-info" />
                <span className="flex-1">Diagnostic associé {diagnostic.conclusion ? `— ${diagnostic.conclusion.recommended_repair ?? ""}` : ""}</span>
              </Link>
            ) : (
              <span className="text-muted-foreground">Aucun diagnostic associé</span>
            )}
            {quote ? (
              <Link href={`/quotes/${quote.id}`} className="flex items-center gap-2 rounded-lg border p-3 hover:border-primary/40">
                <FileText className="size-4" />
                <span className="flex-1">Devis {quote.number}</span>
                <span className="font-semibold">{formatEuro(quote.totals.totalTTC)} TTC</span>
              </Link>
            ) : (
              <span className="text-muted-foreground">Aucun devis associé</span>
            )}
          </div>
        </Section>
      </div>

      <Section title="Pièces" icon={Package}>
        <div className="flex flex-col gap-2">
          {i.parts.length === 0 && <span className="text-sm text-muted-foreground">Aucune pièce</span>}
          {i.parts.map((p, k) => (
            <div key={k} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="flex-1">{p.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.reference}</span>
              {canEdit && i.status !== "COMPLETED" ? (
                <TextInput
                  type="number"
                  min={1}
                  className="h-8 w-20"
                  defaultValue={p.quantity}
                  onBlur={(e) => Number(e.target.value) !== p.quantity && setParts(i.parts.map((x, j) => (j === k ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
                  aria-label="Quantité"
                />
              ) : (
                <span>×{p.quantity}</span>
              )}
              {canEdit && i.status !== "COMPLETED" && (
                <button onClick={() => setParts(i.parts.filter((_, j) => j !== k))} className="text-muted-foreground hover:text-destructive" aria-label="Retirer">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          {canEdit && i.status !== "COMPLETED" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <NativeSelect
                value=""
                onChange={(e) => {
                  const part = parts.find((p) => p.id === e.target.value);
                  if (part) setParts([...i.parts, { part_id: part.id, name: part.name, reference: part.reference, quantity: 1 }]);
                }}
              >
                <option value="">+ Pièce du stock…</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.reference} (stock {p.stock})
                  </option>
                ))}
              </NativeSelect>
              <div className="flex flex-1 gap-2">
                <TextInput value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Pièce hors stock" maxLength={150} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!partName.trim()) return;
                    setParts([...i.parts, { part_id: null, name: partName.trim(), reference: null, quantity: 1 }]);
                    setPartName("");
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Photos de l'intervention" icon={Camera}>
        <PhotoGallery entityType="intervention" entityId={id} vehicleId={i.vehicle_id} />
      </Section>

      <InterventionFormDialog open={edit} onOpenChange={setEdit} intervention={i} />
      <FormDialog
        open={complete}
        onOpenChange={setComplete}
        title="Clôturer l'intervention"
        description="L'historique du véhicule sera mis à jour et le stock des pièces décrémenté."
        submitLabel="Clôturer"
        pending={pending}
        onSubmit={async () => {
          const res = await run((svc) => svc.work.setInterventionStatus(id, "COMPLETED", { actual_duration_minutes: actual ? Number(actual) : null }), "Intervention clôturée — historique mis à jour");
          if (res) setComplete(false);
        }}
      >
        <Field label="Durée réelle (minutes)">
          <TextInput type="number" min={1} value={actual} onChange={(e) => setActual(e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">Pensez à ajouter les photos de fin d&apos;intervention.</p>
      </FormDialog>
      <FormDialog
        open={review}
        onOpenChange={setReview}
        title="Avis client"
        description="Avis enregistré localement. Aucune publication automatique sur Google (intégration future)."
        pending={pending}
        onSubmit={async () => {
          const res = await run((svc) => svc.work.addReview({ intervention_id: id, rating, comment: comment || null }), "Merci pour l'avis !");
          if (res) setReview(false);
        }}
      >
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} étoile(s)`}>
              <Star className={cn("size-9", n <= rating ? "fill-warning text-warning" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
        <Field label="Commentaire">
          <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={2000} />
        </Field>
      </FormDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer l'intervention ?"
        description="Cette action est journalisée."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await run((svc) => svc.work.deleteIntervention(id), "Intervention supprimée");
          router.push("/interventions");
        }}
      />
    </div>
  );
}
