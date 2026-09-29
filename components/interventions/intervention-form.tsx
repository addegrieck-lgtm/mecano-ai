"use client";

import { useEffect } from "react";
import { Field, FormDialog, NativeSelect, TextArea, TextInput } from "@/components/app/common";
import { useAction, useApp, useData } from "@/components/app/app-provider";
import { useForm } from "@/components/app/use-form";
import { can } from "@/lib/permissions";
import { toLocalInput } from "@/lib/format";
import { interventionSchema } from "@/lib/validation/schemas";
import type { Intervention } from "@/types";

type Values = Record<"vehicle_id" | "title" | "description" | "team_id" | "mechanic_id" | "scheduled_at" | "planned_duration_minutes", string>;

/**
 * Création / modification d'une intervention, avec affectation Véhicule → Équipe → Mécanicien.
 * En mode `fromQuoteId`, l'intervention est générée à partir du devis (titre, pièces, durée).
 */
export function InterventionFormDialog({
  open,
  onOpenChange,
  intervention,
  defaults,
  fromQuoteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  intervention?: Intervention | null;
  defaults?: Partial<Values>;
  fromQuoteId?: string;
  onSaved?: (i: Intervention) => void;
}) {
  const { services } = useApp();
  const { run, pending } = useAction();
  const f = useForm<Values>({ vehicle_id: "", title: "", description: "", team_id: "", mechanic_id: "", scheduled_at: "", planned_duration_minutes: "60" });
  const { data } = useData(async (s) => ({ vehicles: await s.crm.vehicles(), teams: await s.org.teams(), members: await s.org.members() }));
  const { reset } = f;
  useEffect(() => {
    if (!open) return;
    const base: Values = intervention
      ? {
          vehicle_id: intervention.vehicle_id,
          title: intervention.title,
          description: intervention.description ?? "",
          team_id: intervention.team_id ?? "",
          mechanic_id: intervention.mechanic_id ?? "",
          scheduled_at: toLocalInput(intervention.scheduled_at),
          planned_duration_minutes: intervention.planned_duration_minutes?.toString() ?? "",
        }
      : { vehicle_id: "", title: fromQuoteId ? "(depuis le devis)" : "", description: "", team_id: "", mechanic_id: "", scheduled_at: toLocalInput(new Date(Date.now() + 3600_000).toISOString()), planned_duration_minutes: "60", ...defaults };
    reset(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, intervention, fromQuoteId]);

  const canAssign = services ? can(services.ctx, "interventions:assign") : false;
  const team = data?.teams.find((t) => t.id === f.values.team_id);
  const mechanics = (data?.members ?? []).filter((m) => (team ? team.memberIds.includes(m.profile.id) : true) && ["MECHANIC", "TEAM_MANAGER", "OWNER", "ADMIN"].includes(m.member.role));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={intervention ? "Modifier l'intervention" : fromQuoteId ? "Créer l'intervention depuis le devis" : "Nouvelle intervention"}
      description="Affectation : Véhicule → Équipe → Mécanicien"
      pending={pending}
      onSubmit={async () => {
        if (fromQuoteId) {
          const res = await run(
            (s) =>
              s.work.createInterventionFromQuote(fromQuoteId, {
                team_id: f.values.team_id || null,
                mechanic_id: f.values.mechanic_id || null,
                scheduled_at: f.values.scheduled_at ? new Date(f.values.scheduled_at).toISOString() : null,
              }),
            "Intervention créée",
          );
          if (res) {
            onOpenChange(false);
            onSaved?.(res);
          }
          return;
        }
        const data_ = f.validate(interventionSchema);
        if (!data_) return;
        const payload = { ...data_, scheduled_at: f.values.scheduled_at ? new Date(f.values.scheduled_at).toISOString() : null };
        const res = await run((s) => (intervention ? s.work.updateIntervention(intervention.id, payload) : s.work.createIntervention(payload)), intervention ? "Intervention mise à jour" : "Intervention créée");
        if (res) {
          onOpenChange(false);
          onSaved?.(res);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {!fromQuoteId && (
          <>
            <Field label="Véhicule *" error={f.errors.vehicle_id} className="sm:col-span-2">
              <NativeSelect {...f.bind("vehicle_id")} disabled={!!intervention}>
                <option value="">— Sélectionner —</option>
                {data?.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} · {v.registration}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Intitulé *" error={f.errors.title} className="sm:col-span-2">
              <TextInput {...f.bind("title")} placeholder="Ex. : Remplacement bobine d'allumage" />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <TextArea {...f.bind("description")} rows={2} />
            </Field>
          </>
        )}
        <Field label="Équipe" hint={!canAssign ? "Affectation limitée à vous-même" : undefined}>
          <NativeSelect {...f.bind("team_id")}>
            <option value="">— Aucune —</option>
            {data?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Mécanicien">
          <NativeSelect {...f.bind("mechanic_id")}>
            <option value="">— Non attribué —</option>
            {mechanics.map((m) => (
              <option key={m.profile.id} value={m.profile.id}>
                {m.profile.first_name} {m.profile.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Date et heure">
          <TextInput {...f.bind("scheduled_at")} type="datetime-local" />
        </Field>
        {!fromQuoteId && (
          <Field label="Durée prévue (min)" error={f.errors.planned_duration_minutes}>
            <TextInput {...f.bind("planned_duration_minutes")} type="number" min={0} inputMode="numeric" />
          </Field>
        )}
      </div>
    </FormDialog>
  );
}
