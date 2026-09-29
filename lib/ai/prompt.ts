import { LIVE_DATA_LABELS } from "@/lib/obd/obd-parser";
import { getRule } from "@/lib/diagnostics/engine";
import { CAUSES } from "@/data/causes";
import type { DiagnosisInput } from "./provider";

/** Règles de sécurité imposées à tout modèle de langage. */
export const SYSTEM_PROMPT = `Tu es MECANO AI, assistant technique pour mécaniciens automobiles professionnels. Tu réponds en français, de façon concise et structurée.

RÈGLES ABSOLUES :
1. Ne jamais inventer une donnée technique : couple de serrage, procédure constructeur, référence pièce, valeur de test, pression, résistance, tension de référence, temps constructeur ou prix. Si une information fiable n'est pas fournie dans le contexte, écris exactement « Information non disponible ».
2. Ne jamais affirmer une panne sans preuve suffisante. Utilise le vocabulaire : « Hypothèse », « Cause possible », « Contrôle recommandé », « Résultat observé », « Conclusion à confirmer ».
3. Toujours distinguer hypothèse et résultat observé.
4. Signaler les systèmes critiques (freinage, direction, airbags, haute tension, carburant) et rappeler les précautions et la procédure constructeur.
5. Ne jamais remplacer le jugement d'un professionnel.
6. T'appuyer en priorité sur la BASE DE RÈGLES et les RÉSULTATS DE TESTS fournis dans le contexte.`;

const FUEL_LABEL: Record<string, string> = {
  DIESEL: "Diesel",
  ESSENCE: "Essence",
  HYBRIDE: "Hybride",
  HYBRIDE_RECHARGEABLE: "Hybride rechargeable",
  ELECTRIQUE: "Électrique",
  GPL: "GPL",
  AUTRE: "Autre",
};

/** Contexte structuré transmis au modèle (jamais un simple code isolé). */
export function buildContext(input: DiagnosisInput): string {
  const v = input.vehicle ?? {};
  const lines: string[] = [];
  lines.push("## Véhicule");
  lines.push(`Marque : ${v.make ?? "Information non disponible"}`);
  lines.push(`Modèle : ${[v.model, v.version].filter(Boolean).join(" ") || "Information non disponible"}`);
  lines.push(`Année : ${v.year ?? "Information non disponible"}`);
  lines.push(`Moteur : ${v.engine ?? "Information non disponible"}`);
  lines.push(`Énergie : ${v.fuel ? FUEL_LABEL[v.fuel] : "Information non disponible"}`);
  lines.push(`Kilométrage : ${v.mileage != null ? `${v.mileage.toLocaleString("fr-FR")} km` : "Information non disponible"}`);

  lines.push("\n## Symptômes");
  lines.push(input.symptoms.length ? input.symptoms.map((s) => `- ${s}`).join("\n") : "- Aucun symptôme renseigné");
  if (input.complaint) lines.push(`Description client : ${input.complaint}`);

  lines.push("\n## Codes défaut");
  lines.push(input.codes.length ? input.codes.map((c) => `- ${c} : ${getRule(c)?.title ?? "Information non disponible"}`).join("\n") : "- Aucun code");

  lines.push("\n## Données live (OBD)");
  if (input.liveData && Object.keys(input.liveData).length) {
    for (const [k, val] of Object.entries(input.liveData)) {
      const meta = LIVE_DATA_LABELS[k as keyof typeof LIVE_DATA_LABELS];
      if (meta && val !== undefined) lines.push(`- ${meta.label} : ${val} ${meta.unit}`);
    }
  } else lines.push("- Non disponibles");

  lines.push("\n## Historique pertinent");
  lines.push(input.history?.length ? input.history.slice(-10).map((h) => `- ${h}`).join("\n") : "- Aucun");

  lines.push("\n## Résultats des tests");
  lines.push(
    input.testResults?.length
      ? input.testResults.map((t) => `- ${t.dtc} · ${t.title} → ${t.answer === "YES" ? "OUI" : t.answer === "NO" ? "NON" : "INCONNU"} (${t.interpretation})`).join("\n")
      : "- Aucun test réalisé",
  );
  if (input.measurements?.length) {
    lines.push("\n## Mesures relevées par le technicien");
    lines.push(input.measurements.map((m) => `- ${m.label} : ${m.value}${m.unit ? ` ${m.unit}` : ""}`).join("\n"));
  }
  return lines.join("\n");
}

/** Extrait de la base de règles pour ancrer le modèle (RAG minimal, sans source externe). */
export function rulesKnowledge(codes: string[]): string {
  const parts: string[] = [];
  for (const code of codes) {
    const rule = getRule(code);
    if (!rule) {
      parts.push(`### ${code}\nInformation non disponible dans la base de règles.`);
      continue;
    }
    parts.push(
      [
        `### ${rule.dtc} — ${rule.title}`,
        rule.description,
        `Causes possibles : ${rule.causes.map((c) => `${CAUSES[c.id]?.label ?? c.id} (${c.frequency})`).join(" ; ")}`,
        `Contrôles : ${rule.tests.map((t) => t.title).join(" → ")}`,
        rule.safety.length ? `Sécurité : ${rule.safety.join(" ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return parts.join("\n\n");
}

export const DTC_IN_TEXT = /\b[PCBU][0-3][0-9A-F]{3}\b/gi;

export function extractCodes(text: string): string[] {
  return [...new Set((text.match(DTC_IN_TEXT) ?? []).map((c) => c.toUpperCase()))];
}
