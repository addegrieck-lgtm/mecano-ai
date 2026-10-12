import type { NextRequest } from "next/server";
import { apiCtx, apiError, fileResponse } from "@/lib/api";
import { exportMissionJson, exportMissionPdf } from "@/lib/services/mission-export";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx(req);
    const id = (await params).id;
    if (req.nextUrl.searchParams.get("format") === "json") {
      const { json, filename } = await exportMissionJson(ctx, id);
      return fileResponse(json, filename, "application/json; charset=utf-8");
    }
    const { bytes, filename } = await exportMissionPdf(ctx, id, { includeHistory: req.nextUrl.searchParams.get("history") === "1" });
    return fileResponse(bytes, filename, "application/pdf");
  } catch (e) {
    return apiError(e);
  }
}
