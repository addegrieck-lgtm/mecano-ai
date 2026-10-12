import { describe, expect, it } from "vitest";
import { applyLocal, enqueue, type ClientOp, type MissionView } from "@/lib/offline/queue";

const view = (): MissionView => ({ mission: { title: "T", data: {}, pendingFields: [] }, items: [], measurements: [], observations: [] });

describe("file d'opérations hors ligne", () => {
  it("fusionne les modifications successives en conservant la valeur de base d'origine", () => {
    let q: ClientOp[] = [];
    q = enqueue(q, { opId: "1", kind: "patchMission", changes: { title: { base: "T", value: "T1" } } });
    q = enqueue(q, { opId: "2", kind: "patchMission", changes: { title: { base: "T1", value: "T2" }, address: { base: null, value: "A" } } });
    expect(q).toHaveLength(1);
    expect((q[0] as Extract<ClientOp, { kind: "patchMission" }>).changes).toEqual({ title: { base: "T", value: "T2" }, address: { base: null, value: "A" } });
  });

  it("ne fusionne pas avec une opération déjà en cours d'envoi", () => {
    let q: ClientOp[] = [{ opId: "1", kind: "patchMission", changes: { title: { base: "T", value: "T1" } } }];
    q = enqueue(q, { opId: "2", kind: "patchMission", changes: { title: { base: "T1", value: "T2" } } }, new Set(["1"]));
    expect(q).toHaveLength(2);
  });

  it("fusionne par élément pour patchItem", () => {
    let q: ClientOp[] = [];
    q = enqueue(q, { opId: "1", kind: "patchItem", itemId: "a", changes: { "data.x": { base: null, value: 1 } } });
    q = enqueue(q, { opId: "2", kind: "patchItem", itemId: "b", changes: { "data.x": { base: null, value: 2 } } });
    expect(q).toHaveLength(2);
  });

  it("applique localement création, modification, relevé et observation", () => {
    let v = view();
    v = applyLocal(v, { opId: "1", kind: "createItem", itemId: "i1", itemType: "appareil", label: "Pont", data: { famille: "Pont roulant" } });
    v = applyLocal(v, { opId: "2", kind: "patchItem", itemId: "i1", changes: { "data.marque": { value: "X" }, label: { value: "Pont A" } } });
    v = applyLocal(v, { opId: "3", kind: "addMeasurement", id: "m1", itemId: "i1", measurementType: "charge_essai", value: "100", unit: "kg", measuredAt: "2026-10-12T10:00:00Z" });
    v = applyLocal(v, { opId: "4", kind: "upsertObservation", id: "o1", obsKind: "anomalie", description: "D" });
    v = applyLocal(v, { opId: "5", kind: "patchMission", changes: { "data.type_mission": { value: "VGP" }, checklist: { value: [true] } } });
    expect(v.items[0]).toMatchObject({ label: "Pont A", data: { famille: "Pont roulant", marque: "X" } });
    expect(v.measurements[0].value).toBe("100");
    expect(v.observations[0].kind).toBe("anomalie");
    expect(v.mission.data).toEqual({ type_mission: "VGP", _checklist: [true] });
    v = applyLocal(v, { opId: "6", kind: "deleteItem", itemId: "i1" });
    expect(v.items).toHaveLength(0);
  });
});
