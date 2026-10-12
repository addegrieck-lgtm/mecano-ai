import type { NextRequest } from "next/server";
import { apiCtx, apiError, fileResponse } from "@/lib/api";
import { parseSearch } from "@/lib/services/opportunities";
import { exportOpportunitiesCsv } from "@/lib/services/opp-exports";
import { DEMO_COOKIE, demoEnabled } from "@/lib/demo";

export async function GET(req: NextRequest) {
  try {
    const ctx = await apiCtx(req);
    const sp = new URLSearchParams(req.nextUrl.searchParams);
    const fields = sp.getAll("fields").flatMap((f) => f.split(","));
    sp.delete("fields");
    sp.delete("demo");
    const demo = demoEnabled() && req.cookies.get(DEMO_COOKIE)?.value === "1";
    const { csv, filename } = await exportOpportunitiesCsv(ctx, parseSearch(sp), fields, { demo });
    return fileResponse(csv, filename, "text/csv; charset=utf-8");
  } catch (e) {
    return apiError(e);
  }
}
