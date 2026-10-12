import { jaccard, normalizeBuyer } from "./text";

export type DedupCandidate = {
  id: string;
  title: string;
  buyerName: string | null;
  publishedAt: string | null;
  department: string | null;
  reference: string | null;
  refs: string[]; // références de tous les avis liés (toutes sources)
  urls: string[];
};

export type DedupProbe = {
  sourceRef: string;
  title: string;
  buyerName: string | null;
  publishedAt: string | null;
  department: string | null;
  crossRefs: string[];
  url: string | null;
  noticeKind: string;
};

/**
 * Décide si un nouvel avis correspond à une opportunité existante. Renvoie la raison (traçabilité) ou null.
 * Règles, de la plus sûre à la moins sûre :
 *  1. référence croisée publiée par la source (numéro TED cité par le BOAMP, avis initial…) ;
 *  2. même lien officiel ;
 *  3. même acheteur (nom normalisé) + titre très proche (Jaccard ≥ 0,7) + publications à moins de 60 jours
 *     (365 jours pour un avis d'attribution, publié après la consultation) ;
 *  4. même acheteur + même département + titre identique une fois normalisé.
 */
export function duplicateReason(probe: DedupProbe, cand: DedupCandidate): string | null {
  const refs = new Set(cand.refs);
  if (cand.reference) refs.add(cand.reference);
  for (const r of probe.crossRefs) if (refs.has(r)) return `Référence croisée ${r}`;
  if (probe.url && cand.urls.includes(probe.url)) return "Même lien officiel";

  const sameBuyer = !!probe.buyerName && !!cand.buyerName && normalizeBuyer(probe.buyerName) === normalizeBuyer(cand.buyerName);
  if (!sameBuyer) return null;
  const sim = jaccard(probe.title, cand.title);
  const maxDays = probe.noticeKind === "award" ? 365 : 60;
  if (probe.publishedAt && cand.publishedAt) {
    const days = Math.abs(new Date(probe.publishedAt).getTime() - new Date(cand.publishedAt).getTime()) / 86400000;
    if (sim >= 0.7 && days <= maxDays) return `Même acheteur, titre similaire (${Math.round(sim * 100)} %), ${Math.round(days)} j d'écart`;
  }
  if (sim >= 0.95 && (!probe.department || !cand.department || probe.department === cand.department)) return "Même acheteur, titre identique";
  return null;
}
