import type { GarageMember, Intervention, Role } from "@/types";

/**
 * Système de permissions extensible.
 * Une permission = "ressource:action". Chaque rôle reçoit un ensemble de base ;
 * un membre peut recevoir des permissions supplémentaires via garage_members.permissions.
 */
export const PERMISSIONS = [
  "garage:manage",
  "members:manage",
  "teams:manage",
  "teams:manage_own",
  "clients:read",
  "clients:write",
  "clients:delete",
  "vehicles:read",
  "vehicles:write",
  "vehicles:delete",
  "diagnostics:read",
  "diagnostics:write",
  "obd:use",
  "obd:clear_dtc",
  "quotes:read",
  "quotes:write",
  "quotes:approve",
  "interventions:read",
  "interventions:write",
  "interventions:assign",
  "interventions:delete",
  "planning:read",
  "catalog:manage",
  "photos:write",
  "intake:write",
  "stats:view",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ALL: Permission[] = [
  "clients:read",
  "vehicles:read",
  "diagnostics:read",
  "quotes:read",
  "interventions:read",
  "planning:read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  TEAM_MANAGER: [
    ...READ_ALL,
    "teams:manage_own",
    "clients:write",
    "vehicles:write",
    "diagnostics:write",
    "obd:use",
    "obd:clear_dtc",
    "quotes:write",
    "interventions:write",
    "interventions:assign",
    "photos:write",
    "intake:write",
    "stats:view",
  ],
  MECHANIC: [
    ...READ_ALL,
    "vehicles:write",
    "diagnostics:write",
    "obd:use",
    "obd:clear_dtc",
    "quotes:write",
    "interventions:write",
    "photos:write",
    "intake:write",
  ],
  RECEPTION: [
    ...READ_ALL,
    "clients:write",
    "clients:delete",
    "vehicles:write",
    "quotes:write",
    "quotes:approve",
    "interventions:write",
    "interventions:assign",
    "photos:write",
    "intake:write",
  ],
  VIEWER: READ_ALL,
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Patron",
  ADMIN: "Administrateur",
  TEAM_MANAGER: "Chef d'équipe",
  MECHANIC: "Mécanicien",
  RECEPTION: "Réception",
  VIEWER: "Lecture seule",
};

export interface AccessContext {
  userId: string;
  garageId: string;
  role: Role;
  extraPermissions: string[];
  /** Équipes dont l'utilisateur est membre. */
  teamIds: string[];
  /** Équipes dont l'utilisateur est responsable. */
  managedTeamIds: string[];
}

export class PermissionError extends Error {
  constructor(message = "Action non autorisée") {
    super(message);
    this.name = "PermissionError";
  }
}

export function permissionsFor(role: Role, extra: string[] = []): Set<string> {
  return new Set<string>([...ROLE_PERMISSIONS[role], ...extra]);
}

export function can(ctx: Pick<AccessContext, "role" | "extraPermissions">, permission: Permission): boolean {
  return permissionsFor(ctx.role, ctx.extraPermissions).has(permission);
}

export function assertCan(ctx: Pick<AccessContext, "role" | "extraPermissions">, permission: Permission): void {
  if (!can(ctx, permission)) {
    throw new PermissionError(`Permission requise : ${permission}`);
  }
}

export function isGarageWide(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "RECEPTION" || role === "VIEWER";
}

/**
 * Visibilité des interventions / tâches du planning :
 * - OWNER / ADMIN / RECEPTION / VIEWER : tout le garage
 * - TEAM_MANAGER : les interventions de ses équipes + celles qui lui sont attribuées
 * - MECHANIC : uniquement celles qui lui sont attribuées
 */
export function canSeeIntervention(ctx: AccessContext, i: Pick<Intervention, "garage_id" | "team_id" | "mechanic_id">): boolean {
  if (i.garage_id !== ctx.garageId) return false;
  if (isGarageWide(ctx.role)) return true;
  if (i.mechanic_id === ctx.userId) return true;
  if (ctx.role === "TEAM_MANAGER") {
    return !!i.team_id && (ctx.managedTeamIds.includes(i.team_id) || ctx.teamIds.includes(i.team_id));
  }
  return false;
}

/** Un mécanicien ne peut modifier que ses interventions ; le chef d'équipe celles de son équipe. */
export function canEditIntervention(ctx: AccessContext, i: Pick<Intervention, "garage_id" | "team_id" | "mechanic_id">): boolean {
  if (!can(ctx, "interventions:write")) return false;
  if (ctx.role === "MECHANIC") return i.garage_id === ctx.garageId && (i.mechanic_id === ctx.userId || !i.mechanic_id);
  return canSeeIntervention(ctx, i);
}

export function canManageTeam(ctx: AccessContext, teamId: string): boolean {
  if (can(ctx, "teams:manage")) return true;
  return can(ctx, "teams:manage_own") && ctx.managedTeamIds.includes(teamId);
}

export function memberToContext(member: GarageMember, teamIds: string[], managedTeamIds: string[]): AccessContext {
  return {
    userId: member.user_id,
    garageId: member.garage_id,
    role: member.role,
    extraPermissions: member.permissions ?? [],
    teamIds,
    managedTeamIds,
  };
}
