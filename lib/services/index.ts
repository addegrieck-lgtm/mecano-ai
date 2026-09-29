import { TenantRepository } from "@/lib/data/repository";
import type { DataStore } from "@/lib/data/store";
import type { AccessContext } from "@/lib/permissions";
import { buildContext } from "./core";
import { crmService } from "./crm";
import { diagnosticsService } from "./diagnostics";
import { insightsService } from "./insights";
import { organizationService } from "./organization";
import { workService } from "./work";

/**
 * Point d'entrée de la couche métier. Toutes les opérations sont liées à un contexte
 * (utilisateur + garage + rôle) : impossible d'accéder aux données d'un autre garage.
 */
export function createServices(store: DataStore, ctx: AccessContext) {
  const repo = new TenantRepository(store, ctx);
  return {
    ctx,
    org: organizationService(repo),
    crm: crmService(repo),
    diagnostics: diagnosticsService(repo),
    work: workService(repo),
    insights: insightsService(repo),
  };
}

export type Services = ReturnType<typeof createServices>;

export async function servicesFor(store: DataStore, userId: string, garageId: string): Promise<Services> {
  return createServices(store, await buildContext(store, userId, garageId));
}

export { buildContext, createGarage, listMyGarages, getProfile } from "./core";
export { clientName, vehicleLabel } from "./crm";
