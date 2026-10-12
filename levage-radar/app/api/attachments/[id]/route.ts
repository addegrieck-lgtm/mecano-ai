import { NextResponse, type NextRequest } from "next/server";
import { apiCtx, apiError, fileResponse } from "@/lib/api";
import { deleteAttachment, readAttachment } from "@/lib/services/attachments";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx(req);
    const { meta, bytes } = await readAttachment(ctx, (await params).id);
    return fileResponse(bytes, meta.filename, meta.mime, meta.mime.startsWith("image/") || meta.mime === "application/pdf");
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx(req);
    await deleteAttachment(ctx, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
