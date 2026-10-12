import { z, ZodError } from "zod";

// Messages de validation en français.
z.config(z.locales.fr());

/** Erreurs métier : le message est destiné à l'utilisateur (aucune donnée interne). */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "UNAUTHENTICATED" | "RATE_LIMITED" | "UNAVAILABLE",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Accès refusé.") => new AppError(msg, "FORBIDDEN");
/** Un élément d'une autre organisation est traité comme inexistant (anti-énumération). */
export const notFound = (msg = "Élément introuvable.") => new AppError(msg, "NOT_FOUND");
export const invalid = (msg: string, details?: unknown) => new AppError(msg, "VALIDATION", details);
export const conflict = (msg: string, details?: unknown) => new AppError(msg, "CONFLICT", details);

export function httpStatus(e: unknown): number {
  if (e instanceof ZodError) return 400;
  if (!(e instanceof AppError)) return 500;
  return { FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, CONFLICT: 409, UNAUTHENTICATED: 401, RATE_LIMITED: 429, UNAVAILABLE: 503 }[e.code];
}

export function publicMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => (i.path.length ? `${i.path.join(".")} : ${i.message}` : i.message)).join(" ; ");
  return "Une erreur inattendue est survenue.";
}
