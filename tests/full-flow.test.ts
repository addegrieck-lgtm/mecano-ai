import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/data/store";
import { createGarage, servicesFor } from "@/lib/services";
import { SimulatorOBDProvider } from "@/lib/obd/simulator-obd-provider";
import { MockAIProvider } from "@/lib/ai/mock-provider";

/**
 * Parcours complet MECANO AI, sur un store vierge :
 * garage → équipe → mécanicien → client → véhicule → OBD simulateur → P0302 → diagnostic
 * → test guidé → conclusion → devis → intervention → clôture → historique → statistiques.
 */
describe("Parcours complet", () => {
  it("de la création du garage à l'historique du véhicule", async () => {
    const store = new MemoryStore({
      profiles: [{ id: "u-owner", first_name: "Patron", name: "Test", email: "patron@test.demo", created_at: new Date().toISOString() }],
    });

    // 1. Garage
    const garage = await createGarage(store, "u-owner", { name: "Garage Test", city: "Lyon", postal_code: "69001" });
    const owner = await servicesFor(store, "u-owner", garage.id);
    expect(owner.ctx.role).toBe("OWNER");
    await owner.org.updateSettings({ vat_rate: 20, labor_hourly_rate: 70, workshop_capacity: 4, quote_validity_days: 30, quote_follow_up_days: 3 });
    const labor = (await owner.crm.catalog()).find((c) => c.key === "labor_hour")!;
    await owner.crm.saveCatalogItem(labor.id, { category: "LABOR", key: "labor_hour", label: labor.label, unit_price: 70 });
    const diagItem = (await owner.crm.catalog()).find((c) => c.key === "diagnostic")!;
    await owner.crm.saveCatalogItem(diagItem.id, { category: "SERVICE", key: "diagnostic", label: "Diagnostic OBD", unit_price: 55 });
    await expect(owner.crm.saveCatalogItem(null, { category: "SERVICE", key: "diagnostic", label: "Doublon" })).rejects.toThrow(/existe déjà/);
    await owner.crm.saveCatalogItem(null, { category: "LABOR", key: "remplacement_bobine", label: "Remplacement bobine", default_hours: 0.5 });
    await owner.crm.savePart(null, { reference: "REF-TEST-1", name: "Bobine d'allumage", price: 60, stock: 3 });

    // 2. Équipes
    const meca = await owner.org.createTeam({ name: "Équipe mécanique", color: "#f97316" });
    const diag = await owner.org.createTeam({ name: "Équipe diagnostic", color: "#38bdf8" });

    // 3. Mécaniciens affectés aux équipes
    const tom = await owner.org.addMember({ first_name: "Tom", name: "Méca", email: "tom@test.demo", role: "MECHANIC", team_id: diag.id });
    const lea = await owner.org.addMember({ first_name: "Léa", name: "Cheffe", email: "lea@test.demo", role: "TEAM_MANAGER", team_id: meca.id });
    await owner.org.setTeamManager(meca.id, lea.profile.id);
    expect((await owner.org.teams()).find((t) => t.id === meca.id)!.memberIds).toContain(lea.profile.id);

    // 4. Client & véhicule
    const client = await owner.crm.createClient({ first_name: "Jean", last_name: "Client", phone: "06 00 00 00 00" });
    const vehicle = await owner.crm.createVehicle({
      client_id: client.id,
      registration: "aa-123-bb",
      vin: "WVWZZZAUZHW098765",
      make: "Volkswagen",
      model: "Golf",
      year: 2017,
      engine: "1.4 TSI",
      fuel: "ESSENCE",
      mileage: 120000,
    });
    expect(vehicle.registration).toBe("AA-123-BB");

    // 5. Le mécanicien connecte l'OBD simulateur et lit P0302
    const mech = await servicesFor(store, tom.profile.id, garage.id);
    const obd = new SimulatorOBDProvider({ latencyMs: 0, scenarioId: "p0302", vin: vehicle.vin! });
    await obd.connect();
    const info = await obd.readVehicleInfo();
    const matched = await mech.crm.findVehicleByVin(info.vin!);
    expect(matched?.id).toBe(vehicle.id);
    const session = await mech.diagnostics.startObdSession({ vehicle_id: vehicle.id, provider: "SIMULATOR", device_name: "Simulateur", vin: info.vin });
    const codes = await obd.readDTCs();
    expect(codes).toEqual(["P0302"]);
    const live = await obd.readLiveData();
    await mech.diagnostics.updateObdSession(session.id, { dtcs: codes, live });

    // 6. Diagnostic
    const d = await mech.diagnostics.create({ vehicle_id: vehicle.id, symptoms: ["Moteur qui broute"], codes, obd_session_id: session.id, mileage: 120450 });
    expect(d.team_id).toBe(diag.id);
    let full = await mech.diagnostics.get(d.id);
    expect(full.codes.map((c) => c.code)).toEqual(["P0302"]);
    expect(full.liveData.length).toBe(1);

    // 7. Analyse IA (Mock)
    const ai = new MockAIProvider();
    const analysis = await ai.generateDiagnosis({ codes, symptoms: full.diagnostic.symptoms, vehicle: { make: vehicle.make, model: vehicle.model, fuel: vehicle.fuel }, liveData: live });
    await mech.diagnostics.saveAnalysis(d.id, analysis, analysis.provider);

    // 8. Test guidé : le défaut se déplace avec la bobine
    await mech.diagnostics.recordTest(d.id, { dtc: "P0302", stepId: "swap_coil", answer: "YES" });
    full = await mech.diagnostics.get(d.id);
    expect(full.evaluation.suggestedConclusion.causeId).toBe("ignition_coil");

    // 9. Conclusion (à confirmer puis confirmée par le technicien)
    await mech.diagnostics.conclude(d.id, { cause_id: "ignition_coil", summary: full.evaluation.suggestedConclusion.text, confirmed_by_technician: true, recommended_repair: "Remplacement bobine cylindre 2" });

    // 10. Devis pré-rempli depuis le diagnostic (prix issus du catalogue garage)
    const quote = await mech.work.createQuoteFromDiagnostic(d.id);
    const qv = await mech.work.quote(quote.id);
    expect(qv.items.map((i) => i.kind)).toEqual(["SERVICE", "LABOR", "PART"]);
    expect(qv.totals.missingPrices).toBe(0);
    expect(qv.totals.totalHT).toBe(55 + 35 + 60);
    expect(qv.totals.totalTTC).toBe(180);
    await owner.work.setQuoteStatus(quote.id, "SENT");
    await owner.work.setQuoteStatus(quote.id, "ACCEPTED");

    // 11. Intervention affectée à l'équipe mécanique et à un mécanicien
    const intervention = await owner.work.createInterventionFromQuote(quote.id, { team_id: meca.id, mechanic_id: lea.profile.id, scheduled_at: new Date().toISOString() });
    expect(intervention.team_id).toBe(meca.id);
    expect(intervention.parts[0].reference).toBe("REF-TEST-1");
    const manager = await servicesFor(store, lea.profile.id, garage.id);
    expect((await manager.work.interventions()).map((i) => i.id)).toContain(intervention.id);
    expect((await mech.work.interventions()).map((i) => i.id)).not.toContain(intervention.id);

    // 12. Réalisation, photo, clôture
    await manager.work.setInterventionStatus(intervention.id, "IN_PROGRESS");
    await manager.crm.addPhoto({
      entity_type: "intervention",
      entity_id: intervention.id,
      caption: "Bobine remplacée",
      mime_type: "image/jpeg",
      size_bytes: 12,
      url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    });
    await manager.work.setInterventionStatus(intervention.id, "COMPLETED", { actual_duration_minutes: 30 });
    const part = (await owner.crm.parts()).find((p) => p.reference === "REF-TEST-1")!;
    expect(part.stock).toBe(2);
    await owner.work.addReview({ intervention_id: intervention.id, rating: 5, comment: "Parfait" });

    // 13. Historique du véhicule
    const history = await owner.insights.vehicleHistory(vehicle.id);
    const kinds = history.map((e) => e.kind);
    for (const k of ["OBD", "DIAGNOSTIC", "TEST", "CONCLUSION", "QUOTE", "INTERVENTION", "PHOTO", "REVIEW"]) expect(kinds).toContain(k);
    expect(history.map((e) => e.date)).toEqual([...history.map((e) => e.date)].sort());
    expect(history.some((e) => e.title.startsWith("Réparation terminée"))).toBe(true);

    // 14. Statistiques
    const stats = await owner.insights.stats();
    expect(stats.kpis.revenueHT).toBe(150);
    expect(stats.kpis.acceptanceRate).toBe(100);
    expect(stats.byTeam.find((t) => t.team.id === meca.id)!.interventions).toBe(1);

    // 15. Journal d'audit
    const actions = (await owner.insights.auditLogs()).map((a) => a.action);
    for (const a of ["obd.connect", "diagnostic.create", "diagnostic.conclude", "quote.create", "quote.accepted", "intervention.create", "intervention.status", "member.add"]) {
      expect(actions).toContain(a);
    }
  });
});
