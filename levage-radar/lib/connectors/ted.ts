import type { NoticeKind, NormalizedNotice } from "@/lib/radar/types";
import { SEARCH_QUERIES } from "@/lib/radar/dictionaries";
import { ISO3_TO_ISO2 } from "@/lib/radar/geo";
import { asArray, parseAmount, pickLang, textOf, toIsoDate, toIsoDateTime } from "./extract";
import { HttpError, httpJson, type HttpOptions } from "./http";
import type { Connector, ConnectorInfo, FetchParams, FetchResult } from "./types";

/**
 * Connecteur TED (Tenders Electronic Daily — Office des publications de l'UE).
 * API de recherche v3, accès libre sans clé :
 *   POST https://api.ted.europa.eu/v3/notices/search
 *   { query (syntaxe de recherche experte), fields, page, limit (≤ 100), scope, paginationMode }
 * Requête : FT~"…" (texte intégral), PD>=AAAAMMJJ (date de publication), buyer-country=FRA (pays ISO-3).
 * Réutilisation : décision 2011/833/UE — réutilisation autorisée avec mention de la source.
 */
export const TED_INFO: ConnectorInfo = {
  id: "ted",
  name: "TED — Journal officiel de l'UE (S)",
  status: "implemented",
  geography: "Union européenne / EEE (+ quelques pays tiers publiant sur TED)",
  dataTypes: ["Avis de marché", "Avis de pré-information", "Avis d'attribution", "Rectificatifs"],
  access: "API publique de recherche v3, sans clé",
  method: "Recherche experte en texte intégral (FR + EN) + filtre de date de publication (incrémental) et de pays (configurable)",
  frequency: "Quotidienne (TED publie du mardi au samedi)",
  licence: "Réutilisation autorisée avec mention de la source (décision 2011/833/UE) — source : TED / Office des publications de l'UE",
  officialUrl: "https://ted.europa.eu/",
  coverageLimits: [
    "Seuls les marchés au-dessus des seuils européens (ou publiés volontairement) figurent sur TED.",
    "Les titres sont disponibles dans plusieurs langues ; la recherche FR/EN peut manquer des avis rédigés uniquement dans une autre langue.",
    "Les champs demandés à l'API sont configurables (TED_FIELDS) ; en cas de refus d'un champ par l'API, un jeu minimal est utilisé et la collecte est marquée partielle.",
  ],
};

const ENDPOINT = process.env.TED_API_URL ?? "https://api.ted.europa.eu/v3/notices/search";
const DEFAULT_FIELDS = [
  "publication-number",
  "notice-title",
  "notice-type",
  "buyer-name",
  "buyer-country",
  "classification-cpv",
  "publication-date",
  "deadline",
  "total-value",
  "total-value-cur",
  "links",
];
const MINIMAL_FIELDS = ["publication-number", "notice-title", "notice-type", "buyer-name", "buyer-country", "publication-date", "links"];

function fields(): string[] {
  const f = process.env.TED_FIELDS?.split(",").map((s) => s.trim()).filter(Boolean);
  return f?.length ? f : DEFAULT_FIELDS;
}

export function tedCountries(): string[] {
  const v = process.env.TED_COUNTRIES ?? "FRA";
  return v
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{3}$/.test(s));
}

const esc = (s: string) => s.replace(/"/g, "");

export function tedQueries(since: string): string[] {
  const pd = since.replace(/-/g, "");
  const countries = tedCountries();
  const countryClause = countries.length ? ` AND (${countries.map((c) => `buyer-country=${c}`).join(" OR ")})` : "";
  const terms = SEARCH_QUERIES.flatMap((q) => [...q.fr, ...q.en]);
  const groups: string[][] = [];
  for (let i = 0; i < terms.length; i += 8) groups.push(terms.slice(i, i + 8));
  return groups.map((g) => `(${g.map((t) => `FT~"${esc(t)}"`).join(" OR ")}) AND PD>=${pd}${countryClause}`);
}

export function tedNoticeKind(type: string | null): NoticeKind {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("can") || t === "veat" || t.includes("award")) return "award";
  if (t.startsWith("pin") || t.includes("prior")) return "prior_info";
  if (t.startsWith("corr")) return "corrigendum";
  if (t.startsWith("cn") || t.startsWith("qu-sy") || t.includes("contract")) return "contract";
  return "other";
}

function first(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

export function mapTedNotice(n: Record<string, unknown>): NormalizedNotice | null {
  const pub = textOf(first(n["publication-number"]));
  const title = pickLang(n["notice-title"]);
  if (!pub || !title) return null;
  const iso3 = textOf(first(n["buyer-country"]));
  const country = iso3 ? (ISO3_TO_ISO2[iso3.toUpperCase()] ?? iso3.toUpperCase()) : null;
  const type = textOf(first(n["notice-type"]));
  const kind = tedNoticeKind(type);
  const links = n.links as Record<string, Record<string, string>> | undefined;
  const url = links?.html?.FRA ?? links?.html?.ENG ?? `https://ted.europa.eu/fr/notice/-/detail/${encodeURIComponent(pub)}`;
  const cpv = [...new Set(asArray(n["classification-cpv"]).map((c) => textOf(c)?.slice(0, 8)).filter((c): c is string => !!c && /^\d{8}$/.test(c)))];
  const deadlines = asArray(n["deadline"] ?? n["deadline-receipt-tender-date-lot"])
    .map((d) => toIsoDateTime(d))
    .filter((d): d is string => !!d)
    .sort();
  const amount = parseAmount(first(n["total-value"]));
  const published = toIsoDate(first(n["publication-date"]));
  return {
    sourceId: "ted",
    sourceRef: pub,
    url,
    title: title.slice(0, 1000),
    description: pickLang(n["description-lot"] ?? n["description-proc"]) ?? null,
    buyerName: pickLang(n["buyer-name"]),
    buyerNationalId: null,
    isPublic: true,
    country,
    department: null,
    city: pickLang(n["buyer-city"]) ?? null,
    address: null,
    noticeKind: kind,
    noticeTypeRaw: type,
    publishedAt: published,
    // Plusieurs lots → la date limite la plus proche est retenue (les autres restent dans l'avis source).
    deadlineAt: deadlines[0] ?? null,
    sourceUpdatedAt: null,
    awardedAt: kind === "award" ? published : null,
    amount,
    currency: amount !== null ? (textOf(first(n["total-value-cur"])) ?? null) : null,
    durationText: null,
    durationMonths: null,
    selectionCriteria: null,
    procedureType: null,
    cpvCodes: cpv,
    lots: [],
    crossRefs: [],
    reliability: cpv.length ? "high" : "medium",
    licence: TED_INFO.licence,
    raw: n,
  };
}

type TedResponse = { notices?: Record<string, unknown>[]; totalNoticeCount?: number };

export function createTedConnector(http: HttpOptions = {}): Connector {
  return {
    info: TED_INFO,
    async fetch(params: FetchParams): Promise<FetchResult> {
      const notices = new Map<string, NormalizedNotice>();
      const warnings: string[] = [];
      let fieldList = fields();
      let okQueries = 0;
      for (const query of tedQueries(params.since)) {
        for (let page = 1; page <= params.maxPages; page++) {
          const body = { query, fields: fieldList, page, limit: 100, scope: "ALL", paginationMode: "PAGE_NUMBER" };
          try {
            const data = await httpJson<TedResponse>(
              ENDPOINT,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
              { ...http, signal: params.signal },
            );
            const list = data.notices ?? [];
            for (const raw of list) {
              const n = mapTedNotice(raw);
              if (n) notices.set(n.sourceRef, n);
            }
            if (page === 1) okQueries++;
            params.log(`TED : ${list.length} avis (page ${page}, total ${data.totalNoticeCount ?? "?"})`);
            if (list.length < 100) break;
          } catch (e) {
            if (e instanceof HttpError && e.status === 400 && fieldList !== MINIMAL_FIELDS) {
              warnings.push(`TED a refusé la liste de champs (${e.body.slice(0, 200)}) : nouvel essai avec un jeu minimal.`);
              fieldList = MINIMAL_FIELDS;
              page--;
              continue;
            }
            // Source injoignable (réseau, DNS, délai) dès la première requête : inutile d'insister sur les suivantes.
            if (okQueries === 0 && !(e instanceof HttpError)) throw e;
            warnings.push(`Requête TED échouée (${query.slice(0, 80)}…) : ${e instanceof Error ? e.message : String(e)}`);
            break;
          }
        }
      }
      if (okQueries === 0) throw new Error(warnings[warnings.length - 1] ?? "Aucune requête TED n'a abouti.");
      return { notices: [...notices.values()], warnings, nextCursor: { since: params.since } };
    },
  };
}
