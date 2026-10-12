"use client";

import Link from "next/link";
import { useActionState } from "react";
import { askAction } from "./actions";
import type { AssistantAnswer } from "@/lib/assistant/engine";
import { btnClass } from "@/components/ui";
import { CopyButton } from "@/components/forms";

const EXAMPLES = [
  "Quelles sont les nouvelles consultations levage de cette semaine ?",
  "Quelles opportunités électriques restent ouvertes dans mon secteur ?",
  "Quels marchés méritent d'être étudiés en priorité ?",
  "Quels acheteurs publient régulièrement des marchés de vérification ?",
  "Quels contrats attribués faut-il surveiller ?",
  "Quels projets industriels pourraient générer de nouveaux besoins ?",
];

export function AssistantChat({ defaultOpp }: { defaultOpp: string }) {
  const [state, action, pending] = useActionState(askAction, null);
  const data = state?.data as { question: string; answer: AssistantAnswer; llm: string | null } | undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form action={action} className="card space-y-3 p-4 lg:col-span-1">
        <label className="label" htmlFor="question">Votre question</label>
        <textarea id="question" name="question" className="input" rows={4} required placeholder="ex. Quelles opportunités électriques restent ouvertes dans mon secteur ?" />
        <label className="label" htmlFor="oppIds">Fiche(s) concernée(s) — facultatif</label>
        <input id="oppIds" name="oppIds" className="input" defaultValue={defaultOpp} placeholder="identifiant(s) d'opportunité, séparés par des virgules" />
        <p className="text-xs text-slate-500">Avec une fiche : « Résume cette consultation », « Prépare une fiche de synthèse pour le logiciel officiel ». Avec deux fiches : « Compare ces opportunités ».</p>
        <button type="submit" disabled={pending} className={btnClass("primary")}>{pending ? "Recherche…" : "Demander"}</button>
        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="mb-1 text-xs font-medium text-slate-500">Exemples</div>
          <ul className="space-y-1 text-xs">
            {EXAMPLES.map((e) => (
              <li key={e}>
                <button type="button" className="text-left text-brand-600 hover:underline" onClick={() => { const t = document.getElementById("question") as HTMLTextAreaElement; t.value = e; t.focus(); }}>{e}</button>
              </li>
            ))}
          </ul>
        </div>
      </form>
      <div className="lg:col-span-2">
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        {!data && !state?.error && <div className="card p-6 text-sm text-slate-500">La réponse s&apos;affichera ici, avec les fiches et liens sources correspondants.</div>}
        {data && (
          <div className="card space-y-4 p-4 text-sm">
            <div className="text-xs text-slate-500">Question : {data.question}{data.answer.filters.length ? ` · Filtres appliqués : ${data.answer.filters.join(" ; ")}` : ""}</div>
            {data.llm && (
              <div className="rounded-md bg-brand-50 p-3 whitespace-pre-line dark:bg-brand-700/20">
                <div className="mb-1 text-xs font-semibold text-brand-700 dark:text-brand-100">Synthèse rédigée par le modèle de langage (à partir des seules données ci-dessous)</div>
                {data.llm}
              </div>
            )}
            {data.answer.paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
            {data.answer.copyText && (
              <div>
                <div className="mb-1 flex justify-end"><CopyButton text={data.answer.copyText} /></div>
                <pre className="max-h-96 overflow-auto rounded bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:bg-slate-950">{data.answer.copyText}</pre>
              </div>
            )}
            {data.answer.items.length > 0 && (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.answer.items.map((i) => (
                  <li key={i.id} className="py-2">
                    <Link className="font-medium text-slate-900 hover:text-brand-600 dark:text-slate-100" href={`/radar/${i.id}`}>{i.title}</Link>
                    <div className="text-xs text-slate-500">{i.meta}</div>
                    <div className="text-xs">
                      <Link className="link" href={`/radar/${i.id}`}>fiche</Link>
                      {i.officialUrl && <> · <a className="link" href={i.officialUrl} target="_blank" rel="noopener noreferrer">source officielle ↗</a></>}
                      {" · "}<span className="font-mono text-[10px] text-slate-400">{i.id}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.answer.buyers.length > 0 && (
              <ul className="space-y-1">
                {data.answer.buyers.map((b) => <li key={b.id}><Link className="link" href={`/buyers/${b.id}`}>{b.name}</Link> — {b.count} avis</li>)}
              </ul>
            )}
            {data.answer.missing.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="font-semibold">Informations manquantes / limites</div>
                <ul className="list-disc pl-4">{data.answer.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
            <div className="text-[11px] text-slate-400">Méthode : {data.answer.method}{data.llm ? " + reformulation" : ""}.</div>
          </div>
        )}
      </div>
    </div>
  );
}
