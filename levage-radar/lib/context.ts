import type { DB } from "@/lib/db";
import type { OrgSettings } from "@/lib/db/schema";
import type { Permission } from "@/lib/auth/permissions";
import { forbidden } from "@/lib/errors";

/** Contexte d'exécution d'une requête authentifiée : tous les services le reçoivent. */
export type Ctx = {
  db: DB;
  user: { id: string; orgId: string; email: string; name: string; role: string; previousLoginAt?: Date | null };
  org: { id: string; name: string; settings: OrgSettings };
  perms: Set<Permission>;
};

export const can = (ctx: Ctx, p: Permission) => ctx.perms.has(p);

export function requirePerm(ctx: Ctx, ...anyOf: Permission[]) {
  if (!anyOf.some((p) => ctx.perms.has(p))) throw forbidden();
}
