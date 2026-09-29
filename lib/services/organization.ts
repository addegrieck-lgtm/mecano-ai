import { assertCan, canManageTeam, PermissionError } from "@/lib/permissions";
import { nowIso, uid, type TenantRepository } from "@/lib/data/repository";
import { garageSchema, garageSettingsSchema, memberSchema, parse, teamSchema } from "@/lib/validation/schemas";
import type { Garage, GarageMember, Profile, Role, Team } from "@/types";
import { audit } from "./core";

export interface MemberView {
  member: GarageMember;
  profile: Profile;
  teams: Team[];
}

export function organizationService(r: TenantRepository) {
  const store = r.store;

  async function garage(): Promise<Garage> {
    const g = await store.get("garages", r.garageId);
    if (!g) throw new Error("Garage introuvable");
    return g;
  }

  async function updateGarage(input: unknown): Promise<Garage> {
    assertCan(r.ctx, "garage:manage");
    const data = parse(garageSchema, input);
    const g = await store.update("garages", r.garageId, { ...data, updated_at: nowIso() });
    await audit(r, "garage.update", "garage", g.id);
    return g;
  }

  async function updateSettings(input: unknown): Promise<Garage> {
    assertCan(r.ctx, "garage:manage");
    const data = parse(garageSettingsSchema, input);
    const g = await garage();
    const updated = await store.update("garages", r.garageId, { settings: { ...g.settings, ...data }, updated_at: nowIso() });
    await audit(r, "garage.settings", "garage", g.id, data);
    return updated;
  }

  async function members(): Promise<MemberView[]> {
    const [list, teams, links] = await Promise.all([r.list("garage_members"), r.list("teams"), r.list("team_members")]);
    const out: MemberView[] = [];
    for (const member of list) {
      const profile = await store.get("profiles", member.user_id);
      if (!profile) continue;
      const teamIds = new Set(links.filter((l) => l.user_id === member.user_id).map((l) => l.team_id));
      out.push({ member, profile, teams: teams.filter((t) => teamIds.has(t.id)) });
    }
    return out.sort((a, b) => a.profile.first_name.localeCompare(b.profile.first_name));
  }

  async function profileOf(userId: string | null | undefined): Promise<Profile | null> {
    if (!userId) return null;
    const [m] = await r.list("garage_members", { user_id: userId });
    if (!m) return null; // un profil n'est visible que s'il appartient au garage courant
    return store.get("profiles", userId);
  }

  /** Mode démo : crée le profil. En production, passe par une invitation Supabase Auth (/api/invite). */
  async function addMember(input: unknown): Promise<MemberView> {
    assertCan(r.ctx, "members:manage");
    const data = parse(memberSchema, input);
    if (data.role === "OWNER" && r.ctx.role !== "OWNER") throw new PermissionError("Seul le patron peut nommer un autre patron");
    const existing = (await store.list("profiles", { email: data.email.toLowerCase() }))[0];
    const profile: Profile =
      existing ??
      (await store.insert("profiles", {
        id: uid(),
        first_name: data.first_name,
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        avatar: null,
        role: data.role,
        created_at: nowIso(),
      }));
    const already = await r.list("garage_members", { user_id: profile.id });
    if (already.length) throw new Error("Cette personne est déjà membre du garage");
    if (data.team_id) await r.require("teams", data.team_id, "Équipe");
    const member = await r.insert("garage_members", { user_id: profile.id, role: data.role, team_id: data.team_id, permissions: [] });
    if (data.team_id) await r.insert("team_members", { team_id: data.team_id, user_id: profile.id });
    await audit(r, "member.add", "garage_member", member.id, { email: profile.email, role: data.role });
    const teams = data.team_id ? [await r.require("teams", data.team_id)] : [];
    return { member, profile, teams };
  }

  async function updateMemberRole(memberId: string, role: Role, extraPermissions?: string[]): Promise<GarageMember> {
    assertCan(r.ctx, "members:manage");
    const m = await r.require("garage_members", memberId, "Membre");
    if ((role === "OWNER" || m.role === "OWNER") && r.ctx.role !== "OWNER") throw new PermissionError("Seul le patron peut modifier un rôle patron");
    if (m.role === "OWNER" && role !== "OWNER") {
      const owners = (await r.list("garage_members", { role: "OWNER" })).length;
      if (owners <= 1) throw new Error("Le garage doit conserver au moins un patron");
    }
    const updated = await r.update("garage_members", memberId, { role, ...(extraPermissions ? { permissions: extraPermissions } : {}) });
    await audit(r, "member.permissions", "garage_member", memberId, { from: m.role, to: role, permissions: extraPermissions ?? m.permissions });
    return updated;
  }

  async function removeMember(memberId: string): Promise<void> {
    assertCan(r.ctx, "members:manage");
    const m = await r.require("garage_members", memberId, "Membre");
    if (m.user_id === r.ctx.userId) throw new Error("Vous ne pouvez pas vous retirer vous-même");
    if (m.role === "OWNER" && r.ctx.role !== "OWNER") throw new PermissionError();
    for (const link of await r.list("team_members", { user_id: m.user_id })) await r.remove("team_members", link.id);
    for (const t of await r.list("teams", { manager_id: m.user_id })) await r.update("teams", t.id, { manager_id: null });
    await r.remove("garage_members", memberId);
    await audit(r, "member.remove", "garage_member", memberId, { user_id: m.user_id });
  }

  async function teams(): Promise<(Team & { memberIds: string[] })[]> {
    const [list, links] = await Promise.all([r.list("teams"), r.list("team_members")]);
    return list
      .map((t) => ({ ...t, memberIds: links.filter((l) => l.team_id === t.id).map((l) => l.user_id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function createTeam(input: unknown): Promise<Team> {
    assertCan(r.ctx, "teams:manage");
    const data = parse(teamSchema, input);
    if (data.manager_id && !(await r.list("garage_members", { user_id: data.manager_id })).length) throw new Error("Responsable inconnu");
    const team = await r.insert("teams", data);
    if (data.manager_id) await r.insert("team_members", { team_id: team.id, user_id: data.manager_id });
    await audit(r, "team.create", "team", team.id, { name: team.name });
    return team;
  }

  async function updateTeam(teamId: string, input: unknown): Promise<Team> {
    if (!canManageTeam(r.ctx, teamId)) throw new PermissionError();
    const data = parse(teamSchema, input);
    const current = await r.require("teams", teamId, "Équipe");
    // Un chef d'équipe ne peut pas se retirer / changer le responsable (réservé à l'administration)
    if (data.manager_id !== current.manager_id) assertCan(r.ctx, "teams:manage");
    const team = await r.update("teams", teamId, data);
    if (data.manager_id && !(await r.list("team_members", { team_id: teamId, user_id: data.manager_id })).length) {
      await r.insert("team_members", { team_id: teamId, user_id: data.manager_id });
    }
    await audit(r, "team.update", "team", teamId);
    return team;
  }

  async function deleteTeam(teamId: string): Promise<void> {
    assertCan(r.ctx, "teams:manage");
    await r.require("teams", teamId, "Équipe");
    for (const link of await r.list("team_members", { team_id: teamId })) await r.remove("team_members", link.id);
    for (const m of await r.list("garage_members", { team_id: teamId })) await r.update("garage_members", m.id, { team_id: null });
    for (const i of await r.list("interventions", { team_id: teamId })) await r.update("interventions", i.id, { team_id: null });
    await r.remove("teams", teamId);
    await audit(r, "team.delete", "team", teamId);
  }

  async function addTeamMember(teamId: string, userId: string): Promise<void> {
    if (!canManageTeam(r.ctx, teamId)) throw new PermissionError();
    await r.require("teams", teamId, "Équipe");
    const [member] = await r.list("garage_members", { user_id: userId });
    if (!member) throw new Error("Cette personne n'est pas membre du garage");
    if ((await r.list("team_members", { team_id: teamId, user_id: userId })).length) return;
    await r.insert("team_members", { team_id: teamId, user_id: userId });
    if (!member.team_id) await r.update("garage_members", member.id, { team_id: teamId });
    await audit(r, "team.member_add", "team", teamId, { user_id: userId });
  }

  async function removeTeamMember(teamId: string, userId: string): Promise<void> {
    if (!canManageTeam(r.ctx, teamId)) throw new PermissionError();
    const team = await r.require("teams", teamId, "Équipe");
    if (team.manager_id === userId) assertCan(r.ctx, "teams:manage");
    for (const link of await r.list("team_members", { team_id: teamId, user_id: userId })) await r.remove("team_members", link.id);
    const [member] = await r.list("garage_members", { user_id: userId });
    if (member?.team_id === teamId) {
      const other = (await r.list("team_members", { user_id: userId }))[0];
      await r.update("garage_members", member.id, { team_id: other?.team_id ?? null });
    }
    if (team.manager_id === userId) await r.update("teams", teamId, { manager_id: null });
    await audit(r, "team.member_remove", "team", teamId, { user_id: userId });
  }

  async function setTeamManager(teamId: string, userId: string | null): Promise<void> {
    assertCan(r.ctx, "teams:manage");
    await r.require("teams", teamId, "Équipe");
    if (userId) {
      if (!(await r.list("garage_members", { user_id: userId })).length) throw new Error("Membre inconnu");
      if (!(await r.list("team_members", { team_id: teamId, user_id: userId })).length) await r.insert("team_members", { team_id: teamId, user_id: userId });
    }
    await r.update("teams", teamId, { manager_id: userId });
    await audit(r, "team.manager", "team", teamId, { manager_id: userId });
  }

  return {
    garage,
    updateGarage,
    updateSettings,
    members,
    profileOf,
    addMember,
    updateMemberRole,
    removeMember,
    teams,
    createTeam,
    updateTeam,
    deleteTeam,
    addTeamMember,
    removeTeamMember,
    setTeamManager,
  };
}
