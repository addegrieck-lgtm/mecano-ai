import type { NextRequest } from "next/server";
import { apiCtx, apiError, fileResponse } from "@/lib/api";
import { opportunityPdf } from "@/lib/services/opp-exports";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx(req);
    const { bytes, filename } = await opportunityPdf(ctx, (await params).id);
    return fileResponse(bytes, filename, "application/pdf");
  } catch (e) {
    return apiError(e);
  }
}
