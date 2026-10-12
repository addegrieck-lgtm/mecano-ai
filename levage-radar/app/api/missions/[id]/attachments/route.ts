import { NextResponse, type NextRequest } from "next/server";
import { apiCtx, apiError } from "@/lib/api";
import { uploadAttachment } from "@/lib/services/attachments";
import { invalid } from "@/lib/errors";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx(req);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 16 * 1024 * 1024) throw invalid("Fichier trop volumineux.");
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof Blob)) throw invalid("Fichier manquant.");
    const s = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : undefined);
    const att = await uploadAttachment(
      ctx,
      (await params).id,
      { id: s("id") ?? "", kind: (s("kind") ?? "photo") as "photo" | "document", itemId: s("itemId") || null, observationId: s("observationId") || null, caption: s("caption"), filename: (file as File).name || s("filename") || "fichier" },
      new Uint8Array(await file.arrayBuffer()),
    );
    return NextResponse.json({ id: att.id, filename: att.filename, mime: att.mime, size: att.size });
  } catch (e) {
    return apiError(e);
  }
}
