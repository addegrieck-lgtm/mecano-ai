import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { contextFromToken } from "./core";
import type { Ctx } from "@/lib/context";
import type { Permission } from "./permissions";

export const SESSION_COOKIE = "lr_session";

export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Contexte de la requête courante (mémorisé pour la durée du rendu). */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const ctx = await contextFromToken(db, token);
  if (!ctx) return null;
  if (ctx.renewed) {
    try {
      (await cookies()).set(SESSION_COOKIE, token, cookieOptions(ctx.renewed));
    } catch {
      // Rendu d'un Server Component : le cookie sera prolongé lors de la prochaine action.
    }
  }
  return ctx;
});

/** Pages : redirige vers la connexion si nécessaire, puis vérifie la permission. */
export async function requireCtx(...anyOf: Permission[]): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (anyOf.length && !anyOf.some((p) => ctx.perms.has(p))) redirect("/forbidden");
  return ctx;
}

export async function clientMeta() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return {
    ip: (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) ?? null,
    userAgent: h.get("user-agent"),
  };
}
