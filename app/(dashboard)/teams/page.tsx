"use client";

import { useEffect, useState } from "react";
import { Crown, Pencil, Plus, Trash2, UserMinus, UsersRound } from "lucide-react";
import { useAction, useData, useServices } from "@/components/app/app-provider";
import { Avatar, ConfirmDialog, Empty, ErrorState, Field, FormDialog, Loading, NativeSelect, PageHeader, TextArea, TextInput } from "@/components/app/common";
import { useForm } from "@/components/app/use-form";
import { Button } from "@/components/ui/button";
import { can, canManageTeam, ROLE_LABELS } from "@/lib/permissions";
import { teamSchema } from "@/lib/validation/schemas";
import type { Team } from "@/types";

const COLORS = ["#f97316", "#38bdf8", "#a3a3a3", "#a78bfa", "#34d399", "#f43f5e", "#facc15"];

function TeamDialog({ open, onOpenChange, team, members }: { open: boolean; onOpenChange: (o: boolean) => void; team: Team | null; members: { id: string; label: string }[] }) {
  const f = useForm({ name: "", description: "", color: COLORS[0], manager_id: "" });
  const { run, pending } = useAction();
  const { reset } = f;
  useEffect(() => {
    if (open) reset(team ? { name: team.name, description: team.description ?? "", color: team.color, manager_id: team.manager_id ?? "" } : { name: "", description: "", color: COLORS[0], manager_id: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={team ? "Modifier l'équipe" : "Nouvelle équipe"}
      pending={pending}
      onSubmit={async () => {
        const data = f.validate(teamSchema);
        if (!data) return;
        const res = await run((s) => (team ? s.org.updateTeam(team.id, data) : s.org.createTeam(data)), team ? "Équipe mise à jour" : "Équipe créée");
        if (res) onOpenChange(false);
      }}
    >
      <Field label="Nom *" error={f.errors.name}>
        <TextInput {...f.bind("name")} placeholder="Équipe mécanique" />
      </Field>
      <Field label="Description">
        <TextArea {...f.bind("description")} rows={2} />
      </Field>
      <Field label="Couleur">
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => f.set("color", c)} className={`size-8 rounded-full border-2 ${f.values.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} aria-label={c} />
          ))}
        </div>
      </Field>
      <Field label="Responsable d'équipe">
        <NativeSelect {...f.bind("manager_id")}>
          <option value="">— Aucun —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}

export default function TeamsPage() {
  const s = useServices();
  const { run } = useAction();
  const [editing, setEditing] = useState<Team | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const { data, loading, error } = useData(async (svc) => ({ teams: await svc.org.teams(), members: await svc.org.members(), dash: await svc.insights.dashboard() }));
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Erreur"} />;
  const memberOptions = data.members.map((m) => ({ id: m.profile.id, label: `${m.profile.first_name} ${m.profile.name} (${ROLE_LABELS[m.member.role]})` }));

  return (
    <div>
      <PageHeader
        title="Équipes"
        subtitle="Garage → Équipes → Mécaniciens"
        actions={
          can(s.ctx, "teams:manage") && (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Nouvelle équipe
            </Button>
          )
        }
      />
      {data.teams.length === 0 ? (
        <Empty title="Aucune équipe" icon={UsersRound} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.teams.map((t) => {
            const manageable = canManageTeam(s.ctx, t.id);
            const stats = data.dash.teams.find((x) => x.team.id === t.id);
            const outside = data.members.filter((m) => !t.memberIds.includes(m.profile.id));
            return (
              <div key={t.id} className="rounded-xl border bg-card p-4" style={{ borderTop: `3px solid ${t.color}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">{t.name}</h2>
                    {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    {manageable && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(t);
                          setOpen(true);
                        }}
                        aria-label="Modifier"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {can(s.ctx, "teams:manage") && (
                      <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(t)} aria-label="Supprimer">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="my-3 flex gap-4 text-sm">
                  <span>
                    <b>{stats?.activeInterventions ?? 0}</b> <span className="text-muted-foreground">interventions</span>
                  </span>
                  <span>
                    <b>{stats?.activeDiagnostics ?? 0}</b> <span className="text-muted-foreground">diagnostics</span>
                  </span>
                  <span>
                    <b>{t.memberIds.length}</b> <span className="text-muted-foreground">membres</span>
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {t.memberIds.map((uid) => {
                    const m = data.members.find((x) => x.profile.id === uid);
                    if (!m) return null;
                    const isManager = t.manager_id === uid;
                    return (
                      <div key={uid} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                        <Avatar first={m.profile.first_name} last={m.profile.name} size="sm" color={t.color} />
                        <span className="flex-1">
                          {m.profile.first_name} {m.profile.name} <span className="text-xs text-muted-foreground">· {ROLE_LABELS[m.member.role]}</span>
                        </span>
                        {isManager ? (
                          <span className="flex items-center gap-1 text-xs text-warning">
                            <Crown className="size-3.5" /> Responsable
                          </span>
                        ) : (
                          can(s.ctx, "teams:manage") && (
                            <button onClick={() => run((svc) => svc.org.setTeamManager(t.id, uid), "Responsable désigné")} className="text-xs text-muted-foreground hover:text-warning" title="Désigner responsable">
                              <Crown className="size-3.5" />
                            </button>
                          )
                        )}
                        {manageable && (!isManager || can(s.ctx, "teams:manage")) && (
                          <button onClick={() => run((svc) => svc.org.removeTeamMember(t.id, uid), "Membre retiré")} className="text-muted-foreground hover:text-destructive" aria-label="Retirer">
                            <UserMinus className="size-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {manageable && outside.length > 0 && (
                  <NativeSelect className="mt-2" value="" onChange={(e) => e.target.value && run((svc) => svc.org.addTeamMember(t.id, e.target.value), "Membre ajouté à l'équipe")}>
                    <option value="">+ Ajouter un membre…</option>
                    {outside.map((m) => (
                      <option key={m.profile.id} value={m.profile.id}>
                        {m.profile.first_name} {m.profile.name} ({ROLE_LABELS[m.member.role]})
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>
            );
          })}
        </div>
      )}
      <TeamDialog open={open} onOpenChange={setOpen} team={editing} members={memberOptions} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer « ${deleting?.name} » ?`}
        description="Les membres restent dans le garage ; les interventions de l'équipe seront détachées."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleting) await run((svc) => svc.org.deleteTeam(deleting.id), "Équipe supprimée");
        }}
      />
    </div>
  );
}
