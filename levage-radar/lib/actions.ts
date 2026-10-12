import "server-only";
import { getCtx } from "@/lib/auth/server";
import type { Ctx } from "@/lib/context";
import { AppError, publicMessage } from "@/lib/errors";
import type { ActionResult } from "@/components/forms";

/** Enveloppe commune des Server Actions : session obligatoire, erreurs converties en message utilisateur. */
export async function withCtx(fn: (ctx: Ctx) => Promise<ActionResult | void>): Promise<ActionResult> {
  const ctx = await getCtx();
  if (!ctx) return { error: "Session expirée : reconnectez-vous." };
  try {
    return (await fn(ctx)) ?? { ok: true };
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof Error && e.name === "ZodError")) console.error("[action]", e);
    // Les redirections Next.js doivent être propagées.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return { error: publicMessage(e) };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
