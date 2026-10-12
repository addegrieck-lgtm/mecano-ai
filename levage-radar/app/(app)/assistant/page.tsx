import { requireCtx } from "@/lib/auth/server";
import { llmStatus } from "@/lib/assistant/llm";
import { Alert, PageHeader } from "@/components/ui";
import { AssistantChat } from "./chat";

export const metadata = { title: "Assistant commercial" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ opp?: string }> }) {
  const ctx = await requireCtx("assistant.use");
  const { opp } = await searchParams;
  const st = llmStatus(ctx);
  return (
    <>
      <PageHeader title="Assistant commercial" subtitle="Interroge uniquement les données collectées par le radar et cite ses sources." />
      <div className="mb-4">
        <Alert tone="blue" title="Mode de fonctionnement">
          Réponses par règles et requêtes sur la base (gratuit, sans service externe). {st.allowed ? `Reformulation par modèle de langage active : ${st.reason}` : st.reason} Les notes internes ne sont jamais transmises à un service externe.
        </Alert>
      </div>
      <AssistantChat defaultOpp={opp ?? ""} />
    </>
  );
}
