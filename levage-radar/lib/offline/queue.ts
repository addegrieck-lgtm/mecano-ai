/**
 * File d'opérations côté client (pure, testable) : fusion des modifications non envoyées
 * et application locale optimiste. Le serveur reste juge : il détecte les conflits champ par champ.
 */
export type Change = { base?: unknown; value: unknown };
export type ClientOp =
  | { opId: string; kind: "patchMission"; changes: Record<string, Change>; clientCreatedAt?: string }
  | { opId: string; kind: "createItem"; itemId: string; itemType: string; parentId?: string | null; label: string; data?: Record<string, unknown>; position?: number; clientCreatedAt?: string }
  | { opId: string; kind: "patchItem"; itemId: string; changes: Record<string, Change>; clientCreatedAt?: string }
  | { opId: string; kind: "deleteItem"; itemId: string; baseVersion?: number; clientCreatedAt?: string }
  | { opId: string; kind: "addMeasurement"; id: string; itemId?: string | null; measurementType: string; value: string | number; unit: string; measuredAt: string; instrument?: string; context?: string; clientCreatedAt?: string }
  | { opId: string; kind: "deleteMeasurement"; id: string; clientCreatedAt?: string }
  | ({ opId: string; kind: "upsertObservation"; id: string; baseUpdatedAt?: string | null; obsKind: "observation" | "anomalie"; description: string; clientCreatedAt?: string } & Record<string, unknown>)
  | { opId: string; kind: "deleteObservation"; id: string; clientCreatedAt?: string };

/**
 * Ajoute une opération en fusionnant avec une modification non encore envoyée de la même cible :
 * la valeur de base d'origine est conservée (c'est elle que le serveur compare).
 */
export function enqueue(queue: ClientOp[], op: ClientOp, inFlight: Set<string> = new Set()): ClientOp[] {
  if (op.kind === "patchMission" || op.kind === "patchItem") {
    const idx = queue.findIndex(
      (q) => !inFlight.has(q.opId) && q.kind === op.kind && (op.kind === "patchMission" || (q.kind === "patchItem" && q.itemId === (op as { itemId: string }).itemId)),
    );
    if (idx >= 0) {
      const prev = queue[idx] as Extract<ClientOp, { changes: Record<string, Change> }>;
      const changes = { ...prev.changes };
      for (const [k, c] of Object.entries(op.changes)) changes[k] = k in changes ? { ...changes[k], value: c.value } : c;
      const merged = { ...prev, changes } as ClientOp;
      return [...queue.slice(0, idx), merged, ...queue.slice(idx + 1)];
    }
  }
  if (op.kind === "upsertObservation") {
    const idx = queue.findIndex((q) => !inFlight.has(q.opId) && q.kind === "upsertObservation" && q.id === op.id);
    if (idx >= 0) {
      const prev = queue[idx] as Extract<ClientOp, { kind: "upsertObservation" }>;
      return [...queue.slice(0, idx), { ...op, opId: prev.opId, baseUpdatedAt: prev.baseUpdatedAt } as ClientOp, ...queue.slice(idx + 1)];
    }
  }
  return [...queue, op];
}

type Item = { id: string; parentId: string | null; itemType: string; label: string; position: number; data: Record<string, unknown>; pendingFields: string[]; remainingChecks: string | null; version: number };
type Measurement = { id: string; itemId: string | null; measurementType: string; label: string; value: string; unit: string; measuredAt: string; instrument: string | null; context: string | null; origin: string };
type Observation = Record<string, unknown> & { id: string; itemId: string | null; kind: string; description: string; updatedAt: string };

export type MissionView = {
  mission: Record<string, unknown> & { data: Record<string, unknown>; pendingFields: string[] };
  items: Item[];
  measurements: Measurement[];
  observations: Observation[];
  [k: string]: unknown;
};

/** Application optimiste d'une opération sur la vue locale (copie). */
export function applyLocal<T extends MissionView>(view: T, op: ClientOp, measurementLabel = (t: string) => t): T {
  const v = structuredClone(view);
  switch (op.kind) {
    case "patchMission":
      for (const [k, c] of Object.entries(op.changes)) {
        if (k.startsWith("data.")) v.mission.data[k.slice(5)] = c.value;
        else if (k === "checklist") v.mission.data._checklist = c.value;
        else v.mission[k] = c.value;
      }
      break;
    case "createItem":
      v.items.push({ id: op.itemId, parentId: op.parentId ?? null, itemType: op.itemType, label: op.label, position: op.position ?? v.items.length, data: op.data ?? {}, pendingFields: [], remainingChecks: null, version: 1 });
      break;
    case "patchItem": {
      const it = v.items.find((i) => i.id === op.itemId);
      if (it)
        for (const [k, c] of Object.entries(op.changes)) {
          if (k.startsWith("data.")) it.data[k.slice(5)] = c.value;
          else (it as Record<string, unknown>)[k] = c.value;
        }
      break;
    }
    case "deleteItem":
      v.items = v.items.filter((i) => i.id !== op.itemId);
      break;
    case "addMeasurement":
      v.measurements.push({ id: op.id, itemId: op.itemId ?? null, measurementType: op.measurementType, label: measurementLabel(op.measurementType), value: String(op.value), unit: op.unit, measuredAt: op.measuredAt, instrument: op.instrument ?? null, context: op.context ?? null, origin: "saisie" });
      break;
    case "deleteMeasurement":
      v.measurements = v.measurements.filter((m) => m.id !== op.id);
      break;
    case "upsertObservation": {
      const { opId: _o, kind: _k, baseUpdatedAt: _b, obsKind, clientCreatedAt: _c, ...rest } = op;
      void _o;
      void _k;
      void _b;
      void _c;
      const existing = v.observations.find((o) => o.id === op.id);
      if (existing) Object.assign(existing, rest, { kind: obsKind });
      else v.observations.push({ ...rest, id: op.id, kind: obsKind, itemId: (rest.itemId as string | null) ?? null, description: op.description, updatedAt: new Date().toISOString() });
      break;
    }
    case "deleteObservation":
      v.observations = v.observations.filter((o) => o.id !== op.id);
      break;
  }
  return v;
}
