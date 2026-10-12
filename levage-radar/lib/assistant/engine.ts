import { and, desc, eq, sql } from "drizzle-orm";
import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { opportunities, buyers } from "@/lib/db/schema";
import { normalize } from "@/lib/radar/text";
import { CATEGORIES, DOMAINS, SERVICE_TYPES, type Category, type OppDomain } from "@/lib/radar/types";
import { getOpportunity, getPrefs, searchOpportunities, parseSearch } from "@/lib/services/opportunities";
import { opportunitySummaryText } from "@/lib/services/opp-exports";
import { connectorInfo } from "@/lib/connectors/registry";
import { demoEnabled } from "@/lib/demo";
import type { ServiceType } from "@/lib/radar/dictionaries";

export type AssistantItem = { id: string; title: string; meta: string; officialUrl: string | null };
export type AssistantAnswer = {
  paragraphs: string[];
  items: AssistantItem[];
  buyers: { id: string; name: string; count: number }[];
  missing: string[];
  method: string;
  filters: string[];
  copyText?: string;
};

type Opp = typeof opportunities.$inferSelect;

const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "non publiée");

function toItem(o: Opp, score?: number): AssistantItem {
  return {
    id: o.id,
    title: o.title,
    meta: [
      DOMAINS[o.domain as OppDomain],
      CATEGORIES[o.category as Category],
      o.buyerName,
      o.department ? `dép. ${o.department}` : o.country,
      `limite : ${fmt(o.deadlineAt)}`,
      `score ${score ?? o.baseScore}`,
      `source : ${connectorInfo(o.primarySourceId ?? "")?.name ?? o.primarySourceId}`,
    ]
      .filter(Boolean)
      .join(" · "),
    officialUrl: o.officialUrl,
  };
}

const STOP = new Set(
  "quelles quels quel quelle sont les des de la le du ce cette cet ces mon ma mes nos dans pour sur et ou qui que quoi est a au aux en un une semaine mois jour aujourd hui nouvelles nouveaux nouvelle nouveau consultations consultation opportunites opportunite marches marche resultats resultat trouves trouve restent ouvertes ouverts ouvert actives active secteur levage electriques electrique electricite meritent etre etudies etudier priorite prioritaires publient regulierement acheteurs acheteur verification contrats contrat attribues attribue surveiller faut il projets projet industriels industriel pourraient generer besoins entreprise cette ont ete".split(
    " ",
  ),
);

/**
 * Assistant commercial — fonctionnement « règles » (gratuit, sans service externe) :
 * interprétation de la question → requête sur les données collectées → réponse citant les fiches et sources.
 * Il ne répond qu'à partir des données en base et signale ce qui manque.
 */
export async function answerQuestion(ctx: Ctx, question: string, opts: { oppIds?: string[]; demo?: boolean } = {}): Promise<AssistantAnswer> {
  requirePerm(ctx, "assistant.use");
  const q = normalize(question).slice(0, 500);
  const demo = !!opts.demo && demoEnabled();
  const filters: string[] = [];
  const missing: string[] = [];
  const now = new Date();

  // --- Questions portant sur des fiches précises ---
  if (opts.oppIds?.length) {
    if (/compar/.test(q) && opts.oppIds.length >= 2) return compare(ctx, opts.oppIds.slice(0, 3));
    if (/synthese|logiciel|fiche/.test(q)) {
      const text = await opportunitySummaryText(ctx, opts.oppIds[0]);
      return { paragraphs: ["Fiche de synthèse préparée à partir des données collectées (à reprendre manuellement dans le logiciel commercial officiel) :"], items: [], buyers: [], missing: [], method: "règles", filters: [], copyText: text };
    }
    return summarize(ctx, opts.oppIds[0]);
  }

  // --- Acheteurs récurrents ---
  if (/acheteur|donneur|publient|regulier/.test(q)) {
    const domainCond = /levage/.test(q) ? sql`o.domain in ('LEVAGE','MIXTE')` : /electri/.test(q) ? sql`o.domain in ('ELECTRICITE','MIXTE')` : sql`o.domain <> 'AUCUN'`;
    const cnt = sql<number>`(select count(*)::int from ${opportunities} o where o.buyer_id = ${buyers.id} and ${domainCond} and o.service_type in ('INSPECTION','MULTISERVICE','MAINTENANCE'))`;
    const rows = await ctx.db
      .select({ id: buyers.id, name: buyers.name, count: cnt })
      .from(buyers)
      .where(and(eq(buyers.isDemo, demo), sql`${cnt} >= 2`))
      .orderBy(desc(cnt))
      .limit(20);
    return {
      paragraphs: rows.length
        ? [`${rows.length} acheteur(s) ont publié au moins deux avis de vérification / inspection / maintenance détectés par le radar :`]
        : ["Aucun acheteur n'a encore publié au moins deux avis pertinents dans les données collectées."],
      items: [],
      buyers: rows,
      missing: ["L'historique se limite aux avis collectés depuis la mise en service du radar et aux sources connectées (BOAMP, TED)."],
      method: "règles",
      filters: ["Acheteurs avec ≥ 2 avis de vérification / inspection / maintenance"],
    };
  }

  // --- Requêtes de liste ---
  const params = new URLSearchParams();
  if (/levage/.test(q)) {
    params.set("domain", "LEVAGE");
    filters.push("Domaine : levage");
  } else if (/electri/.test(q)) {
    params.set("domain", "ELECTRICITE");
    filters.push("Domaine : électricité");
  }
  if (/aujourd/.test(q)) {
    params.set("newSince", "today");
    filters.push("Détectées aujourd'hui");
  } else if (/semaine/.test(q)) {
    params.set("publishedFrom", new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10));
    filters.push("Publiées depuis 7 jours");
  } else if (/\bmois\b/.test(q)) {
    params.set("publishedFrom", new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10));
    filters.push("Publiées depuis 30 jours");
  }
  if (/attribu|surveiller|renouvel/.test(q)) {
    params.set("category", "AWARDED,CONTRACT_WATCH");
    filters.push("Marchés attribués / contrats à surveiller");
  } else if (/projet|industriel|signal|investiss/.test(q)) {
    params.set("category", "SIGNAL,INDIRECT");
    filters.push("Signaux et opportunités indirectes");
  } else if (/fournisseur|referencement|manifestation/.test(q)) {
    params.set("category", "SUPPLIER_CALL");
    filters.push("Appels à fournisseurs");
  } else if (/ouvert|en cours|actives?|candidat|priorit|etudi|consultation/.test(q)) {
    params.set("open", "1");
    filters.push("Consultations ouvertes");
  }
  if (/secteur|proximite|pres de|autour/.test(q)) {
    const prefs = await getPrefs(ctx);
    if (prefs.homeDepartment && prefs.radiusKm) {
      params.set("radiusFrom", prefs.homeDepartment);
      params.set("radiusKm", String(prefs.radiusKm));
      filters.push(`Rayon de ${prefs.radiusKm} km autour du ${prefs.homeDepartment} (approximation)`);
    } else if (prefs.preferredDepartments?.length) {
      params.set("department", prefs.preferredDepartments.join(","));
      filters.push(`Départements suivis : ${prefs.preferredDepartments.join(", ")}`);
    } else missing.push("Votre secteur n'est pas défini : renseignez votre département et votre rayon dans Paramètres.");
  }
  const dept = q.match(/\b(?:departement|dep|dept)\s+(\d{2,3}|2a|2b)\b/);
  if (dept) {
    params.set("department", dept[1].toUpperCase());
    filters.push(`Département ${dept[1].toUpperCase()}`);
  }
  // Mots restants → recherche plein texte (ex. nom d'entreprise)
  const quoted = question.match(/[«"“]([^»"”]{2,80})[»"”]/);
  const keywords = quoted ? quoted[1] : q.split(" ").filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)).join(" ");
  if (keywords && !/priorit|etudi/.test(q)) {
    params.set("q", keywords);
    filters.push(`Recherche : « ${keywords} »`);
  }
  params.set("sort", /echeanc|limite|urgent/.test(q) ? "deadline" : "score");
  params.set("pageSize", "15");

  const res = await searchOpportunities(ctx, parseSearch(params), { demo });
  const paragraphs: string[] = [];
  if (!res.total) {
    paragraphs.push("Aucun résultat dans les données collectées pour cette question.");
    if (params.has("q")) paragraphs.push(`Essayez sans le filtre texte « ${params.get("q")} », ou ouvrez la recherche avancée.`);
  } else {
    paragraphs.push(`${res.total} résultat(s) dans les données collectées${res.total > 15 ? " — les 15 plus pertinents :" : " :"}`);
    if (/priorit|etudi/.test(q))
      paragraphs.push("Priorisation par score de pertinence (correspondance métier, type de prestation, date limite, fraîcheur, fiabilité de la source, vos préférences). Le détail du score est visible sur chaque fiche.");
  }
  const noDeadline = res.items.filter((o) => o.isOpen && !o.deadlineAt).length;
  if (noDeadline) missing.push(`${noDeadline} consultation(s) sans date limite publiée par la source : à vérifier sur l'avis officiel.`);
  missing.push("Couverture : BOAMP et TED uniquement (profils d'acheteurs, PLACE et portails privés non connectés).");
  return { paragraphs, items: res.items.map((o) => toItem(o, o.score)), buyers: [], missing, method: "règles", filters };
}

async function summarize(ctx: Ctx, id: string): Promise<AssistantAnswer> {
  const d = await getOpportunity(ctx, id);
  const o = d.opp;
  const paragraphs = [
    `« ${o.title} » — ${o.buyerName ?? "acheteur non publié"}.`,
    `${DOMAINS[o.domain as OppDomain]}, ${SERVICE_TYPES[o.serviceType as ServiceType].toLowerCase()} ; ${CATEGORIES[o.category as Category].toLowerCase()}.`,
    `Publication : ${fmt(o.publishedAt)} · Date limite : ${fmt(o.deadlineAt)} · Montant : ${o.publishedAmount ? `${Number(o.publishedAmount).toLocaleString("fr-FR")} ${o.amountCurrency ?? ""} (publié)` : "non publié"} · Durée : ${o.durationText ?? "non publiée"}.`,
    o.description ? `Description publiée : ${o.description.slice(0, 800)}${o.description.length > 800 ? "…" : ""}` : "Aucune description détaillée n'a été publiée ou extraite.",
    d.lots.length ? `Lots : ${d.lots.map((l) => `${l.lotNumber ? `${l.lotNumber}. ` : ""}${l.title}${l.relevant ? " (pertinent)" : ""}`).join(" ; ")}.` : "Aucun lot publié ou extrait.",
    `Pertinence (score ${d.score}/100) : ${o.relevanceReason}`,
  ];
  const missing: string[] = [

      "Pièces demandées : le règlement de consultation et le dossier (DCE) ne sont pas collectés par le radar. Consultez-les sur la source officielle (lien ci-dessous) ; aucune liste n'est inventée.",
  ];
  if (!o.deadlineAt) missing.push("Date limite non publiée par la source.");
  if (!o.selectionCriteria) missing.push("Critères de sélection non disponibles dans les données collectées.");
  return { paragraphs, items: [toItem(o, d.score)], buyers: [], missing, method: "règles", filters: [] };
}

async function compare(ctx: Ctx, ids: string[]): Promise<AssistantAnswer> {
  const list = await Promise.all(ids.map((id) => getOpportunity(ctx, id)));
  const rows = list.map(
    (d) =>
      `• ${d.opp.title} — score ${d.score}, ${DOMAINS[d.opp.domain as OppDomain]}, ${SERVICE_TYPES[d.opp.serviceType as ServiceType].toLowerCase()}, limite ${fmt(d.opp.deadlineAt)}, montant ${d.opp.publishedAmount ? `${Number(d.opp.publishedAmount).toLocaleString("fr-FR")} € (publié)` : "non publié"}, ${d.opp.department ? `dép. ${d.opp.department}` : (d.opp.country ?? "lieu non publié")}.`,
  );
  const best = [...list].sort((a, b) => b.score - a.score)[0];
  return {
    paragraphs: ["Comparaison à partir des données collectées :", ...rows, `Score le plus élevé : « ${best.opp.title} » (${best.score}/100). Le score est une aide au tri, pas une décision.`],
    items: list.map((d) => toItem(d.opp, d.score)),
    buyers: [],
    missing: list.some((d) => !d.opp.deadlineAt) ? ["Au moins une date limite n'est pas publiée."] : [],
    method: "règles",
    filters: [],
  };
}

