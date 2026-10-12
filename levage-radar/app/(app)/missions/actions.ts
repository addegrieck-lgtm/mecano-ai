"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withCtx, str } from "@/lib/actions";
import { createMission, saveSnapshot, setMissionStatus } from "@/lib/services/missions";
import type { ActionResult } from "@/components/forms";

export async function statusMissionAction(id: string, status: string, confirmManual: boolean): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await setMissionStatus(ctx, id, status, { confirmManual });
    revalidatePath("/missions");
    return { ok: true, message: "Statut mis à jour." };
  });
}

export async function snapshotMissionAction(id: string, label: string): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await saveSnapshot(ctx, id, label);
    return { ok: true, message: "Version enregistrée." };
  });
}

export async function createMissionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let target = "";
  const res = await withCtx(async (ctx) => {
    const domain = str(fd, "domain") as "LEVAGE" | "ELECTRICITE";
    const m = await createMission(ctx, {
      domain,
      templateVersionId: str(fd, "templateVersionId"),
      title: str(fd, "title"),
      clientId: str(fd, "clientId"),
      siteId: str(fd, "siteId"),
      internalRef: str(fd, "internalRef"),
      address: str(fd, "address"),
      scheduledAt: str(fd, "scheduledAt") || undefined,
      inspectorId: str(fd, "inspectorId"),
      generalNotes: str(fd, "generalNotes"),
    });
    target = `/missions/${domain === "LEVAGE" ? "levage" : "electricite"}/${m.id}`;
  });
  if (target) redirect(target);
  return res;
}
