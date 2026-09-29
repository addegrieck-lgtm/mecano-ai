import type { DiagnosticStatus, FuelType, InterventionStatus, QuoteStatus } from "@/types";

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
export const fmtKm = (km?: number | null) => (km == null ? "—" : `${km.toLocaleString("fr-FR")} km`);
export const fmtDuration = (min?: number | null) => {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m ? String(m).padStart(2, "0") : ""}`.trim() : `${m} min`;
};
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const localDayKey = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Valeur pour <input type="datetime-local"> */
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const FUEL_LABELS: Record<FuelType, string> = {
  DIESEL: "Diesel",
  ESSENCE: "Essence",
  HYBRIDE: "Hybride",
  HYBRIDE_RECHARGEABLE: "Hybride rechargeable",
  ELECTRIQUE: "Électrique",
  GPL: "GPL",
  AUTRE: "Autre",
};

export const INTERVENTION_STATUS: Record<InterventionStatus, { label: string; tone: Tone }> = {
  WAITING: { label: "En attente", tone: "muted" },
  IN_PROGRESS: { label: "En cours", tone: "primary" },
  WAITING_PART: { label: "Attente pièce", tone: "warning" },
  COMPLETED: { label: "Terminée", tone: "success" },
  CANCELLED: { label: "Annulée", tone: "danger" },
};

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Brouillon", tone: "muted" },
  SENT: { label: "Envoyé", tone: "info" },
  ACCEPTED: { label: "Accepté", tone: "success" },
  REFUSED: { label: "Refusé", tone: "danger" },
  EXPIRED: { label: "Expiré", tone: "warning" },
};

export const DIAGNOSTIC_STATUS: Record<DiagnosticStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Ouvert", tone: "muted" },
  ANALYSIS: { label: "Analyse", tone: "info" },
  TESTING: { label: "Contrôles", tone: "primary" },
  CONCLUDED: { label: "Conclu", tone: "success" },
  CLOSED: { label: "Clôturé", tone: "muted" },
};

export type Tone = "muted" | "primary" | "success" | "warning" | "danger" | "info";

export const initials = (first?: string, last?: string) => `${(first ?? "?")[0] ?? ""}${(last ?? "")[0] ?? ""}`.toUpperCase();
