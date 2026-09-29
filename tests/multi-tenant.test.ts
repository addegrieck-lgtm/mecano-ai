import { describe, expect, it } from "vitest";
import { PermissionError } from "@/lib/permissions";
import { NotFoundError } from "@/lib/data/repository";
import { as, demoStore } from "./helpers";

describe("Isolation multi-garage", () => {
  it("Garage A ne voit pas les données du Garage B", async () => {
    const store = demoStore();
    const dupont = await as(store, "u-paul", "g-dupont");
    const martin = await as(store, "u-claire", "g-martin");

    const dupontVehicles = await dupont.crm.vehicles();
    const martinVehicles = await martin.crm.vehicles();
    expect(dupontVehicles.length).toBeGreaterThan(0);
    expect(martinVehicles.length).toBeGreaterThan(0);
    expect(dupontVehicles.every((v) => v.garage_id === "g-dupont")).toBe(true);
    expect(martinVehicles.every((v) => v.garage_id === "g-martin")).toBe(true);

    const dupontClients = await dupont.crm.clients();
    expect(dupontClients.some((c) => c.id === "c-paulette")).toBe(false);
    const quotes = await dupont.work.quotes();
    expect(quotes.some((q) => q.garage_id === "g-martin")).toBe(false);
  });

  it("refuse l'accès direct par identifiant à un objet d'un autre garage (IDOR)", async () => {
    const store = demoStore();
    const martin = await as(store, "u-claire", "g-martin");
    await expect(martin.crm.vehicle("v-308")).rejects.toBeInstanceOf(NotFoundError);
    await expect(martin.work.quote("q-308-1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(martin.diagnostics.get("d-clio-1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(martin.crm.updateClient("c-jean", { first_name: "Pirate", last_name: "X" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(martin.work.intervention("i-today-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("n'autorise pas à rattacher une donnée à un véhicule d'un autre garage", async () => {
    const store = demoStore();
    const martin = await as(store, "u-claire", "g-martin");
    await expect(martin.diagnostics.create({ vehicle_id: "v-308", symptoms: [], codes: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(martin.work.createQuote({ vehicle_id: "v-golf", items: [] })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ignore un garage_id forcé par l'appelant", async () => {
    const store = demoStore();
    const martin = await as(store, "u-claire", "g-martin");
    const client = await martin.crm.createClient({ first_name: "Test", last_name: "Injection", garage_id: "g-dupont" } as never);
    expect(client.garage_id).toBe("g-martin");
  });

  it("un utilisateur non membre ne peut pas ouvrir un garage", async () => {
    const store = demoStore();
    await expect(as(store, "u-hugo", "g-dupont")).rejects.toBeInstanceOf(PermissionError);
  });

  it("un utilisateur multi-garages voit chaque garage séparément selon son rôle", async () => {
    const store = demoStore();
    const alexDupont = await as(store, "u-alex", "g-dupont");
    const alexMartin = await as(store, "u-alex", "g-martin");
    expect(alexDupont.ctx.role).toBe("MECHANIC");
    expect(alexMartin.ctx.role).toBe("ADMIN");
    expect((await alexMartin.crm.vehicles()).every((v) => v.garage_id === "g-martin")).toBe(true);
  });
});
