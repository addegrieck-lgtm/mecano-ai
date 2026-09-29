import type { AccessContext } from "@/lib/permissions";
import type { TenantTable } from "@/types";
import type { DataStore, Filter, Row } from "./store";

export class NotFoundError extends Error {
  constructor(what = "Élément") {
    super(`${what} introuvable`);
    this.name = "NotFoundError";
  }
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

export const nowIso = () => new Date().toISOString();

type NewRow<T extends TenantTable> = Omit<Row<T>, "id" | "garage_id" | "created_at"> & { id?: string; created_at?: string };

/**
 * Accès aux données limité au garage courant (multi-tenant).
 * - Toute lecture est filtrée par garage_id.
 * - Un identifiant appartenant à un autre garage est traité comme inexistant (protection IDOR).
 * - Le garage_id ne peut jamais être fourni ou modifié par l'appelant.
 * En production, Row Level Security (supabase/migrations) applique la même règle côté base.
 */
export class TenantRepository {
  constructor(
    readonly store: DataStore,
    readonly ctx: AccessContext,
  ) {}

  get garageId() {
    return this.ctx.garageId;
  }

  async list<T extends TenantTable>(table: T, filter: Filter<T> = {}): Promise<Row<T>[]> {
    const rows = await this.store.list(table, { ...filter, garage_id: this.ctx.garageId } as Filter<T>);
    // double vérification (défense en profondeur si un store ignore le filtre)
    return rows.filter((r) => (r as { garage_id: string }).garage_id === this.ctx.garageId);
  }

  async find<T extends TenantTable>(table: T, id: string | null | undefined): Promise<Row<T> | null> {
    if (!id) return null;
    const row = await this.store.get(table, id);
    if (!row || (row as { garage_id: string }).garage_id !== this.ctx.garageId) return null;
    return row;
  }

  async require<T extends TenantTable>(table: T, id: string | null | undefined, what?: string): Promise<Row<T>> {
    const row = await this.find(table, id);
    if (!row) throw new NotFoundError(what);
    return row;
  }

  async insert<T extends TenantTable>(table: T, row: NewRow<T>): Promise<Row<T>> {
    const full = {
      ...row,
      id: row.id ?? uid(),
      created_at: row.created_at ?? nowIso(),
      garage_id: this.ctx.garageId,
    } as unknown as Row<T>;
    return this.store.insert(table, full);
  }

  async update<T extends TenantTable>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    await this.require(table, id);
    const safe = { ...patch } as Record<string, unknown>;
    delete safe.id;
    delete safe.garage_id;
    delete safe.created_at;
    return this.store.update(table, id, safe as Partial<Row<T>>);
  }

  async remove<T extends TenantTable>(table: T, id: string): Promise<void> {
    await this.require(table, id);
    await this.store.remove(table, id);
  }
}
