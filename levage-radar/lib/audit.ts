import type { Ctx } from "@/lib/context";
import type { DB } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

export async function audit(
  ctx: Pick<Ctx, "db"> & { user?: { id: string; orgId: string } | null },
  entityType: string,
  entityId: string | null,
  action: string,
  details: Record<string, unknown> = {},
) {
  await ctx.db.insert(auditEvents).values({
    orgId: ctx.user?.orgId ?? null,
    userId: ctx.user?.id ?? null,
    entityType,
    entityId,
    action,
    details,
  });
}

export async function systemAudit(db: DB, entityType: string, entityId: string | null, action: string, details: Record<string, unknown> = {}) {
  await db.insert(auditEvents).values({ orgId: null, userId: null, entityType, entityId, action, details });
}
