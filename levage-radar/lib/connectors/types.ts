import type { NormalizedNotice } from "@/lib/radar/types";

export type ConnectorStatus = "implemented" | "planned";

/** Description d'une source : affichée telle quelle dans « État des connecteurs ». */
export type ConnectorInfo = {
  id: string;
  name: string;
  status: ConnectorStatus;
  geography: string;
  dataTypes: string[];
  access: string;
  method: string;
  frequency: string;
  licence: string;
  officialUrl: string;
  coverageLimits: string[];
  /** Pour une source non intégrée : ce qui reste à vérifier / faire. */
  plannedNotes?: string;
};

export type FetchParams = {
  /** Date de publication minimale (YYYY-MM-DD) — collecte incrémentale. */
  since: string;
  /** Nombre maximal de pages par requête (protège les quotas et la durée d'exécution). */
  maxPages: number;
  signal?: AbortSignal;
  log: (msg: string) => void;
};

export type FetchResult = {
  notices: NormalizedNotice[];
  /** Erreurs non bloquantes (requête partielle échouée) : la collecte est alors « partielle ». */
  warnings: string[];
  /** Nouveau curseur à mémoriser si la collecte s'est bien passée. */
  nextCursor: Record<string, unknown>;
};

export interface Connector {
  info: ConnectorInfo;
  fetch(params: FetchParams): Promise<FetchResult>;
}
