import type { ClassificationDetails } from "@/lib/db/schema";
import {
  CPV_RULES,
  ELECTRICITE_TERMS,
  INSPECTION_SIGNALS,
  LEVAGE_TERMS,
  MAINTENANCE_SIGNALS,
  MULTISERVICE_SIGNALS,
  SUPPLIER_CALL_SIGNALS,
  SUPPLY_SIGNALS,
  WORKS_SIGNALS,
  type ServiceType,
  type Term,
} from "./dictionaries";
import { normalize } from "./text";
import type { Category, NoticeKind, OppDomain } from "./types";

const compiled = new Map<string, RegExp>();
function rx(term: Term): RegExp {
  let r = compiled.get(term.re);
  if (!r) {
    r = new RegExp(`(?:^| )(?:${term.re})(?= |$)`, "g");
    compiled.set(term.re, r);
  }
  r.lastIndex = 0;
  return r;
}

function matchTerms(text: string, terms: Term[]): Term[] {
  if (!text) return [];
  return terms.filter((t) => rx(t).test(text));
}

const sumWeights = (ts: Term[]) => ts.reduce((s, t) => s + t.weight, 0);

export type ClassifyInput = {
  title: string;
  description?: string | null;
  lots?: { title: string; description?: string | null; cpvCodes?: string[] }[];
  cpvCodes?: string[];
};

export type Classification = {
  domain: OppDomain;
  serviceType: ServiceType;
  supplierCall: boolean;
  details: ClassificationDetails;
};

export function cpvDigits(code: string): string {
  return (code.match(/\d{8}/)?.[0] ?? "").slice(0, 8);
}

export function matchCpv(code: string) {
  const c = cpvDigits(code);
  if (!c) return null;
  // Règle la plus spécifique d'abord (préfixe significatif le plus long).
  let best: (typeof CPV_RULES)[number] | null = null;
  let bestLen = 0;
  for (const rule of CPV_RULES) {
    const prefix = rule.code.replace(/0+$/, "");
    if (c.startsWith(prefix) && prefix.length > bestLen) {
      best = rule;
      bestLen = prefix.length;
    }
  }
  return best;
}

/**
 * Classification levage / électricité et nature de la prestation, expliquée.
 * Règles : le titre compte double ; les lots sont analysés (un marché large peut contenir un lot pertinent) ;
 * un marché de TRAVAUX électriques n'est jamais assimilé à une vérification.
 */
export function classify(input: ClassifyInput): Classification {
  const title = normalize(input.title);
  const desc = normalize(input.description);
  const lotsText = normalize((input.lots ?? []).map((l) => `${l.title} ${l.description ?? ""}`).join(" "));
  const all = `${title} ${desc} ${lotsText}`;

  const matched: ClassificationDetails["matchedTerms"] = [];
  let lev = 0;
  let ele = 0;
  let specificCount = 0;
  for (const [field, text, factor] of [
    ["titre", title, 2],
    ["description", desc, 1],
    ["lots", lotsText, 1],
  ] as const) {
    for (const t of matchTerms(text, LEVAGE_TERMS)) {
      lev += t.weight * factor;
      if (t.weight >= 2) specificCount++;
      matched.push({ term: t.label, domain: "LEVAGE", weight: t.weight * factor, field });
    }
    for (const t of matchTerms(text, ELECTRICITE_TERMS)) {
      ele += t.weight * factor;
      if (t.weight >= 2) specificCount++;
      matched.push({ term: t.label, domain: "ELECTRICITE", weight: t.weight * factor, field });
    }
  }

  const cpvAll = [...(input.cpvCodes ?? []), ...(input.lots ?? []).flatMap((l) => l.cpvCodes ?? [])];
  const matchedCpv: ClassificationDetails["matchedCpv"] = [];
  const cpvServiceVotes: Partial<Record<ServiceType, number>> = {};
  for (const code of new Set(cpvAll.map(cpvDigits).filter(Boolean))) {
    const rule = matchCpv(code);
    if (!rule) continue;
    matchedCpv.push({ code, label: rule.label, domain: rule.domain, serviceType: rule.serviceType });
    if (rule.domain === "LEVAGE") lev += rule.weight;
    if (rule.domain === "ELECTRICITE") ele += rule.weight;
    cpvServiceVotes[rule.serviceType] = (cpvServiceVotes[rule.serviceType] ?? 0) + rule.weight;
  }

  const inspTitle = matchTerms(title, INSPECTION_SIGNALS);
  const insp = matchTerms(all, INSPECTION_SIGNALS);
  const worksTitle = matchTerms(title, WORKS_SIGNALS);
  const works = matchTerms(all, WORKS_SIGNALS);
  const maint = matchTerms(all, MAINTENANCE_SIGNALS);
  const supply = matchTerms(title, SUPPLY_SIGNALS);
  const multi = matchTerms(all, MULTISERVICE_SIGNALS);
  const supplierCall = matchTerms(all, SUPPLIER_CALL_SIGNALS).length > 0;

  const explanation: string[] = [];

  // --- Domaine ---
  const THRESHOLD = 3;
  const multiScore = sumWeights(multi);
  let domain: OppDomain;
  if (lev >= THRESHOLD && ele >= THRESHOLD) domain = "MIXTE";
  else if (lev >= THRESHOLD) domain = "LEVAGE";
  else if (ele >= THRESHOLD) domain = "ELECTRICITE";
  else if (multiScore >= 3 && (insp.length > 0 || matchedCpv.some((c) => c.serviceType === "INSPECTION"))) {
    domain = "MIXTE";
    explanation.push(
      "Marché de contrôles / vérifications réglementaires sans mention explicite du domaine : ce type de marché inclut fréquemment le levage et l'électricité (à vérifier dans les pièces).",
    );
  } else domain = "AUCUN";

  // --- Nature de la prestation ---
  let serviceType: ServiceType;
  const inspW = sumWeights(insp) + (cpvServiceVotes.INSPECTION ?? 0) * 2;
  const worksW = sumWeights(works) + (cpvServiceVotes.TRAVAUX ?? 0) * 2;
  if (inspTitle.length && !(worksTitle.length && sumWeights(worksTitle) > sumWeights(inspTitle))) serviceType = "INSPECTION";
  else if (worksTitle.length) serviceType = multiScore >= 3 ? "MULTISERVICE" : "TRAVAUX";
  else if (multiScore >= 3) serviceType = "MULTISERVICE";
  else if (inspW >= 3 && inspW >= worksW) serviceType = "INSPECTION";
  else if (worksW >= 3) serviceType = "TRAVAUX";
  else if (sumWeights(maint) >= 2 || (cpvServiceVotes.MAINTENANCE ?? 0) > 0) serviceType = "MAINTENANCE";
  else if (supply.length || (cpvServiceVotes.FOURNITURE ?? 0) > 0) serviceType = "FOURNITURE";
  else serviceType = "AUTRE";

  // Termes génériques seuls (« électrique », « contrôle ») : pas suffisant pour un domaine fiable.
  if (domain !== "AUCUN" && specificCount === 0 && matchedCpv.length === 0 && multiScore < 3) {
    domain = "AUCUN";
    explanation.push("Seuls des termes génériques ont été trouvés : domaine non retenu.");
  }

  if (domain === "LEVAGE" || domain === "MIXTE") {
    const terms = [...new Set(matched.filter((m) => m.domain === "LEVAGE").map((m) => m.term))];
    if (terms.length) explanation.push(`Termes levage : ${terms.slice(0, 6).join(", ")}.`);
  }
  if (domain === "ELECTRICITE" || domain === "MIXTE") {
    const terms = [...new Set(matched.filter((m) => m.domain === "ELECTRICITE").map((m) => m.term))];
    if (terms.length) explanation.push(`Termes électricité : ${terms.slice(0, 6).join(", ")}.`);
  }
  if (matchedCpv.length) explanation.push(`Codes CPV : ${matchedCpv.map((c) => `${c.code} (${c.label})`).join(" ; ")}.`);

  switch (serviceType) {
    case "INSPECTION":
      explanation.push(`Prestation d'inspection / vérification probable (${[...new Set(insp.map((t) => t.label))].slice(0, 4).join(", ") || "CPV"}).`);
      break;
    case "TRAVAUX":
      explanation.push(
        "Marché de TRAVAUX : ce n'est pas une mission de vérification. Intérêt indirect possible (vérification initiale ou périodique des installations après travaux).",
      );
      break;
    case "FOURNITURE":
      explanation.push("Marché de FOURNITURE / location : pas une mission d'inspection. Signal possible (mise en service et vérifications des nouveaux équipements).");
      break;
    case "MAINTENANCE":
      explanation.push("Marché de maintenance : vérifier dans le cahier des charges si les vérifications réglementaires sont incluses.");
      break;
    case "MULTISERVICE":
      explanation.push(`Marché multiservices / multitechnique (${[...new Set(multi.map((t) => t.label))].join(", ")}) : rechercher un lot ou une composante levage / électricité.`);
      break;
    default:
      break;
  }
  if (supplierCall) explanation.push("Appel à fournisseurs / référencement / AMI détecté.");

  return {
    domain,
    serviceType,
    supplierCall,
    details: {
      levageScore: lev,
      electriciteScore: ele,
      matchedTerms: matched,
      matchedCpv,
      inspectionSignals: [...new Set(insp.map((t) => t.label))],
      worksSignals: [...new Set(works.map((t) => t.label))],
      multiservice: multiScore >= 3,
      explanation,
    },
  };
}

/** Catégorie commerciale à partir du type d'avis, des dates et de la classification. */
export function categorize(
  c: Pick<Classification, "domain" | "serviceType" | "supplierCall">,
  notice: { noticeKind: NoticeKind; deadlineAt: string | Date | null; durationMonths?: number | null; awardedAt?: string | null },
  now: Date = new Date(),
): { category: Category; reason: string } {
  if (c.domain === "AUCUN") return { category: "IRRELEVANT", reason: "Aucun lien établi avec le levage ou l'électricité." };
  const deadline = notice.deadlineAt ? new Date(notice.deadlineAt) : null;
  const deadlinePassed = deadline ? deadline.getTime() < now.getTime() : false;

  if (notice.noticeKind === "cancellation") return { category: "CLOSED", reason: "Avis d'annulation publié par l'acheteur." };
  if (notice.noticeKind === "award") {
    if (notice.durationMonths && notice.durationMonths > 0)
      return { category: "CONTRACT_WATCH", reason: "Avis d'attribution avec durée publiée : échéance de renouvellement à surveiller (estimation)." };
    return { category: "AWARDED", reason: "Avis d'attribution : marché attribué (concurrence close)." };
  }
  if (c.serviceType === "TRAVAUX" || c.serviceType === "FOURNITURE")
    return { category: "SIGNAL", reason: "Marché de travaux / fourniture : non candidatable pour une mission de vérification, mais signal d'un futur besoin." };
  if (c.supplierCall || notice.noticeKind === "supplier_call")
    return deadlinePassed
      ? { category: "CLOSED", reason: "Appel à fournisseurs dont la date limite est dépassée." }
      : { category: "SUPPLIER_CALL", reason: "Appel à fournisseurs / référencement." };
  if (notice.noticeKind === "prior_info") return { category: "UPCOMING", reason: "Avis de pré-information : consultation annoncée." };
  if (deadlinePassed) return { category: "CLOSED", reason: "Date limite de réponse dépassée." };
  if (c.serviceType === "MULTISERVICE" || (c.domain === "MIXTE" && c.serviceType !== "INSPECTION"))
    return { category: "INDIRECT", reason: "Marché multiservices : composante levage / électricité à confirmer dans les lots." };
  if (notice.noticeKind === "contract" || notice.noticeKind === "corrigendum")
    return {
      category: "ACTIVE",
      reason: deadline ? "Avis de marché ouvert : candidature possible avant la date limite." : "Avis de marché : date limite non publiée par la source (à vérifier).",
    };
  return { category: "SIGNAL", reason: "Information commerciale à qualifier." };
}
