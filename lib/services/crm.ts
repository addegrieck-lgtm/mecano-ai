import { assertCan } from "@/lib/permissions";
import { nowIso, type TenantRepository } from "@/lib/data/repository";
import { catalogItemSchema, clientSchema, intakeSchema, parse, partSchema, photoSchema, vehicleSchema } from "@/lib/validation/schemas";
import type { Client, Part, Photo, PhotoEntity, PriceCatalogItem, Vehicle, VehicleIntake } from "@/types";
import { audit } from "./core";

export const clientName = (c?: Pick<Client, "first_name" | "last_name"> | null) => (c ? `${c.first_name} ${c.last_name}` : "Client non renseigné");
export const vehicleLabel = (v?: Pick<Vehicle, "make" | "model" | "registration"> | null) => (v ? `${v.make} ${v.model} · ${v.registration}` : "Véhicule inconnu");

export function crmService(r: TenantRepository) {
  // ---------- Clients ----------
  async function clients(search = ""): Promise<(Client & { vehicleCount: number })[]> {
    assertCan(r.ctx, "clients:read");
    const [list, vehicles] = await Promise.all([r.list("clients"), r.list("vehicles")]);
    const q = search.trim().toLowerCase();
    return list
      .filter((c) => !q || `${c.first_name} ${c.last_name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q))
      .map((c) => ({ ...c, vehicleCount: vehicles.filter((v) => v.client_id === c.id).length }))
      .sort((a, b) => a.last_name.localeCompare(b.last_name));
  }

  async function client(id: string) {
    assertCan(r.ctx, "clients:read");
    return r.require("clients", id, "Client");
  }

  async function createClient(input: unknown): Promise<Client> {
    assertCan(r.ctx, "clients:write");
    const data = parse(clientSchema, input);
    const c = await r.insert("clients", { ...data, updated_at: nowIso() });
    await audit(r, "client.create", "client", c.id);
    return c;
  }

  async function updateClient(id: string, input: unknown): Promise<Client> {
    assertCan(r.ctx, "clients:write");
    const data = parse(clientSchema, input);
    const c = await r.update("clients", id, { ...data, updated_at: nowIso() });
    await audit(r, "client.update", "client", id);
    return c;
  }

  async function deleteClient(id: string): Promise<void> {
    assertCan(r.ctx, "clients:delete");
    await r.require("clients", id, "Client");
    for (const v of await r.list("vehicles", { client_id: id })) await r.update("vehicles", v.id, { client_id: null });
    await r.remove("clients", id);
    await audit(r, "client.delete", "client", id);
  }

  // ---------- Véhicules ----------
  async function vehicles(search = "", clientId?: string): Promise<(Vehicle & { client: Client | null })[]> {
    assertCan(r.ctx, "vehicles:read");
    const [list, cl] = await Promise.all([r.list("vehicles", clientId ? { client_id: clientId } : {}), r.list("clients")]);
    const q = search.trim().toLowerCase();
    return list
      .map((v) => ({ ...v, client: cl.find((c) => c.id === v.client_id) ?? null }))
      .filter((v) => !q || `${v.registration} ${v.vin ?? ""} ${v.make} ${v.model} ${clientName(v.client)}`.toLowerCase().includes(q))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async function vehicle(id: string): Promise<{ vehicle: Vehicle; client: Client | null }> {
    assertCan(r.ctx, "vehicles:read");
    const v = await r.require("vehicles", id, "Véhicule");
    return { vehicle: v, client: await r.find("clients", v.client_id) };
  }

  async function findVehicleByVin(vin: string): Promise<Vehicle | null> {
    const list = await r.list("vehicles");
    return list.find((v) => v.vin && v.vin.toUpperCase() === vin.toUpperCase()) ?? null;
  }

  async function createVehicle(input: unknown): Promise<Vehicle> {
    assertCan(r.ctx, "vehicles:write");
    const data = parse(vehicleSchema, input);
    if (data.client_id) await r.require("clients", data.client_id, "Client");
    const dup = (await r.list("vehicles")).find((v) => v.registration === data.registration);
    if (dup) throw new Error(`Immatriculation déjà enregistrée (${dup.make} ${dup.model})`);
    const v = await r.insert("vehicles", { ...data, updated_at: nowIso() });
    await audit(r, "vehicle.create", "vehicle", v.id, { registration: v.registration });
    return v;
  }

  async function updateVehicle(id: string, input: unknown): Promise<Vehicle> {
    assertCan(r.ctx, "vehicles:write");
    const data = parse(vehicleSchema, input);
    if (data.client_id) await r.require("clients", data.client_id, "Client");
    const dup = (await r.list("vehicles")).find((v) => v.registration === data.registration && v.id !== id);
    if (dup) throw new Error("Immatriculation déjà utilisée par un autre véhicule");
    const v = await r.update("vehicles", id, { ...data, updated_at: nowIso() });
    await audit(r, "vehicle.update", "vehicle", id);
    return v;
  }

  async function updateMileage(id: string, mileage: number | null | undefined) {
    if (mileage == null) return;
    const v = await r.require("vehicles", id, "Véhicule");
    if (v.mileage == null || mileage > v.mileage) await r.update("vehicles", id, { mileage, updated_at: nowIso() });
  }

  async function deleteVehicle(id: string): Promise<void> {
    assertCan(r.ctx, "vehicles:delete");
    await r.require("vehicles", id, "Véhicule");
    const linked = (await Promise.all([r.list("diagnostics", { vehicle_id: id }), r.list("quotes", { vehicle_id: id }), r.list("interventions", { vehicle_id: id })])).some((l) => l.length > 0);
    if (linked) throw new Error("Ce véhicule possède un historique (diagnostics, devis ou interventions) : suppression impossible.");
    await r.remove("vehicles", id);
    await audit(r, "vehicle.delete", "vehicle", id);
  }

  // ---------- Réception véhicule ----------
  async function createIntake(input: unknown): Promise<VehicleIntake> {
    assertCan(r.ctx, "intake:write");
    const data = parse(intakeSchema, input);
    const v = await r.require("vehicles", data.vehicle_id, "Véhicule");
    const { client_validated, ...rest } = data;
    const intake = await r.insert("vehicle_intakes", {
      ...rest,
      client_id: v.client_id ?? null,
      user_id: r.ctx.userId,
      client_validated_at: client_validated ? nowIso() : null,
    });
    await updateMileage(v.id, data.mileage);
    await audit(r, "intake.create", "vehicle_intake", intake.id, { vehicle_id: v.id });
    return intake;
  }

  async function intakes(vehicleId?: string): Promise<VehicleIntake[]> {
    const list = await r.list("vehicle_intakes", vehicleId ? { vehicle_id: vehicleId } : {});
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  // ---------- Photos ----------
  async function addPhoto(input: unknown): Promise<Photo> {
    assertCan(r.ctx, "photos:write");
    const data = parse(photoSchema, input);
    const tableFor: Record<PhotoEntity, "vehicles" | "diagnostics" | "interventions" | "quotes" | "vehicle_intakes"> = {
      vehicle: "vehicles",
      diagnostic: "diagnostics",
      intervention: "interventions",
      quote: "quotes",
      intake: "vehicle_intakes",
    };
    const entity = (await r.require(tableFor[data.entity_type], data.entity_id, "Élément")) as { id: string; vehicle_id?: string };
    const vehicle_id = data.entity_type === "vehicle" ? entity.id : (entity.vehicle_id ?? data.vehicle_id);
    const photo = await r.insert("photos", { ...data, vehicle_id, user_id: r.ctx.userId });
    await audit(r, "photo.add", data.entity_type, data.entity_id);
    return photo;
  }

  async function photos(filter: { vehicle_id?: string; entity_type?: PhotoEntity; entity_id?: string }): Promise<Photo[]> {
    const list = await r.list("photos", filter);
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function removePhoto(id: string): Promise<void> {
    assertCan(r.ctx, "photos:write");
    const p = await r.require("photos", id, "Photo");
    if (p.user_id !== r.ctx.userId) assertCan(r.ctx, "garage:manage");
    await r.remove("photos", id);
    await audit(r, "photo.remove", p.entity_type, p.entity_id);
  }

  // ---------- Catalogue & pièces ----------
  async function catalog(): Promise<PriceCatalogItem[]> {
    return (await r.list("price_catalog")).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }

  async function saveCatalogItem(id: string | null, input: unknown): Promise<PriceCatalogItem> {
    assertCan(r.ctx, "catalog:manage");
    const data = parse(catalogItemSchema, input);
    const dup = (await r.list("price_catalog", { key: data.key })).find((c) => c.id !== id);
    if (dup) throw new Error("Cette clé existe déjà dans le catalogue");
    const item = id ? await r.update("price_catalog", id, data) : await r.insert("price_catalog", data);
    await audit(r, id ? "catalog.update" : "catalog.create", "price_catalog", item.id);
    return item;
  }

  async function removeCatalogItem(id: string) {
    assertCan(r.ctx, "catalog:manage");
    await r.remove("price_catalog", id);
    await audit(r, "catalog.delete", "price_catalog", id);
  }

  async function parts(search = ""): Promise<Part[]> {
    const q = search.trim().toLowerCase();
    return (await r.list("parts")).filter((p) => !q || `${p.reference} ${p.name} ${p.brand ?? ""}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function savePart(id: string | null, input: unknown): Promise<Part> {
    assertCan(r.ctx, "catalog:manage");
    const data = parse(partSchema, input);
    const part = id ? await r.update("parts", id, data) : await r.insert("parts", data);
    await audit(r, id ? "part.update" : "part.create", "part", part.id);
    return part;
  }

  async function removePart(id: string) {
    assertCan(r.ctx, "catalog:manage");
    await r.remove("parts", id);
    await audit(r, "part.delete", "part", id);
  }

  return {
    clients,
    client,
    createClient,
    updateClient,
    deleteClient,
    vehicles,
    vehicle,
    findVehicleByVin,
    createVehicle,
    updateVehicle,
    updateMileage,
    deleteVehicle,
    createIntake,
    intakes,
    addPhoto,
    photos,
    removePhoto,
    catalog,
    saveCatalogItem,
    removeCatalogItem,
    parts,
    savePart,
    removePart,
  };
}
