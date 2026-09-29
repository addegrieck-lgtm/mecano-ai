/**
 * Phase 3 — SaaS commercial : définition des offres et limites par plan.
 * Préparation uniquement : aucun paiement n'est branché (voir PaymentProvider).
 * Les prix des offres seront fixés commercialement ; ils ne sont pas définis ici.
 */
export type PlanId = "FREE" | "PRO" | "MULTI_SITE";

export interface PlanLimits {
  maxUsers: number | null; // null = illimité
  maxTeams: number | null;
  maxVehicles: number | null;
  realObd: boolean;
  localAi: boolean;
  multiGarage: boolean;
}

export const PLANS: Record<PlanId, { label: string; limits: PlanLimits }> = {
  FREE: { label: "Découverte", limits: { maxUsers: 3, maxTeams: 2, maxVehicles: 200, realObd: true, localAi: true, multiGarage: false } },
  PRO: { label: "Pro", limits: { maxUsers: 25, maxTeams: 10, maxVehicles: null, realObd: true, localAi: true, multiGarage: false } },
  MULTI_SITE: { label: "Multi-sites", limits: { maxUsers: null, maxTeams: null, maxVehicles: null, realObd: true, localAi: true, multiGarage: true } },
};

export function isWithinLimit(limit: number | null, current: number): boolean {
  return limit === null || current < limit;
}
