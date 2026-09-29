import { z } from "zod";
import { getAIProvider, getAIStatus } from "@/lib/ai";

const str = (max: number) => z.string().max(max);
const vehicle = z
  .object({
    make: str(60).optional(),
    model: str(60).optional(),
    version: str(80).nullable().optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    engine: str(80).nullable().optional(),
    fuel: z.enum(["DIESEL", "ESSENCE", "HYBRIDE", "HYBRIDE_RECHARGEABLE", "ELECTRIQUE", "GPL", "AUTRE"]).nullable().optional(),
    mileage: z.number().min(0).max(3_000_000).nullable().optional(),
  })
  .optional();

const diagnosisInput = z.object({
  vehicle,
  symptoms: z.array(str(200)).max(30),
  codes: z.array(z.string().regex(/^[PCBU][0-3][0-9A-F]{3}$/i)).max(30),
  complaint: str(2000).nullable().optional(),
  liveData: z.record(z.string(), z.number()).nullable().optional(),
  history: z.array(str(300)).max(30).optional(),
  testResults: z
    .array(z.object({ dtc: str(5), stepId: str(60).optional(), title: str(200), answer: z.enum(["YES", "NO", "UNKNOWN"]), interpretation: str(600) }))
    .max(60)
    .optional(),
  measurements: z.array(z.object({ label: str(120), value: str(120), unit: str(20).nullable().optional() })).max(40).optional(),
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("diagnosis"), input: diagnosisInput }),
  z.object({
    action: z.literal("question"),
    input: z.object({
      question: str(2000).min(1),
      context: diagnosisInput,
      conversation: z.array(z.object({ role: z.enum(["user", "assistant"]), content: str(8000) })).max(20).optional(),
    }),
  }),
]);

/** Statut du fournisseur IA (Ollama détecté ou MockAIProvider). */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.has("refresh");
  const status = await getAIStatus(force);
  return Response.json({ provider: status.provider, model: status.model ?? null, ollamaReachable: status.ollamaReachable, models: status.models, reason: status.reason ?? null });
}

/**
 * Analyse IA côté serveur (l'appel à Ollama se fait depuis le serveur : pas de CORS,
 * pas d'exposition d'URL interne). Entrées validées par Zod et bornées en taille.
 */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 100_000) return Response.json({ error: "Requête trop volumineuse" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Entrée invalide", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  const provider = await getAIProvider();
  try {
    if (parsed.data.action === "diagnosis") {
      const input = { ...parsed.data.input, codes: parsed.data.input.codes.map((c) => c.toUpperCase()) };
      return Response.json(await provider.generateDiagnosis(input));
    }
    return Response.json(await provider.answerTechnicalQuestion(parsed.data.input));
  } catch (e) {
    console.error("[api/ai]", e);
    return Response.json({ error: "Analyse impossible" }, { status: 500 });
  }
}
