import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { apiCtx, apiError } from "@/lib/api";
import { getMissionFull } from "@/lib/services/missions";
import { listAllSites, listClients } from "@/lib/services/clients";
import { users } from "@/lib/db/schema";
import { reportPerms, type Domain } from "@/lib/auth/permissions";

/** État complet d'un dossier (éditeur ; mis en cache chiffré sur l'appareil pour le mode hors ligne). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx(req);
    const full = await getMissionFull(ctx, (await params).id);
    const canClients = ctx.perms.has("clients.read");
    const manageAll = ctx.perms.has(reportPerms(full.mission.domain as Domain).manageAll);
    const members = manageAll
      ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, ctx.org.id), eq(users.active, true))).orderBy(asc(users.name))
      : [];
    return NextResponse.json(
      {
        ...full,
        userId: ctx.user.id,
        canExport: ctx.perms.has("reports.export"),
        canReassign: manageAll,
        allowDictation: !!ctx.org.settings.allowBrowserDictation,
        members,
        clients: canClients ? (await listClients(ctx)).map((c) => ({ id: c.id, name: c.name })) : [],
        sites: canClients ? (await listAllSites(ctx)).map((s) => ({ id: s.id, clientId: s.clientId, name: s.name })) : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
