import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { createTemplate, createTemplateVersion, ensureExampleTemplates, listTemplates, validateTemplateVersion } from "@/lib/services/templates";
import { createClient, createSite } from "@/lib/services/clients";
import { applyOps, createMission, getMissionFull, listMissions, missionHistory, setMissionStatus } from "@/lib/services/missions";
import { deleteAttachment, readAttachment, sniffMime, uploadAttachment } from "@/lib/services/attachments";
import { buildDraft, exportMissionJson, exportMissionPdf } from "@/lib/services/mission-export";
import { LEVAGE_EXAMPLE } from "@/lib/reports/default-templates";
import { createOrgWithUsers, createTestDb } from "./helpers";

let db: DB;
let close: () => Promise<void>;
let ctx: Record<string, Ctx>;
let liftTpl: string;
let elecTpl: string;
let clientId: string;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const op = <T extends object>(o: T) => ({ opId: randomUUID(), ...o });

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const o = await createOrgWithUsers(db);
  ctx = o.ctx;
  await ensureExampleTemplates(ctx.TECH_MANAGER);
  const tpls = await listTemplates(ctx.TECH_MANAGER);
  liftTpl = tpls.find((t) => t.domain === "LEVAGE")!.versions[0].id;
  elecTpl = tpls.find((t) => t.domain === "ELECTRICITE")!.versions[0].id;
  clientId = (await createClient(ctx.INSPECTOR_LIFT, { name: "Client fictif" })).id;
});
afterEach(async () => close());

async function validated() {
  await validateTemplateVersion(ctx.TECH_MANAGER, liftTpl);
  await validateTemplateVersion(ctx.TECH_MANAGER, elecTpl);
}

async function liftMission(c = ctx.INSPECTOR_LIFT) {
  await validated();
  return createMission(c, { domain: "LEVAGE", templateVersionId: liftTpl, title: "VGP atelier", clientId, scheduledAt: "2026-10-12T08:00" });
}

describe("modèles", () => {
  it("les exemples sont des brouillons : mission impossible avant validation par un responsable", async () => {
    await expect(createMission(ctx.INSPECTOR_LIFT, { domain: "LEVAGE", templateVersionId: liftTpl, title: "Mission X" })).rejects.toThrow(/VALIDÉE/);
    await expect(validateTemplateVersion(ctx.INSPECTOR_LIFT, liftTpl)).rejects.toThrow(/Accès refusé/);
    await validateTemplateVersion(ctx.TECH_MANAGER, liftTpl);
    const m = await createMission(ctx.INSPECTOR_LIFT, { domain: "LEVAGE", templateVersionId: liftTpl, title: "Mission X" });
    expect(m.status).toBe("BROUILLON");
  });

  it("un modèle levage ne peut pas servir une mission électricité", async () => {
    await validated();
    await expect(createMission(ctx.TECH_MANAGER, { domain: "ELECTRICITE", templateVersionId: liftTpl, title: "Mission X" })).rejects.toThrow(/Modèle inconnu/);
  });

  it("définition invalide refusée ; nouvelle version en brouillon, ancienne retirée à la validation", async () => {
    await expect(createTemplate(ctx.TECH_MANAGER, { domain: "LEVAGE", name: "Mauvais", definition: { domain: "LEVAGE", headerFields: [], itemTypes: [] } })).rejects.toThrow(/invalide/);
    await expect(
      createTemplate(ctx.TECH_MANAGER, { domain: "LEVAGE", name: "Doublon", definition: { ...LEVAGE_EXAMPLE, headerFields: [LEVAGE_EXAMPLE.headerFields[0], LEVAGE_EXAMPLE.headerFields[0]] } }),
    ).rejects.toThrow(/double/);
    await validateTemplateVersion(ctx.TECH_MANAGER, liftTpl);
    const tpl = (await listTemplates(ctx.TECH_MANAGER, "LEVAGE"))[0];
    const v2 = await createTemplateVersion(ctx.TECH_MANAGER, tpl.id, { ...LEVAGE_EXAMPLE, checklist: ["Nouveau point"] }, "Ajout checklist");
    expect(v2.version).toBe(2);
    await validateTemplateVersion(ctx.TECH_MANAGER, v2.id);
    const after = (await listTemplates(ctx.TECH_MANAGER, "LEVAGE"))[0];
    expect(after.versions.find((v) => v.version === 1)!.status).toBe("retired");
    expect(after.latestValidated!.version).toBe(2);
  });
});

describe("missions levage", () => {
  it("création, plusieurs équipements, champs adaptés, observations, relevé, photo, brouillon", async () => {
    const m = await liftMission();
    const pont = randomUUID();
    const palan = randomUUID();
    const r = await applyOps(ctx.INSPECTOR_LIFT, m.id, [
      op({ kind: "patchMission", changes: { "data.type_mission": { base: null, value: "Vérification générale périodique" } } }),
      op({ kind: "createItem", itemId: pont, itemType: "appareil", label: "Pont roulant hall A", data: { famille: "Pont roulant", designation: "Pont roulant hall A", capacite_nominale: "5000" } }),
      op({ kind: "createItem", itemId: palan, itemType: "appareil", label: "Palan 2", data: { famille: "Palan", designation: "Palan 2" } }),
      op({ kind: "createItem", itemId: randomUUID(), itemType: "accessoire", label: "Élingue E1", data: { type_accessoire: "Élingue chaîne", identification: "E1" } }),
      op({ kind: "upsertObservation", id: randomUUID(), itemId: pont, obsKind: "anomalie", description: "Fin de course haut à contrôler", internalPriority: "p2", needsVerification: true }),
      op({ kind: "addMeasurement", id: randomUUID(), itemId: pont, measurementType: "charge_essai", value: "5500", unit: "kg", measuredAt: new Date().toISOString() }),
    ]);
    expect(r.results.map((x) => x.status)).toEqual(["applied", "applied", "applied", "applied", "applied", "applied"]);
    await uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "photo", itemId: pont, filename: "plaque.jpg" }, JPEG);
    const full = await getMissionFull(ctx.INSPECTOR_LIFT, m.id);
    expect(full.items).toHaveLength(3);
    expect(full.items.find((i) => i.id === pont)!.data.capacite_nominale).toBe(5000);
    expect(full.mission.status).toBe("EN_SAISIE");
    // Manques : photo de plaque du palan, observation à vérifier, checklist
    const msgs = full.missing.map((x) => x.message).join(" | ");
    expect(msgs).toMatch(/Palan 2 — pièce attendue/);
    expect(msgs).toMatch(/Observation à vérifier/);
    const draft = await buildDraft(ctx.INSPECTOR_LIFT, m.id);
    expect(draft.notice).toMatch(/ne constitue ni un rapport officiel/);
    expect(draft.items.find((i) => i.id === pont)!.measurements[0].value).toBe("5500");
    // Aucune notion de conformité n'est produite automatiquement
    expect(JSON.stringify(draft)).not.toMatch(/conforme"|non conforme|compliant/i);
  });

  it("valide les valeurs selon le modèle (liste fermée, nombre, unité, type de relevé)", async () => {
    const m = await liftMission();
    const it = randomUUID();
    const r = await applyOps(ctx.INSPECTOR_LIFT, m.id, [
      op({ kind: "createItem", itemId: randomUUID(), itemType: "appareil", label: "X", data: { famille: "Fusée" } }),
      op({ kind: "createItem", itemId: it, itemType: "appareil", label: "Y", data: { famille: "Palan", capacite_nominale: "abc" } }),
      op({ kind: "createItem", itemId: randomUUID(), itemType: "inconnu", label: "Z" }),
      op({ kind: "patchMission", changes: { "data.champ_absent": { value: "x" } } }),
      op({ kind: "addMeasurement", id: randomUUID(), measurementType: "charge_essai", value: "10", unit: "litres", measuredAt: new Date().toISOString() }),
      op({ kind: "addMeasurement", id: randomUUID(), measurementType: "isolement", value: "10", unit: "MΩ", measuredAt: new Date().toISOString() }),
      { opId: randomUUID(), kind: "piratage" },
    ]);
    expect(r.results.every((x) => x.status === "rejected")).toBe(true);
  });

  it("champ laissé en attente et passage de statut contrôlé", async () => {
    const m = await liftMission();
    const it = randomUUID();
    await applyOps(ctx.INSPECTOR_LIFT, m.id, [
      op({ kind: "createItem", itemId: it, itemType: "appareil", label: "Potence", data: { famille: "Potence" } }),
      op({ kind: "patchItem", itemId: it, changes: { pendingFields: { value: ["designation"] } } }),
    ]);
    let full = await getMissionFull(ctx.INSPECTOR_LIFT, m.id);
    expect(full.missing.some((x) => x.message.includes("Désignation : laissé en attente"))).toBe(true);
    await expect(setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "PRET_RELECTURE")).rejects.toThrow(/manquantes/);
    await applyOps(ctx.INSPECTOR_LIFT, m.id, [
      op({ kind: "patchMission", changes: { "data.type_mission": { value: "Vérification générale périodique" } } }),
      op({ kind: "patchItem", itemId: it, changes: { "data.designation": { value: "Potence quai" }, pendingFields: { value: [] } } }),
    ]);
    await uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "photo", itemId: it, filename: "p.jpg" }, JPEG);
    await setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "PRET_RELECTURE");
    await expect(setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "PRET_OUTIL_OFFICIEL", { confirmManual: true })).rejects.toThrow(/checklist/);
    await applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "patchMission", changes: { checklist: { value: [true, true, true] } } })]);
    await expect(setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "PRET_OUTIL_OFFICIEL")).rejects.toThrow(/Confirmez/);
    const done = await setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "PRET_OUTIL_OFFICIEL", { confirmManual: true });
    expect(done.status).toBe("PRET_OUTIL_OFFICIEL");
    full = await getMissionFull(ctx.INSPECTOR_LIFT, m.id);
    expect(full.missing.filter((x) => x.level === "bloquant")).toHaveLength(0);
  });

  it("archivage : lecture seule", async () => {
    const m = await liftMission();
    await setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "ARCHIVE");
    await expect(applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "patchMission", changes: { title: { value: "Nouveau" } } })])).rejects.toThrow(/archivé/);
    await expect(setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "EN_SAISIE")).rejects.toThrow(/responsable/);
    await setMissionStatus(ctx.TECH_MANAGER, m.id, "EN_SAISIE");
  });

  it("exports PDF et JSON : version enregistrée, permissions", async () => {
    const m = await liftMission();
    await applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "createItem", itemId: randomUUID(), itemType: "appareil", label: "Grue", data: { famille: "Grue mobile", designation: "Grue" } })]);
    const pdf = await exportMissionPdf(ctx.INSPECTOR_LIFT, m.id, { includeHistory: true });
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const json = JSON.parse((await exportMissionJson(ctx.INSPECTOR_LIFT, m.id)).json);
    expect(json.format).toBe("levage-radar/brouillon-rapport");
    const full = await getMissionFull(ctx.INSPECTOR_LIFT, m.id);
    expect(full.snapshots.length).toBe(2);
    await expect(exportMissionPdf(ctx.READER, m.id)).rejects.toThrow(/Accès refusé/);
  });
});

describe("permissions et isolement des dossiers", () => {
  it("un inspecteur ne voit pas les dossiers d'un autre inspecteur ni l'autre domaine ; le lecteur lit sans modifier", async () => {
    const m = await liftMission(ctx.TECH_MANAGER); // inspecteur = responsable
    await expect(getMissionFull(ctx.INSPECTOR_LIFT, m.id)).rejects.toThrow(/introuvable/);
    await expect(getMissionFull(ctx.INSPECTOR_ELEC, m.id)).rejects.toThrow(/introuvable/);
    expect((await listMissions(ctx.INSPECTOR_LIFT, "LEVAGE")).length).toBe(0);
    await expect(listMissions(ctx.INSPECTOR_LIFT, "ELECTRICITE")).rejects.toThrow(/Accès refusé/);
    const asReader = await getMissionFull(ctx.READER, m.id);
    expect(asReader.canEdit).toBe(false);
    await expect(applyOps(ctx.READER, m.id, [op({ kind: "patchMission", changes: { title: { value: "pirate" } } })])).rejects.toThrow(/modifier/);
    await expect(createMission(ctx.BUSINESS, { domain: "LEVAGE", templateVersionId: liftTpl, title: "Mission X" })).rejects.toThrow(/Accès refusé/);
  });

  it("une autre organisation ne peut accéder ni au dossier ni aux pièces jointes", async () => {
    const m = await liftMission();
    const att = await uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "photo", filename: "a.jpg" }, JPEG);
    const other = await createOrgWithUsers(db, "Autre");
    await expect(getMissionFull(other.ctx.ADMIN, m.id)).rejects.toThrow(/introuvable/);
    await expect(readAttachment(other.ctx.ADMIN, att.id)).rejects.toThrow(/introuvable/);
    await expect(applyOps(other.ctx.ADMIN, m.id, [op({ kind: "patchMission", changes: { title: { value: "x" } } })])).rejects.toThrow(/introuvable/);
    expect((await readAttachment(ctx.INSPECTOR_LIFT, att.id)).bytes.length).toBe(JPEG.length);
  });

  it("pièces jointes : type réel vérifié, taille, suppression", async () => {
    const m = await liftMission();
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    await expect(uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "photo", filename: "photo.jpg" }, html)).rejects.toThrow(/non autorisé/);
    const pdf = new TextEncoder().encode("%PDF-1.4 test");
    await expect(uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "photo", filename: "x.pdf" }, pdf)).rejects.toThrow(/image/);
    const doc = await uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "document", filename: "../../etc/passwd.pdf" }, pdf);
    expect(doc.filename).not.toContain("/");
    expect(sniffMime(new Uint8Array(20))).toBeNull();
    const big = new Uint8Array(9 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    await expect(uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "photo", filename: "big.jpg" }, big)).rejects.toThrow(/volumineux/);
    await deleteAttachment(ctx.INSPECTOR_LIFT, doc.id);
    await expect(readAttachment(ctx.INSPECTOR_LIFT, doc.id)).rejects.toThrow(/introuvable/);
  });
});

describe("synchronisation et conflits (hors ligne)", () => {
  it("idempotence : une opération rejouée n'est appliquée qu'une fois", async () => {
    const m = await liftMission();
    const o = op({ kind: "createItem", itemId: randomUUID(), itemType: "appareil", label: "A", data: { famille: "Palan" } });
    expect((await applyOps(ctx.INSPECTOR_LIFT, m.id, [o])).results[0].status).toBe("applied");
    expect((await applyOps(ctx.INSPECTOR_LIFT, m.id, [o])).results[0].status).toBe("duplicate");
    expect((await getMissionFull(ctx.INSPECTOR_LIFT, m.id)).items).toHaveLength(1);
  });

  it("jamais d'écrasement silencieux : modification concurrente du même champ = conflit", async () => {
    const m = await liftMission();
    // Appareil A (hors ligne) et appareil B partent de la même valeur
    await applyOps(ctx.TECH_MANAGER, m.id, [op({ kind: "patchMission", changes: { generalNotes: { base: null, value: "Version bureau" } } })]);
    const r = await applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "patchMission", changes: { generalNotes: { base: null, value: "Version terrain" }, internalRef: { base: null, value: "REF-1" } } })]);
    expect(r.results[0].status).toBe("conflict");
    expect(r.results[0].conflicts![0]).toMatchObject({ key: "generalNotes", server: "Version bureau", mine: "Version terrain" });
    const full = await getMissionFull(ctx.INSPECTOR_LIFT, m.id);
    expect(full.mission.generalNotes).toBe("Version bureau"); // la version la plus récente n'est pas écrasée
    expect(full.mission.internalRef).toBe("REF-1"); // le champ non conflictuel est appliqué
    // Résolution explicite : l'utilisateur choisit sa version en prenant la valeur serveur comme base
    const res = await applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "patchMission", changes: { generalNotes: { base: "Version bureau", value: "Version terrain" } } })]);
    expect(res.results[0].status).toBe("applied");
  });

  it("champs différents modifiés en parallèle : pas de conflit", async () => {
    const m = await liftMission();
    const it = randomUUID();
    await applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "createItem", itemId: it, itemType: "appareil", label: "A", data: { famille: "Palan" } })]);
    await applyOps(ctx.TECH_MANAGER, m.id, [op({ kind: "patchItem", itemId: it, changes: { "data.marque": { base: null, value: "Marque X" } } })]);
    const r = await applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "patchItem", itemId: it, changes: { "data.modele": { base: null, value: "M1" } } })]);
    expect(r.results[0].status).toBe("applied");
    const item = (await getMissionFull(ctx.INSPECTOR_LIFT, m.id)).items[0];
    expect(item.data).toMatchObject({ marque: "Marque X", modele: "M1" });
  });

  it("suppression d'un élément modifié ailleurs : conflit ; observation modifiée ailleurs : conflit", async () => {
    const m = await liftMission();
    const it = randomUUID();
    const ob = randomUUID();
    await applyOps(ctx.INSPECTOR_LIFT, m.id, [
      op({ kind: "createItem", itemId: it, itemType: "appareil", label: "A", data: { famille: "Palan" } }),
      op({ kind: "upsertObservation", id: ob, obsKind: "observation", description: "Initiale" }),
    ]);
    const full = await getMissionFull(ctx.INSPECTOR_LIFT, m.id);
    const baseObs = full.observations[0].updatedAt.toISOString();
    await applyOps(ctx.TECH_MANAGER, m.id, [
      op({ kind: "patchItem", itemId: it, changes: { label: { value: "A renommé" } } }),
      op({ kind: "upsertObservation", id: ob, obsKind: "observation", description: "Modifiée au bureau", baseUpdatedAt: baseObs }),
    ]);
    const r = await applyOps(ctx.INSPECTOR_LIFT, m.id, [
      op({ kind: "deleteItem", itemId: it, baseVersion: 1 }),
      op({ kind: "upsertObservation", id: ob, obsKind: "observation", description: "Modifiée sur le terrain", baseUpdatedAt: baseObs }),
    ]);
    expect(r.results.map((x) => x.status)).toEqual(["conflict", "conflict"]);
    const after = await getMissionFull(ctx.INSPECTOR_LIFT, m.id);
    expect(after.items).toHaveLength(1);
    expect(after.observations[0].description).toBe("Modifiée au bureau");
  });

  it("historique : création, modifications de champ, pièces jointes, statut", async () => {
    const m = await liftMission();
    await applyOps(ctx.INSPECTOR_LIFT, m.id, [op({ kind: "patchMission", changes: { title: { value: "VGP atelier nord" } } })]);
    const a = await uploadAttachment(ctx.INSPECTOR_LIFT, m.id, { id: randomUUID(), kind: "photo", filename: "a.jpg" }, JPEG);
    await deleteAttachment(ctx.INSPECTOR_LIFT, a.id);
    await setMissionStatus(ctx.INSPECTOR_LIFT, m.id, "A_COMPLETER");
    const h = (await missionHistory(ctx.INSPECTOR_LIFT, m.id)).map((x) => x.action);
    expect(h).toEqual(expect.arrayContaining(["create", "edit", "attachment_add", "attachment_delete", "status_change"]));
  });
});

describe("missions électricité", () => {
  it("modèle adapté, hiérarchie tableau → circuit, relevés réels avec unité et date, champs conditionnels", async () => {
    await validated();
    const site = await createSite(ctx.INSPECTOR_ELEC, { clientId, name: "Siège", city: "Lyon" });
    const m = await createMission(ctx.INSPECTOR_ELEC, { domain: "ELECTRICITE", templateVersionId: elecTpl, title: "Vérif. siège", clientId, siteId: site.id, scheduledAt: "2026-10-12T09:00" });
    expect(m.address).toBe("Lyon");
    const tab = randomUUID();
    const circ = randomUUID();
    const r = await applyOps(ctx.INSPECTOR_ELEC, m.id, [
      op({ kind: "patchMission", changes: { "data.type_mission": { value: "Autre (préciser)" }, "data.nature_site": { value: "Tertiaire" } } }),
      op({ kind: "createItem", itemId: tab, itemType: "tableau", label: "TGBT", data: { repere: "TGBT", type_tableau: "TGBT" } }),
      op({ kind: "createItem", itemId: circ, itemType: "circuit", parentId: tab, label: "C1", data: { repere: "C1", calibre: 16 } }),
      op({ kind: "createItem", itemId: randomUUID(), itemType: "circuit", label: "Orphelin", data: { repere: "C2" } }),
      op({ kind: "addMeasurement", id: randomUUID(), itemId: circ, measurementType: "isolement", value: "250", unit: "MΩ", measuredAt: new Date().toISOString(), instrument: "Contrôleur n°12" }),
      op({ kind: "addMeasurement", id: randomUUID(), itemId: tab, measurementType: "impedance_boucle", value: "0.5", unit: "Ω", measuredAt: new Date().toISOString() }),
    ]);
    expect(r.results.map((x) => x.status)).toEqual(["applied", "applied", "applied", "rejected", "applied", "rejected"]);
    const full = await getMissionFull(ctx.INSPECTOR_ELEC, m.id);
    expect(full.measurements[0]).toMatchObject({ value: "250", unit: "MΩ", origin: "saisie" });
    // Champ conditionnel « préciser » devenu obligatoire
    expect(full.missing.some((x) => x.message.includes("Préciser le type de mission"))).toBe(true);
    // Les inspecteurs levage n'ont pas accès au module électricité
    await expect(getMissionFull(ctx.INSPECTOR_LIFT, m.id)).rejects.toThrow(/introuvable/);
    const draft = await buildDraft(ctx.INSPECTOR_ELEC, m.id);
    expect(draft.items.find((i) => i.id === circ)!.parentId).toBe(tab);
  });
});
