"use client";

import { useState } from "react";
import { Check, Mail, Minus, Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useAction, useApp, useData, useServices } from "@/components/app/app-provider";
import { Avatar, ConfirmDialog, ErrorState, Field, FormDialog, Loading, NativeSelect, PageHeader, Pill, Section, TextInput } from "@/components/app/common";
import { useForm } from "@/components/app/use-form";
import { Button } from "@/components/ui/button";
import { can, PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { memberSchema } from "@/lib/validation/schemas";
import { ROLES, type Role } from "@/types";

export default function MembersPage() {
  const s = useServices();
  const { mode } = useApp();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const f = useForm({ first_name: "", name: "", email: "", phone: "", role: "MECHANIC", team_id: "" });
  const { data, loading, error } = useData(async (svc) => ({ members: await svc.org.members(), teams: await svc.org.teams() }));
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Erreur"} />;
  const manage = can(s.ctx, "members:manage");

  async function submit() {
    const values = f.validate(memberSchema);
    if (!values) return;
    if (mode === "supabase") {
      // Production : invitation par email via Supabase Auth (clé service_role côté serveur uniquement)
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const { data: sess } = await getSupabaseBrowserClient().auth.getSession();
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        body: JSON.stringify({ ...values, garage_id: s.ctx.garageId }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "Invitation impossible");
      toast.success("Invitation envoyée");
      setOpen(false);
      return;
    }
    const res = await run((svc) => svc.org.addMember(values), "Membre ajouté");
    if (res) {
      setOpen(false);
      f.reset();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Membres du garage"
        subtitle={`${data.members.length} membre(s)`}
        actions={
          manage && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> {mode === "supabase" ? "Inviter un membre" : "Ajouter un membre"}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-2">
        {data.members.map(({ member, profile, teams }) => (
          <div key={member.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-3">
              <Avatar first={profile.first_name} last={profile.name} />
              <div className="min-w-0">
                <div className="font-medium">
                  {profile.first_name} {profile.name} {member.user_id === s.ctx.userId && <span className="text-xs text-primary">(vous)</span>}
                </div>
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Mail className="size-3" /> {profile.email}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {teams.map((t) => (
                <Pill key={t.id}>
                  <span className="size-2 rounded-full" style={{ background: t.color }} /> {t.name}
                </Pill>
              ))}
            </div>
            {manage && member.user_id !== s.ctx.userId ? (
              <div className="flex items-center gap-2">
                <NativeSelect className="h-9 w-44" value={member.role} onChange={(e) => run((svc) => svc.org.updateMemberRole(member.id, e.target.value as Role), "Rôle modifié")}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </NativeSelect>
                <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(member.id)} aria-label="Retirer du garage">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ) : (
              <Pill tone="primary">{ROLE_LABELS[member.role]}</Pill>
            )}
          </div>
        ))}
      </div>

      <Section title="Matrice des permissions" icon={UserCog}>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} className="py-2 text-center">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-b border-border/40">
                  <td className="py-1.5 font-mono">{p}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="text-center">
                      {ROLE_PERMISSIONS[r].includes(p) ? <Check className="mx-auto size-3.5 text-success" /> : <Minus className="mx-auto size-3.5 text-muted-foreground/40" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Système extensible : des permissions supplémentaires peuvent être accordées par membre (champ garage_members.permissions).</p>
      </Section>

      <FormDialog open={open} onOpenChange={setOpen} title={mode === "supabase" ? "Inviter un membre" : "Ajouter un membre"} pending={pending} onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prénom *" error={f.errors.first_name}>
            <TextInput {...f.bind("first_name")} />
          </Field>
          <Field label="Nom *" error={f.errors.name}>
            <TextInput {...f.bind("name")} />
          </Field>
          <Field label="Email *" error={f.errors.email}>
            <TextInput {...f.bind("email")} type="email" />
          </Field>
          <Field label="Téléphone" error={f.errors.phone}>
            <TextInput {...f.bind("phone")} type="tel" />
          </Field>
          <Field label="Rôle *">
            <NativeSelect {...f.bind("role")}>
              {ROLES.filter((r) => r !== "OWNER" || s.ctx.role === "OWNER").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Équipe">
            <NativeSelect {...f.bind("team_id")}>
              <option value="">— Aucune —</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </FormDialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Retirer ce membre du garage ?"
        description="Il perdra l'accès aux données du garage. L'action est journalisée."
        confirmLabel="Retirer"
        onConfirm={async () => {
          if (removing) await run((svc) => svc.org.removeMember(removing), "Membre retiré");
        }}
      />
    </div>
  );
}
