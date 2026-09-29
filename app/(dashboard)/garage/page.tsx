"use client";

import { useEffect, useState } from "react";
import { Building2, Check, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { useAction, useApp } from "@/components/app/app-provider";
import { Field, FormDialog, PageHeader, Pill, Section, TextInput } from "@/components/app/common";
import { useForm } from "@/components/app/use-form";
import { Button } from "@/components/ui/button";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { createGarage } from "@/lib/services";
import { garageSchema } from "@/lib/validation/schemas";

const EMPTY = { name: "", legal_name: "", address: "", postal_code: "", city: "", phone: "", email: "", siret: "", logo: "" };

export default function GaragePage() {
  const { services, garage, garages, store, profile, switchGarage, refresh } = useApp();
  const { run, pending } = useAction();
  const f = useForm(EMPTY);
  const c = useForm(EMPTY);
  const [creating, setCreating] = useState(garages.length === 0);
  const { reset } = f;
  useEffect(() => {
    if (garage)
      reset({
        name: garage.name,
        legal_name: garage.legal_name ?? "",
        address: garage.address ?? "",
        postal_code: garage.postal_code ?? "",
        city: garage.city ?? "",
        phone: garage.phone ?? "",
        email: garage.email ?? "",
        siret: garage.siret ?? "",
        logo: garage.logo ?? "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garage]);
  const editable = services ? can(services.ctx, "garage:manage") : false;

  const fields = (form: typeof f, disabled = false) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nom commercial *" error={form.errors.name}>
        <TextInput {...form.bind("name")} disabled={disabled} />
      </Field>
      <Field label="Raison sociale" error={form.errors.legal_name}>
        <TextInput {...form.bind("legal_name")} disabled={disabled} />
      </Field>
      <Field label="Adresse" error={form.errors.address} className="sm:col-span-2">
        <TextInput {...form.bind("address")} disabled={disabled} />
      </Field>
      <Field label="Code postal" error={form.errors.postal_code}>
        <TextInput {...form.bind("postal_code")} inputMode="numeric" disabled={disabled} />
      </Field>
      <Field label="Ville" error={form.errors.city}>
        <TextInput {...form.bind("city")} disabled={disabled} />
      </Field>
      <Field label="Téléphone" error={form.errors.phone}>
        <TextInput {...form.bind("phone")} type="tel" disabled={disabled} />
      </Field>
      <Field label="Email" error={form.errors.email}>
        <TextInput {...form.bind("email")} type="email" disabled={disabled} />
      </Field>
      <Field label="SIRET (optionnel)" error={form.errors.siret}>
        <TextInput {...form.bind("siret")} inputMode="numeric" disabled={disabled} />
      </Field>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Garage"
        subtitle="Informations légales, garages accessibles"
        actions={
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Créer un garage
          </Button>
        }
      />
      {garage && (
        <Section title={garage.name} icon={Building2}>
          {fields(f, !editable)}
          {editable && (
            <div className="mt-4 flex justify-end">
              <Button
                disabled={pending}
                onClick={async () => {
                  const data = f.validate(garageSchema);
                  if (data) await run((s) => s.org.updateGarage(data), "Garage mis à jour");
                }}
              >
                <Save className="size-4" /> Enregistrer
              </Button>
            </div>
          )}
        </Section>
      )}
      <Section title="Mes garages">
        <div className="flex flex-col gap-2">
          {garages.map(({ garage: g, member }) => (
            <div key={g.id} className="flex items-center gap-3 rounded-lg border p-3">
              <Building2 className="size-5 text-primary" />
              <div className="flex-1">
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-muted-foreground">
                  {g.city} · {ROLE_LABELS[member.role]}
                </div>
              </div>
              {g.id === garage?.id ? (
                <Pill tone="success">
                  <Check className="size-3" /> Actif
                </Pill>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => switchGarage(g.id)}>
                  Ouvrir
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Les données de chaque garage sont strictement isolées : aucun garage ne voit les données d&apos;un autre.</p>
        </div>
      </Section>
      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Créer un garage"
        description="Vous en deviendrez le patron (OWNER). Un catalogue de prestations vide est créé : renseignez vos tarifs dans Paramètres."
        wide
        onSubmit={async () => {
          const data = c.validate(garageSchema);
          if (!data || !store || !profile) return;
          try {
            const g = await createGarage(store, profile.id, data);
            toast.success(`Garage « ${g.name} » créé`);
            setCreating(false);
            c.reset();
            await switchGarage(g.id);
            refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        {fields(c)}
      </FormDialog>
    </div>
  );
}
