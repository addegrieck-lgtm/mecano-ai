"use server";

import { revalidatePath } from "next/cache";
import { withCtx } from "@/lib/actions";
import { requirePerm } from "@/lib/context";
import { generateDailyReport } from "@/lib/radar/daily-report";

export async function regenerateReportAction() {
  return withCtx(async (ctx) => {
    requirePerm(ctx, "sources.run");
    await generateDailyReport(ctx.db, ctx.org.id);
    revalidatePath("/reports/daily");
    return { ok: true, message: "Rapport régénéré à partir des données déjà collectées." };
  });
}
