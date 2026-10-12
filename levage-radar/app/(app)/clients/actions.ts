"use server";

import { revalidatePath } from "next/cache";
import { withCtx, str } from "@/lib/actions";
import { createClient, createSite, updateClient } from "@/lib/services/clients";
import type { ActionResult } from "@/components/forms";

export async function createClientAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await createClient(ctx, { name: str(fd, "name"), nationalId: str(fd, "nationalId"), notes: str(fd, "notes") });
    revalidatePath("/clients");
    return { ok: true, message: "Client créé." };
  });
}

export async function updateClientAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await updateClient(ctx, id, { name: str(fd, "name"), nationalId: str(fd, "nationalId"), notes: str(fd, "notes") });
    revalidatePath(`/clients/${id}`);
    return { ok: true, message: "Client mis à jour." };
  });
}

export async function createSiteAction(clientId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await createSite(ctx, { clientId, name: str(fd, "name"), address: str(fd, "address"), postalCode: str(fd, "postalCode"), city: str(fd, "city"), contactName: str(fd, "contactName"), contactPhone: str(fd, "contactPhone"), notes: str(fd, "notes") });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "Site ajouté." };
  });
}
