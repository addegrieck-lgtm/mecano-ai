import type { ServiceType } from "./dictionaries";

export type NoticeKind = "contract" | "prior_info" | "award" | "corrigendum" | "cancellation" | "supplier_call" | "other";

/** Format commun produit par tous les connecteurs (aucune valeur inventée : null si absent de la source). */
export type NormalizedNotice = {
  sourceId: string;
  sourceRef: string;
  url: string | null;
  title: string;
  description: string | null;
  buyerName: string | null;
  buyerNationalId: string | null;
  isPublic: boolean;
  country: string | null; // ISO 3166-1 alpha-2
  department: string | null;
  city: string | null;
  address: string | null;
  noticeKind: NoticeKind;
  noticeTypeRaw: string | null;
  publishedAt: string | null; // YYYY-MM-DD
  deadlineAt: string | null; // ISO 8601
  sourceUpdatedAt: string | null;
  awardedAt: string | null; // YYYY-MM-DD
  amount: number | null;
  currency: string | null;
  durationText: string | null;
  durationMonths: number | null;
  selectionCriteria: string | null;
  procedureType: string | null;
  cpvCodes: string[];
  lots: { number: string | null; title: string; description: string | null; cpvCodes: string[] }[];
  /** Références d'autres avis liés publiées par la source (ex. numéro TED, avis initial). */
  crossRefs: string[];
  reliability: "high" | "medium" | "low";
  licence: string | null;
  raw: unknown;
};

export const CATEGORIES = {
  ACTIVE: "Consultation active",
  UPCOMING: "Consultation à venir ou annoncée",
  CLOSED: "Consultation clôturée",
  AWARDED: "Marché attribué",
  CONTRACT_WATCH: "Contrat ou échéance à surveiller",
  SUPPLIER_CALL: "Appel à fournisseurs",
  SIGNAL: "Projet industriel ou signal commercial",
  INDIRECT: "Opportunité indirecte / marché multiservices",
  IRRELEVANT: "Résultat non pertinent",
} as const;
export type Category = keyof typeof CATEGORIES;

export const DOMAINS = { LEVAGE: "Levage", ELECTRICITE: "Électricité", MIXTE: "Levage + Électricité", AUCUN: "Hors domaine" } as const;
export type OppDomain = keyof typeof DOMAINS;

export const SERVICE_TYPES: Record<ServiceType, string> = {
  INSPECTION: "Inspection / vérification",
  MAINTENANCE: "Maintenance",
  TRAVAUX: "Travaux",
  FOURNITURE: "Fourniture / location",
  MULTISERVICE: "Multiservices / multitechnique",
  AUTRE: "Autre / indéterminé",
};

/** Catégories sur lesquelles il est (ou sera) possible de candidater. */
export const CANDIDATABLE: Category[] = ["ACTIVE", "UPCOMING", "SUPPLIER_CALL", "INDIRECT"];

export const TRACKING_STATUSES = {
  NOUVEAU: "Nouveau",
  EN_ANALYSE: "En analyse",
  EN_PREPARATION: "Préparation du dossier",
  TRANSMIS_MANUELLEMENT: "Transmis manuellement au logiciel officiel",
  NON_PERTINENT: "Non pertinent",
  ARCHIVE: "Archivé",
} as const;
export type TrackingStatus = keyof typeof TRACKING_STATUSES;
