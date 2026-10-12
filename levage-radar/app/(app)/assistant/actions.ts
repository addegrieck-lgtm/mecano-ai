"use server";

import { withCtx, str } from "@/lib/actions";
import { answerQuestion } from "@/lib/assistant/engine";
import { rephrase } from "@/lib/assistant/llm";
import { isDemoView } from "@/lib/demo-server";
import type { ActionResult } from "@/components/forms";

export async function askAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    const q = str(fd, "question").trim().slice(0, 500);
    if (!q) return { error: "Posez une question." };
    const ids = str(fd, "oppIds").split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 3);
    const answer = await answerQuestion(ctx, q, { oppIds: ids, demo: await isDemoView() });
    const llm = await rephrase(ctx, q, answer);
    return { ok: true, data: { question: q, answer, llm } };
  });
}
