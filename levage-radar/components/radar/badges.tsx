import { Badge } from "@/components/ui";
import { CATEGORIES, DOMAINS, SERVICE_TYPES, TRACKING_STATUSES, type Category, type OppDomain, type TrackingStatus } from "@/lib/radar/types";
import type { ServiceType } from "@/lib/radar/dictionaries";
import { daysUntil, fmtDateTime } from "@/lib/format";

export function DomainBadge({ domain }: { domain: string }) {
  const tone = domain === "LEVAGE" ? "teal" : domain === "ELECTRICITE" ? "amber" : domain === "MIXTE" ? "violet" : "slate";
  return <Badge tone={tone}>{DOMAINS[domain as OppDomain] ?? domain}</Badge>;
}

export function CategoryBadge({ category }: { category: string }) {
  const tone: Record<string, "green" | "blue" | "slate" | "violet" | "amber" | "red" | "teal"> = {
    ACTIVE: "green",
    UPCOMING: "blue",
    CLOSED: "slate",
    AWARDED: "violet",
    CONTRACT_WATCH: "violet",
    SUPPLIER_CALL: "teal",
    SIGNAL: "amber",
    INDIRECT: "blue",
    IRRELEVANT: "slate",
  };
  return <Badge tone={tone[category] ?? "slate"}>{CATEGORIES[category as Category] ?? category}</Badge>;
}

export function ServiceBadge({ serviceType }: { serviceType: string }) {
  return <Badge tone={serviceType === "INSPECTION" ? "green" : serviceType === "TRAVAUX" || serviceType === "FOURNITURE" ? "red" : "slate"}>{SERVICE_TYPES[serviceType as ServiceType] ?? serviceType}</Badge>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "NOUVEAU") as TrackingStatus;
  const tone = s === "EN_PREPARATION" ? "blue" : s === "EN_ANALYSE" ? "teal" : s === "TRANSMIS_MANUELLEMENT" ? "green" : s === "NON_PERTINENT" || s === "ARCHIVE" ? "slate" : "slate";
  return <Badge tone={tone}>{TRACKING_STATUSES[s] ?? s}</Badge>;
}

export function Deadline({ at, open }: { at: Date | null; open: boolean }) {
  if (!at) return <span className="text-xs text-amber-700 dark:text-amber-400">Non publiée</span>;
  const d = daysUntil(at)!;
  const cls = !open || d < 0 ? "text-slate-400" : d <= 3 ? "font-semibold text-red-600" : d <= 7 ? "font-medium text-amber-700" : "text-slate-700 dark:text-slate-300";
  return (
    <span className={`text-xs ${cls}`} title={fmtDateTime(at)}>
      {fmtDateTime(at)}
      {open && d >= 0 && <span className="block text-[11px]">J-{d}</span>}
    </span>
  );
}
