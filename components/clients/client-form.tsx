"use client";

import { useEffect } from "react";
import { Field, FormDialog, TextArea, TextInput } from "@/components/app/common";
import { useAction } from "@/components/app/app-provider";
import { useForm } from "@/components/app/use-form";
import { clientSchema } from "@/lib/validation/schemas";
import type { Client } from "@/types";

const EMPTY = { first_name: "", last_name: "", phone: "", email: "", address: "", notes: "" };

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; client?: Client | null; onSaved?: (c: Client) => void }) {
  const f = useForm(EMPTY);
  const { run, pending } = useAction();
  const { reset } = f;
  useEffect(() => {
    if (open) reset(client ? { first_name: client.first_name, last_name: client.last_name, phone: client.phone ?? "", email: client.email ?? "", address: client.address ?? "", notes: client.notes ?? "" } : EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={client ? "Modifier le client" : "Nouveau client"}
      pending={pending}
      onSubmit={async () => {
        const data = f.validate(clientSchema);
        if (!data) return;
        const saved = await run((s) => (client ? s.crm.updateClient(client.id, data) : s.crm.createClient(data)), client ? "Client mis à jour" : "Client créé");
        if (saved) {
          onOpenChange(false);
          onSaved?.(saved);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom *" error={f.errors.first_name}>
          <TextInput {...f.bind("first_name")} autoComplete="off" />
        </Field>
        <Field label="Nom *" error={f.errors.last_name}>
          <TextInput {...f.bind("last_name")} autoComplete="off" />
        </Field>
        <Field label="Téléphone" error={f.errors.phone}>
          <TextInput {...f.bind("phone")} type="tel" inputMode="tel" />
        </Field>
        <Field label="Email" error={f.errors.email}>
          <TextInput {...f.bind("email")} type="email" />
        </Field>
        <Field label="Adresse" error={f.errors.address} className="sm:col-span-2">
          <TextInput {...f.bind("address")} />
        </Field>
        <Field label="Notes" error={f.errors.notes} className="sm:col-span-2">
          <TextArea {...f.bind("notes")} rows={3} />
        </Field>
      </div>
    </FormDialog>
  );
}
