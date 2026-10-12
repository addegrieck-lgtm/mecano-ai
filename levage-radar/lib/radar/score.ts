import type { ScoreFactor } from "@/lib/db/schema";
import type { Classification } from "./classify";
import { departmentsWithin, distanceKm } from "./geo";
import type { Category } from "./types";

export type ScoreInput = {
  classification: Classification;
  category: Category;
  deadlineAt: Date | string | null;
  publishedAt: string | null;
  amount: number | null;
  reliability: "high" | "medium" | "low";
  buyerHistoryCount: number;
  titleHasDomainTerm: boolean;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Score de pertinence 0–100 de base (indépendant de l'utilisateur), entièrement explicable :
 * chaque facteur est conservé avec son libellé et sa contribution.
 */
export function baseScore(input: ScoreInput, now: Date = new Date()): { score: number; factors: ScoreFactor[] } {
  const f: ScoreFactor[] = [];
  const add = (label: string, points: number) => points !== 0 && f.push({ label, points, kind: "base" });
  const c = input.classification;

  if (input.category === "IRRELEVANT") {
    add("Hors domaine levage / électricité", 0);
    return { score: 0, factors: [{ label: "Hors domaine levage / électricité", points: 0, kind: "base" }] };
  }

  const strength = Math.max(c.details.levageScore, c.details.electriciteScore);
  add(`Correspondance métier (intensité ${strength})`, Math.min(30, strength * 3));
  if (c.domain === "MIXTE" && c.details.levageScore < 3 && c.details.electriciteScore < 3) add("Domaine déduit d'un marché de contrôles réglementaires (indirect)", -5);
  if (input.titleHasDomainTerm) add("Domaine cité dans le titre", 5);

  const service: Record<string, [string, number]> = {
    INSPECTION: ["Mission d'inspection / vérification probable", 25],
    MULTISERVICE: ["Marché multiservices (composante à confirmer)", 12],
    MAINTENANCE: ["Maintenance (vérifications éventuellement incluses)", 8],
    TRAVAUX: ["Marché de travaux (pas une vérification)", -10],
    FOURNITURE: ["Fourniture / location (pas une vérification)", -10],
    AUTRE: ["Nature de prestation indéterminée", 0],
  };
  const [sl, sp] = service[c.serviceType];
  add(sl, sp);

  const cat: Record<Category, [string, number]> = {
    ACTIVE: ["Consultation ouverte", 15],
    UPCOMING: ["Consultation annoncée", 10],
    SUPPLIER_CALL: ["Appel à fournisseurs ouvert", 12],
    CONTRACT_WATCH: ["Contrat attribué : renouvellement à anticiper", 8],
    AWARDED: ["Marché attribué (veille concurrentielle)", 4],
    INDIRECT: ["Opportunité indirecte", 6],
    SIGNAL: ["Signal commercial", 2],
    CLOSED: ["Consultation clôturée", -15],
    IRRELEVANT: ["Non pertinent", 0],
  };
  const [cl, cp] = cat[input.category];
  add(cl, cp);

  const deadline = input.deadlineAt ? new Date(input.deadlineAt) : null;
  if (input.category === "ACTIVE" || input.category === "SUPPLIER_CALL") {
    if (!deadline) add("Date limite non publiée (à vérifier)", -3);
    else {
      const days = (deadline.getTime() - now.getTime()) / 86400000;
      if (days < 3) add("Délai de réponse très court (< 3 jours)", -5);
      else if (days >= 10) add("Délai de réponse confortable", 3);
    }
  }

  if (input.amount !== null && input.amount > 0) add("Montant publié par la source", input.amount >= 40000 ? 5 : 2);

  add(
    input.reliability === "high" ? "Source officielle structurée" : input.reliability === "medium" ? "Source structurée, données partielles" : "Données peu structurées",
    input.reliability === "high" ? 5 : input.reliability === "medium" ? 2 : 0,
  );

  if (input.publishedAt) {
    const age = (now.getTime() - new Date(input.publishedAt).getTime()) / 86400000;
    if (age <= 7) add("Publication récente (≤ 7 jours)", 5);
    else if (age > 90) add("Publication ancienne (> 90 jours)", -5);
  }

  if (input.buyerHistoryCount >= 2) add(`Acheteur récurrent (${input.buyerHistoryCount} avis pertinents déjà détectés)`, 5);

  const score = clamp(f.reduce((s, x) => s + x.points, 0));
  return { score, factors: f };
}

export type UserScorePrefs = {
  homeDepartment?: string | null;
  radiusKm?: number | null;
  preferredDepartments?: string[];
  domains?: string[];
};

/** Ajustements personnels (préférences du chargé d'affaires), calculés à l'affichage. */
export function personalFactors(
  opp: { department: string | null; domain: string; country: string | null },
  prefs: UserScorePrefs,
): ScoreFactor[] {
  const f: ScoreFactor[] = [];
  const push = (label: string, points: number) => f.push({ label, points, kind: "personal" });
  if (opp.department && prefs.preferredDepartments?.includes(opp.department)) push("Département suivi", 10);
  if (prefs.homeDepartment && prefs.radiusKm && opp.department) {
    const d = distanceKm(prefs.homeDepartment, opp.department);
    if (d !== null) {
      if (d <= prefs.radiusKm) push(`Dans votre rayon (~${Math.round(d)} km, approximation par préfecture)`, 8);
      else push(`Hors de votre rayon (~${Math.round(d)} km)`, -10);
    }
  } else if (prefs.homeDepartment && prefs.radiusKm && opp.country && opp.country !== "FR") {
    push("Hors de France", -10);
  }
  if (prefs.domains && prefs.domains.length && opp.domain !== "MIXTE" && opp.domain !== "AUCUN" && !prefs.domains.includes(opp.domain))
    push("Domaine hors de vos préférences", -10);
  return f;
}

export function finalScore(base: number, personal: ScoreFactor[]): number {
  if (base === 0) return 0;
  return clamp(base + personal.reduce((s, x) => s + x.points, 0));
}

export { departmentsWithin };
