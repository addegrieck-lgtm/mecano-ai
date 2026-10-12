import { NextResponse, type NextRequest } from "next/server";
import { apiCtx, apiError } from "@/lib/api";
import { applyOps } from "@/lib/services/missions";
import { invalid } from "@/lib/errors";

/** Synchronisation : applique une file d'opérations (en ligne immédiatement, ou au retour du réseau). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx(req);
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.ops)) throw invalid("Corps de requête invalide.");
    const res = await applyOps(ctx, (await params).id, body.ops);
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
