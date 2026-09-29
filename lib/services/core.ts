import { memberToContext, PermissionError, type AccessContext } from "@/lib/permissions";
import type { DataStore } from "@/lib/data/store";
import { nowIso, uid, type TenantRepository } from "@/lib/data/repository";
import { garageSchema, parse } from "@/lib/validation/schemas";
import type { Garage, GarageMember, GarageSettings, PriceCatalogItem, Profile } from "@/types";

export const DEFAULT_SETTINGS: GarageSettings = {
  vat_rate: 20,
  labor_hourly_rate: null,
  workshop_capacity: 6,
  quote_validity_days: 30,
  quote_follow_up_days: 3,
  currency: "EUR",
};

/** Construit le contexte d'accès : l'utilisateur DOIT être membre du garage. */
export async function buildContext(store: DataStore, userId: string, garageId: string): Promise<AccessContext> {
  const [member] = await store.list("garage_members", { user_id: userId, garage_id: garageId });
  if (!member) throw new PermissionError("Vous n'êtes pas membre de ce garage");
  const teamIds = (await store.list("team_members", { user_id: userId, garage_id: garageId })).map((t) => t.team_id);
  const managed = (await store.list("teams", { garage_id: garageId, manager_id: userId })).map((t) => t.id);
  return memberToContext(member, [...new Set([...teamIds, ...(member.team_id ? [member.team_id] : [])])], managed);
}

export async function listMyGarages(store: DataStore, userId: string): Promise<{ garage: Garage; member: GarageMember }[]> {
  const memberships = await store.list("garage_members", { user_id: userId });
  const out: { garage: Garage; member: GarageMember }[] = [];
  for (const m of memberships) {
    const g = await store.get("garages", m.garage_id);
    if (g) out.push({ garage: g, member: m });
  }
  return out.sort((a, b) => a.garage.name.localeCompare(b.garage.name));
}

/** Catalogue initial : libellés uniquement, prix vides (le garage renseigne SES tarifs). */
export const DEFAULT_CATALOG: Omit<PriceCatalogItem, "id" | "garage_id" | "created_at">[] = [
  { category: "LABOR", key: "labor_hour", label: "Main-d'œuvre (taux horaire)", unit_price: null, default_hours: null },
  { category: "SERVICE", key: "diagnostic", label: "Diagnostic électronique", unit_price: null, default_hours: null },
  { category: "SERVICE", key: "vidange", label: "Vidange + filtre à huile", unit_price: null, default_hours: null },
  { category: "SERVICE", key: "freinage_av", label: "Plaquettes de frein avant", unit_price: null, default_hours: null },
  { category: "SERVICE", key: "distribution", label: "Kit de distribution", unit_price: null, default_hours: null },
];

export async function createGarage(store: DataStore, userId: string, input: unknown): Promise<Garage> {
  const data = parse(garageSchema, input);
  const now = nowIso();
  const garage: Garage = { id: uid(), ...data, settings: { ...DEFAULT_SETTINGS }, created_at: now, updated_at: now };
  await store.insert("garages", garage);
  await store.insert("garage_members", { id: uid(), garage_id: garage.id, user_id: userId, role: "OWNER", team_id: null, permissions: [], created_at: now });
  for (const item of DEFAULT_CATALOG) {
    await store.insert("price_catalog", { ...item, id: uid(), garage_id: garage.id, created_at: now });
  }
  await store.insert("audit_logs", { id: uid(), garage_id: garage.id, user_id: userId, action: "garage.create", entity_type: "garage", entity_id: garage.id, details: { name: garage.name }, created_at: now });
  return garage;
}

export async function getProfile(store: DataStore, userId: string): Promise<Profile | null> {
  return store.get("profiles", userId);
}

export async function audit(r: TenantRepository, action: string, entity_type: string, entity_id?: string | null, details?: Record<string, unknown>) {
  await r.insert("audit_logs", { user_id: r.ctx.userId, action, entity_type, entity_id: entity_id ?? null, details: details ?? null });
}
