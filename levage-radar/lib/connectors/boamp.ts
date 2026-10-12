import type { NoticeKind, NormalizedNotice } from "@/lib/radar/types";
import { SEARCH_QUERIES } from "@/lib/radar/dictionaries";
import { departmentFromPostalCode, normalizeDepartment } from "@/lib/radar/geo";
import { asArray, CPV_RE, parseAmount, textOf, toIsoDate, toIsoDateTime, walk } from "./extract";
import { httpJson, type HttpOptions } from "./http";
import type { Connector, ConnectorInfo, FetchParams, FetchResult } from "./types";

/**
 * Connecteur BOAMP (Bulletin officiel des annonces des marchés publics — DILA).
 * API : Opendatasoft Explore v2.1, jeu de données « boamp », accès libre sans clé.
 *   GET https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records
 *   Paramètres : where (ODSQL), order_by, limit (≤ 100), offset (limit + offset ≤ 10 000).
 * Champs exploités (schéma public du jeu de données) : idweb, objet, nomacheteur, dateparution,
 * datelimitereponse, code_departement, nature / nature_categorise_libelle, type_marche, procedure_libelle,
 * descripteur_libelle, url_avis, titulaire, donnees (JSON complet de l'avis, plusieurs formats).
 * Licence : Licence Ouverte / Etalab 2.0 — mention de la source « BOAMP / DILA ».
 */
export const BOAMP_INFO: ConnectorInfo = {
  id: "boamp",
  name: "BOAMP (DILA)",
  status: "implemented",
  geography: "France (marchés publics nationaux et européens publiés au BOAMP)",
  dataTypes: ["Avis de marché", "Avis de pré-information", "Rectificatifs", "Avis d'attribution / résultats"],
  access: "API publique ouverte (Opendatasoft), sans clé ni authentification",
  method: "Requêtes ODSQL par mots-clés métier + filtre de date de parution (incrémental)",
  frequency: "Quotidienne (publication BOAMP quotidienne, jours ouvrés)",
  licence: "Licence Ouverte / Etalab 2.0 — source : BOAMP / DILA",
  officialUrl: "https://www.boamp.fr/",
  coverageLimits: [
    "Les marchés à procédure adaptée (MAPA) ne sont publiés au BOAMP que si l'acheteur le choisit : couverture partielle des petits marchés.",
    "Les profils d'acheteurs et plateformes privées ne sont pas couverts par cette source.",
    "La recherche par mots-clés peut manquer des avis rédigés avec un vocabulaire inhabituel.",
    "Le contenu détaillé (lots, CPV, montants, durée) est extrait au mieux du champ « donnees », dont le format varie selon les avis.",
  ],
};

const BASE = process.env.BOAMP_API_URL ?? "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";
const PAGE = 100;

type OdsResponse = { total_count?: number; results?: Record<string, unknown>[] };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function boampQueries(since: string): string[] {
  // Les termes sont regroupés pour limiter le nombre de requêtes tout en gardant des clauses courtes.
  const terms = SEARCH_QUERIES.flatMap((q) => q.fr);
  const groups: string[][] = [];
  for (let i = 0; i < terms.length; i += 6) groups.push(terms.slice(i, i + 6));
  return groups.map((g) => `(${g.map((t) => `"${esc(t)}"`).join(" OR ")}) AND dateparution >= "${since}"`);
}

export function boampNoticeKind(rec: Record<string, unknown>): NoticeKind {
  const raw = [rec.nature_categorise_libelle, rec.nature_libelle, rec.nature].map((v) => textOf(v) ?? "").join(" ").toLowerCase();
  const n = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/annul/.test(n)) return "cancellation";
  if (/attribution|resultat/.test(n)) return "award";
  if (/rectif|modif/.test(n)) return "corrigendum";
  if (/pre.?information|periodique indicatif|information prealable/.test(n)) return "prior_info";
  if (/marche|appel|offre|concurrence|avis/.test(n)) return "contract";
  return "other";
}

function parseDonnees(v: unknown): unknown {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** Extraction au mieux depuis le JSON « donnees » (formats historiques BOAMP, FNSimple, eForms). */
export function extractFromDonnees(donnees: unknown) {
  const cpv = new Set<string>();
  const descriptions: string[] = [];
  const lots: NormalizedNotice["lots"] = [];
  const crossRefs = new Set<string>();
  let estimated: number | null = null;
  let durationMonths: number | null = null;
  let postalCode: string | null = null;
  let city: string | null = null;
  let address: string | null = null;
  let buyerNationalId: string | null = null;
  let criteria: string | null = null;

  walk(donnees, (key, value, path) => {
    const k = key.toLowerCase();
    const p = path.join(".").toLowerCase();
    const t = textOf(value);
    if (t && CPV_RE.test(t) && (p.includes("cpv") || p.includes("itemclassificationcode"))) cpv.add(t.slice(0, 8));
    if (t && t.length > 40 && /(objet_complet|description|short_descr|descr_succincte|cbc:description)$/.test(k)) descriptions.push(t);
    if (estimated === null && /(estimatedoverallcontractamount|val_estimated_total|valeur_estimee|montant_estime)/.test(k)) estimated = parseAmount(value);
    if (durationMonths === null && /(duree_mois|duration_months|nb_mois)/.test(k)) {
      const n = Number(t);
      if (Number.isFinite(n) && n > 0 && n < 240) durationMonths = n;
    }
    if (durationMonths === null && k === "cbc:durationmeasure" && value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      const unit = String(o["@unitCode"] ?? o.unitCode ?? "").toUpperCase();
      const n = Number(textOf(value));
      if (Number.isFinite(n) && n > 0) durationMonths = unit === "ANNUM" || unit === "YEAR" ? n * 12 : unit === "MONTH" ? n : null;
    }
    if (!postalCode && /^(cp|code_postal|cbc:postalzone)$/.test(k) && t) postalCode = t;
    if (!city && /^(ville|cbc:cityname)$/.test(k) && t) city = t;
    if (!address && /^(adresse|cbc:streetname)$/.test(k) && t) address = t;
    if (!buyerNationalId && /^(siret|cbc:companyid)$/.test(k) && t && /^\d{9,14}$/.test(t.replace(/\s/g, ""))) buyerNationalId = t.replace(/\s/g, "");
    if (!criteria && /(criteres?_attribution|criteres?|awardingcriteria)$/.test(k) && t && t.length > 10) criteria = t.slice(0, 1500);
    if (t && /(joue|ted|annonce_ant|annonces_anterieures|ref_ann|initial)/.test(p)) {
      for (const m of t.matchAll(/\b(\d{4}\/S \d{3}-\d{6}|\d{5,8}-20\d{2})\b/g)) crossRefs.add(m[1]);
      for (const m of t.matchAll(/\b(\d{2}-\d{5,7})\b/g)) crossRefs.add(m[1]);
    }
    if (/^(lots?|cac:procurementprojectlot|lot_list)$/.test(k)) {
      for (const lot of asArray<Record<string, unknown>>(value)) {
        if (!lot || typeof lot !== "object") continue;
        const title =
          textOf(lot.INTITULE ?? lot.intitule ?? lot.TITRE ?? lot.TITLE ?? lot.title ?? (lot["cac:ProcurementProject"] as Record<string, unknown> | undefined)?.["cbc:Name"]) ?? null;
        if (!title) continue;
        const lotCpv: string[] = [];
        walk(lot, (lk, lv, lp) => {
          const lt = textOf(lv);
          if (lt && CPV_RE.test(lt) && lp.join(".").toLowerCase().match(/cpv|itemclassificationcode/)) lotCpv.push(lt.slice(0, 8));
        });
        lots.push({
          number: textOf(lot.NUM ?? lot.num ?? lot.NUMERO ?? lot.LOT_NO ?? lot["cbc:ID"]) ?? null,
          title: title.slice(0, 500),
          description: textOf(lot.DESCRIPTION ?? lot.description ?? lot.DESCR)?.slice(0, 2000) ?? null,
          cpvCodes: [...new Set(lotCpv)],
        });
      }
    }
  });

  descriptions.sort((a, b) => b.length - a.length);
  return {
    cpv: [...cpv],
    description: descriptions[0]?.slice(0, 4000) ?? null,
    lots: lots.slice(0, 50),
    crossRefs: [...crossRefs],
    estimated,
    durationMonths,
    postalCode,
    city,
    address,
    buyerNationalId,
    criteria,
  };
}

export function mapBoampRecord(rec: Record<string, unknown>): NormalizedNotice | null {
  const idweb = textOf(rec.idweb) ?? textOf(rec.id);
  const title = textOf(rec.objet);
  if (!idweb || !title) return null;
  const d = extractFromDonnees(parseDonnees(rec.donnees));
  const depts = asArray(rec.code_departement).map((x) => normalizeDepartment(textOf(x))).filter(Boolean) as string[];
  const department = depts[0] ?? departmentFromPostalCode(d.postalCode);
  const kind = boampNoticeKind(rec);
  const descriptors = asArray(rec.descripteur_libelle).map((x) => textOf(x)).filter(Boolean) as string[];
  const titulaires = asArray(rec.titulaire).map((x) => textOf(x)).filter(Boolean) as string[];

  const descriptionParts = [d.description, descriptors.length ? `Descripteurs BOAMP : ${descriptors.join(", ")}.` : null, titulaires.length ? `Titulaire(s) publié(s) : ${titulaires.join(", ")}.` : null].filter(Boolean);

  return {
    sourceId: "boamp",
    sourceRef: idweb,
    url: textOf(rec.url_avis) ?? `https://www.boamp.fr/pages/avis/?q=idweb:${encodeURIComponent(idweb)}`,
    title: title.slice(0, 1000),
    description: descriptionParts.length ? descriptionParts.join("\n").slice(0, 6000) : null,
    buyerName: textOf(rec.nomacheteur),
    buyerNationalId: d.buyerNationalId,
    isPublic: true,
    country: "FR",
    department,
    city: d.city,
    address: d.address,
    noticeKind: kind,
    noticeTypeRaw: textOf(rec.nature_categorise_libelle) ?? textOf(rec.nature_libelle) ?? textOf(rec.nature),
    publishedAt: toIsoDate(rec.dateparution),
    deadlineAt: toIsoDateTime(rec.datelimitereponse),
    sourceUpdatedAt: null,
    awardedAt: kind === "award" ? toIsoDate(rec.dateparution) : null,
    amount: d.estimated,
    currency: d.estimated !== null ? "EUR" : null,
    durationText: d.durationMonths ? `${d.durationMonths} mois` : null,
    durationMonths: d.durationMonths,
    selectionCriteria: d.criteria,
    procedureType: textOf(rec.procedure_libelle) ?? textOf(rec.type_procedure),
    cpvCodes: d.cpv,
    lots: d.lots,
    crossRefs: d.crossRefs.filter((r) => r !== idweb),
    reliability: d.description || d.cpv.length ? "high" : "medium",
    licence: BOAMP_INFO.licence,
    raw: { ...rec, donnees: undefined, donnees_parsed_keys: d.cpv.length + d.lots.length },
  };
}

export function createBoampConnector(http: HttpOptions = {}): Connector {
  return {
    info: BOAMP_INFO,
    async fetch(params: FetchParams): Promise<FetchResult> {
      const notices = new Map<string, NormalizedNotice>();
      const warnings: string[] = [];
      let okQueries = 0;
      const queries = boampQueries(params.since);
      for (const where of queries) {
        for (let page = 0; page < params.maxPages; page++) {
          const offset = page * PAGE;
          if (offset + PAGE > 10000) break;
          const url = `${BASE}?${new URLSearchParams({ where, order_by: "dateparution desc", limit: String(PAGE), offset: String(offset) })}`;
          try {
            const data = await httpJson<OdsResponse>(url, {}, { ...http, signal: params.signal });
            const results = data.results ?? [];
            for (const rec of results) {
              const n = mapBoampRecord(rec);
              if (n) notices.set(n.sourceRef, n);
            }
            if (page === 0) okQueries++;
            params.log(`BOAMP : ${results.length} avis (offset ${offset}, total ${data.total_count ?? "?"})`);
            if (results.length < PAGE) break;
          } catch (e) {
            warnings.push(`Requête BOAMP échouée (${where.slice(0, 80)}…) : ${e instanceof Error ? e.message : String(e)}`);
            break;
          }
        }
      }
      if (okQueries === 0) throw new Error(warnings[0] ?? "Aucune requête BOAMP n'a abouti.");
      return { notices: [...notices.values()], warnings, nextCursor: { since: params.since } };
    },
  };
}
