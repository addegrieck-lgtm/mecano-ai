import type { Domain } from "@/lib/auth/permissions";

export const DOMAIN_SLUGS: Record<string, Domain> = { levage: "LEVAGE", electricite: "ELECTRICITE" };
export const slugOf = (d: string) => (d === "LEVAGE" ? "levage" : "electricite");
export const DOMAIN_LABEL: Record<Domain, string> = { LEVAGE: "levage", ELECTRICITE: "électricité" };
