import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { contextFromToken } from "@/lib/auth/core";
import { SESSION_COOKIE } from "@/lib/auth/server";
import type { Ctx } from "@/lib/context";
import { AppError, httpStatus, publicMessage } from "@/lib/errors";

/** Contrôle d'origine pour les requêtes modifiant des données (protection CSRF en complément du cookie SameSite=Lax). */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new AppError("Origine de la requête refusée.", "FORBIDDEN");
}

export async function apiCtx(req: NextRequest): Promise<Ctx> {
  assertSameOrigin(req);
  const db = await getDb();
  const ctx = await contextFromToken(db, req.cookies.get(SESSION_COOKIE)?.value);
  if (!ctx) throw new AppError("Session expirée ou révoquée : reconnectez-vous.", "UNAUTHENTICATED");
  return ctx;
}

export function apiError(e: unknown) {
  const status = httpStatus(e);
  if (status === 500) console.error("[api]", e);
  return NextResponse.json({ error: publicMessage(e) }, { status, headers: { "Cache-Control": "no-store" } });
}

export function fileResponse(body: Uint8Array | string, filename: string, mime: string, inline = false) {
  const data = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return new NextResponse(data as unknown as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
