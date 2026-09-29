import { describe, expect, it } from "vitest";
import { can, PermissionError, ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { NotFoundError } from "@/lib/data/repository";
import { as, demoStore } from "./helpers";

describe("Permissions", () => {
  it("OWNER possède toutes les permissions", () => {
    expect(ROLE_PERMISSIONS.OWNER).toEqual(PERMISSIONS);
  });

  it("un mécanicien ne peut pas administrer le garage", async () => {
    const store = demoStore();
    const julien = await as(store, "u-julien");
    await expect(julien.org.updateGarage({ name: "Hack" })).rejects.toBeInstanceOf(PermissionError);
    await expect(julien.org.createTeam({ name: "Équipe X", color: "#000000" })).rejects.toBeInstanceOf(PermissionError);
    await expect(julien.org.addMember({ first_name: "A", name: "B", email: "a@b.fr", role: "ADMIN" })).rejects.toBeInstanceOf(PermissionError);
    await expect(julien.org.updateMemberRole("m-g-dupont-u-lucas", "ADMIN")).rejects.toBeInstanceOf(PermissionError);
    await expect(julien.crm.saveCatalogItem(null, { category: "SERVICE", key: "x", label: "X" })).rejects.toBeInstanceOf(PermissionError);
    await expect(julien.insights.stats()).rejects.toBeInstanceOf(PermissionError);
  });

  it("un mécanicien ne voit que les interventions qui lui sont attribuées", async () => {
    const store = demoStore();
    const julien = await as(store, "u-julien");
    const list = await julien.work.interventions();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((i) => i.mechanic_id === "u-julien")).toBe(true);
    await expect(julien.work.intervention("i-today-4")).rejects.toBeInstanceOf(PermissionError); // Lucas
  });

  it("un mécanicien ne peut pas affecter une intervention à un collègue", async () => {
    const store = demoStore();
    const julien = await as(store, "u-julien");
    await expect(julien.work.createIntervention({ vehicle_id: "v-golf", title: "Test", mechanic_id: "u-lucas" })).rejects.toBeInstanceOf(PermissionError);
    const own = await julien.work.createIntervention({ vehicle_id: "v-golf", title: "Test perso" });
    expect(own.mechanic_id).toBe("u-julien");
  });

  it("un chef d'équipe voit les interventions de son équipe, pas celles des autres équipes", async () => {
    const store = demoStore();
    const thomas = await as(store, "u-thomas");
    const list = await thomas.work.interventions();
    expect(list.some((i) => i.id === "i-today-4")).toBe(true); // Lucas, équipe mécanique
    expect(list.some((i) => i.id === "i-today-2")).toBe(false); // équipe diagnostic
    expect(list.every((i) => i.team_id === "t-dup-meca" || i.mechanic_id === "u-thomas")).toBe(true);
  });

  it("un chef d'équipe ne voit pas les données d'un autre garage", async () => {
    const store = demoStore();
    const lea = await as(store, "u-lea", "g-martin");
    await expect(lea.work.intervention("i-today-1")).rejects.toBeInstanceOf(NotFoundError);
    expect((await lea.work.interventions()).every((i) => i.garage_id === "g-martin")).toBe(true);
  });

  it("un chef d'équipe gère son équipe mais pas les autres", async () => {
    const store = demoStore();
    const thomas = await as(store, "u-thomas");
    await thomas.org.addTeamMember("t-dup-meca", "u-alex");
    await expect(thomas.org.addTeamMember("t-dup-diag", "u-julien")).rejects.toBeInstanceOf(PermissionError);
    await expect(thomas.org.deleteTeam("t-dup-meca")).rejects.toBeInstanceOf(PermissionError);
  });

  it("OWNER voit tout le garage", async () => {
    const store = demoStore();
    const paul = await as(store, "u-paul");
    const all = await paul.work.interventions();
    const raw = (await store.list("interventions")).filter((i) => i.garage_id === "g-dupont");
    expect(all.length).toBe(raw.length);
    const stats = await paul.insights.stats();
    expect(stats.kpis.revenueHT).toBeGreaterThan(0);
  });

  it("VIEWER est en lecture seule", async () => {
    const store = demoStore();
    const marc = await as(store, "u-marc");
    expect((await marc.crm.vehicles()).length).toBeGreaterThan(0);
    await expect(marc.crm.createClient({ first_name: "A", last_name: "B" })).rejects.toBeInstanceOf(PermissionError);
    await expect(marc.diagnostics.create({ vehicle_id: "v-golf", symptoms: [], codes: [] })).rejects.toBeInstanceOf(PermissionError);
  });

  it("seule la réception / direction peut valider un devis", async () => {
    const store = demoStore();
    const julien = await as(store, "u-julien");
    await expect(julien.work.setQuoteStatus("q-308-1", "ACCEPTED")).rejects.toBeInstanceOf(PermissionError);
    const emma = await as(store, "u-emma");
    const q = await emma.work.setQuoteStatus("q-308-1", "ACCEPTED");
    expect(q.status).toBe("ACCEPTED");
  });

  it("les permissions sont extensibles par membre", () => {
    expect(can({ role: "MECHANIC", extraPermissions: [] }, "stats:view")).toBe(false);
    expect(can({ role: "MECHANIC", extraPermissions: ["stats:view"] }, "stats:view")).toBe(true);
  });

  it("le garage conserve toujours au moins un patron", async () => {
    const store = demoStore();
    const paul = await as(store, "u-paul");
    await expect(paul.org.updateMemberRole("m-g-dupont-u-paul", "ADMIN")).rejects.toThrow(/au moins un patron/);
  });
});
