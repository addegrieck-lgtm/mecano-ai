import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { attachments, fileBlobs, missionItems, missions, observations } from "@/lib/db/schema";
import { invalid, notFound } from "@/lib/errors";
import { loadMission } from "./missions";

/**
 * Pièces jointes : type réel vérifié par signature binaire (le type déclaré par le navigateur n'est pas cru),
 * taille limitée, nom de fichier assaini. Stockage en base (bytea) — adapté au volume d'un outil métier ;
 * pour de gros volumes, prévoir un stockage objet (voir docs).
 */
export const LIMITS = { photo: 8 * 1024 * 1024, document: 15 * 1024 * 1024 };

export function sniffMime(buf: Uint8Array): string | null {
  const b = buf;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "fichier";
  const clean = base
    .normalize("NFKC")
    .replace(/[^\w.\- ()À-ÿ]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return clean || "fichier";
}

const UploadSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["photo", "document"]),
  itemId: z.uuid().nullable().optional(),
  observationId: z.uuid().nullable().optional(),
  caption: z.string().trim().max(500).optional().nullable(),
  filename: z.string().min(1).max(300),
});

export async function uploadAttachment(ctx: Ctx, missionId: string, meta: z.input<typeof UploadSchema>, bytes: Uint8Array) {
  const m = await loadMission(ctx, missionId, "edit");
  const data = UploadSchema.parse(meta);
  if (bytes.length === 0) throw invalid("Fichier vide.");
  if (bytes.length > LIMITS[data.kind]) throw invalid(`Fichier trop volumineux (${Math.round(LIMITS[data.kind] / 1048576)} Mo maximum).`);
  const mime = sniffMime(bytes);
  if (!mime) throw invalid("Type de fichier non autorisé (JPEG, PNG, WebP ou PDF uniquement).");
  if (data.kind === "photo" && !mime.startsWith("image/")) throw invalid("Une photo doit être une image JPEG, PNG ou WebP.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // Idempotence (renvoi après coupure réseau) : même identifiant + même contenu → déjà enregistré.
  const [existing] = await ctx.db.select().from(attachments).where(eq(attachments.id, data.id));
  if (existing) {
    if (existing.missionId === m.id && existing.sha256 === sha256) return existing;
    throw invalid("Identifiant de pièce jointe déjà utilisé.");
  }
  if (data.itemId) {
    const [it] = await ctx.db.select({ id: missionItems.id }).from(missionItems).where(and(eq(missionItems.id, data.itemId), eq(missionItems.missionId, m.id)));
    if (!it) throw invalid("Élément introuvable.");
  }
  if (data.observationId) {
    const [o] = await ctx.db.select({ id: observations.id }).from(observations).where(and(eq(observations.id, data.observationId), eq(observations.missionId, m.id)));
    if (!o) throw invalid("Observation introuvable.");
  }
  const row = await ctx.db.transaction(async (tx) => {
    const [blob] = await tx.insert(fileBlobs).values({ orgId: ctx.org.id, data: Buffer.from(bytes) }).returning({ id: fileBlobs.id });
    const [a] = await tx
      .insert(attachments)
      .values({
        id: data.id,
        orgId: ctx.org.id,
        missionId: m.id,
        itemId: data.itemId ?? null,
        observationId: data.observationId ?? null,
        kind: data.kind,
        filename: sanitizeFilename(data.filename),
        mime,
        size: bytes.length,
        sha256,
        blobId: blob.id,
        caption: data.caption || null,
        uploadedBy: ctx.user.id,
      })
      .returning();
    await tx.update(missions).set({ version: m.version + 1, updatedAt: new Date() }).where(eq(missions.id, m.id));
    return a;
  });
  await audit(ctx, "mission", m.id, "attachment_add", { attachmentId: row.id, filename: row.filename, kind: row.kind, size: row.size });
  return row;
}

export async function readAttachment(ctx: Ctx, attachmentId: string) {
  if (!z.uuid().safeParse(attachmentId).success) throw notFound();
  const [a] = await ctx.db.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.orgId, ctx.org.id), isNull(attachments.deletedAt)));
  if (!a || !a.blobId) throw notFound();
  await loadMission(ctx, a.missionId); // contrôle d'accès au dossier
  const [blob] = await ctx.db.select({ data: fileBlobs.data }).from(fileBlobs).where(eq(fileBlobs.id, a.blobId));
  if (!blob) throw notFound();
  return { meta: a, bytes: new Uint8Array(blob.data) };
}

export async function deleteAttachment(ctx: Ctx, attachmentId: string) {
  if (!z.uuid().safeParse(attachmentId).success) throw notFound();
  const [a] = await ctx.db.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.orgId, ctx.org.id), isNull(attachments.deletedAt)));
  if (!a) throw notFound();
  const m = await loadMission(ctx, a.missionId, "edit");
  await ctx.db.transaction(async (tx) => {
    await tx.update(attachments).set({ deletedAt: new Date(), blobId: null }).where(eq(attachments.id, a.id));
    if (a.blobId) await tx.delete(fileBlobs).where(eq(fileBlobs.id, a.blobId));
    await tx.update(missions).set({ version: m.version + 1, updatedAt: new Date() }).where(eq(missions.id, m.id));
  });
  await audit(ctx, "mission", m.id, "attachment_delete", { attachmentId: a.id, filename: a.filename });
}
