"use server";

import { revalidatePath } from "next/cache";
import { withCtx, str, bool } from "@/lib/actions";
import { addNote, assignOpportunity, createAlert, createTask, deleteAlert, deleteSavedSearch, saveSearch, setTaskDone, setTrackingStatus, toggleFavorite } from "@/lib/services/opportunities";
import { runCollection } from "@/lib/radar/collect";
import { requirePerm } from "@/lib/context";
import type { ActionResult } from "@/components/forms";

export async function statusAction(id: string, _: ActionResult, fd: FormData) {
  return withCtx(async (ctx) => {
    await setTrackingStatus(ctx, id, str(fd, "status"), str(fd, "reason") || undefined);
    revalidatePath(`/radar/${id}`);
    return { ok: true, message: "Statut mis à jour." };
  });
}

export async function favoriteAction(id: string) {
  await withCtx(async (ctx) => {
    await toggleFavorite(ctx, id);
    revalidatePath(`/radar/${id}`);
  });
}

export async function assignAction(id: string, _: ActionResult, fd: FormData) {
  return withCtx(async (ctx) => {
    await assignOpportunity(ctx, id, str(fd, "assigneeId") || null);
    revalidatePath(`/radar/${id}`);
    return { ok: true, message: "Responsable enregistré." };
  });
}

export async function noteAction(entityType: "opportunity" | "buyer", id: string, _: ActionResult, fd: FormData) {
  return withCtx(async (ctx) => {
    await addNote(ctx, entityType, id, str(fd, "body"));
    revalidatePath(entityType === "opportunity" ? `/radar/${id}` : `/buyers/${id}`);
    return { ok: true, message: "Note ajoutée." };
  });
}

export async function taskAction(_: ActionResult, fd: FormData) {
  return withCtx(async (ctx) => {
    const opp = str(fd, "opportunityId");
    const buyer = str(fd, "buyerId");
    await createTask(ctx, {
      title: str(fd, "title"),
      description: str(fd, "description"),
      opportunityId: opp || null,
      buyerId: buyer || null,
      assigneeId: str(fd, "assigneeId"),
      dueAt: str(fd, "dueAt") || undefined,
      remindAt: str(fd, "remindAt") || undefined,
    });
    if (opp) revalidatePath(`/radar/${opp}`);
    revalidatePath("/tasks");
    return { ok: true, message: "Tâche créée." };
  });
}

export async function taskDoneAction(taskId: string, done: boolean, path: string) {
  await withCtx(async (ctx) => {
    await setTaskDone(ctx, taskId, done);
    revalidatePath(path);
  });
}

export async function saveSearchAction(_: ActionResult, fd: FormData) {
  return withCtx(async (ctx) => {
    await saveSearch(ctx, str(fd, "name"), str(fd, "query"));
    revalidatePath("/radar");
    revalidatePath("/alerts");
    return { ok: true, message: "Recherche enregistrée." };
  });
}

export async function deleteSearchAction(id: string) {
  await withCtx(async (ctx) => {
    await deleteSavedSearch(ctx, id);
    revalidatePath("/alerts");
    revalidatePath("/radar");
  });
}

export async function alertAction(_: ActionResult, fd: FormData) {
  return withCtx(async (ctx) => {
    await createAlert(ctx, {
      name: str(fd, "name"),
      kind: str(fd, "kind") as "buyer" | "keyword" | "department" | "family",
      buyerId: str(fd, "buyerId") || undefined,
      keyword: str(fd, "keyword") || undefined,
      department: str(fd, "department") || undefined,
      family: str(fd, "family") || undefined,
      domain: (str(fd, "domain") || "") as "" | "LEVAGE" | "ELECTRICITE",
    });
    revalidatePath("/alerts");
    if (str(fd, "buyerId")) revalidatePath(`/buyers/${str(fd, "buyerId")}`);
    return { ok: true, message: "Alerte créée : elle sera évaluée à chaque rapport quotidien." };
  });
}

export async function deleteAlertAction(id: string) {
  await withCtx(async (ctx) => {
    await deleteAlert(ctx, id);
    revalidatePath("/alerts");
  });
}

/** Collecte manuelle (même code que la collecte planifiée). */
export async function collectAction(_: ActionResult, fd: FormData) {
  return withCtx(async (ctx) => {
    requirePerm(ctx, "sources.run");
    const source = str(fd, "source");
    const res = await runCollection(ctx.db, {
      trigger: bool(fd, "retry") ? "retry" : "manual",
      userId: ctx.user.id,
      sourceIds: source ? [source] : undefined,
    });
    revalidatePath("/sources");
    revalidatePath("/dashboard");
    const failed = res.filter((r) => r.status === "failed");
    const summary = res.map((r) => `${r.sourceId} : ${r.status === "success" ? "réussie" : r.status === "partial" ? "partielle" : r.status === "skipped" ? "ignorée" : "échec"} (${r.fetched} avis, ${r.created} nouveaux, ${r.merged} fusionnés)${r.error ? ` — ${r.error}` : ""}`).join(" · ");
    return failed.length === res.length && res.length ? { error: `Collecte en échec — ${summary}` } : { ok: true, message: summary || "Aucune source à collecter." };
  });
}
