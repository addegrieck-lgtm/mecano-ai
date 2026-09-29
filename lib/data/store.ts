import type { TableName, Tables } from "@/types";

export type Row<T extends TableName> = Tables[T];
export type Filter<T extends TableName> = Partial<Row<T>>;

/**
 * Abstraction de persistance. Implémentations :
 * - MemoryStore (tests)
 * - BrowserStore (mode DEMO, IndexedDB, local-first / hors ligne)
 * - SupabaseStore (production, RLS côté base)
 *
 * Le DataStore n'applique AUCUNE règle métier : l'isolation par garage et les permissions
 * sont appliquées par la couche Repository (lib/data/repository.ts) et, en production,
 * doublées par Row Level Security dans PostgreSQL.
 */
export interface DataStore {
  list<T extends TableName>(table: T, filter?: Filter<T>): Promise<Row<T>[]>;
  get<T extends TableName>(table: T, id: string): Promise<Row<T> | null>;
  insert<T extends TableName>(table: T, row: Row<T>): Promise<Row<T>>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
}

export type Snapshot = { [K in TableName]?: Row<K>[] };

function matches<T extends object>(row: T, filter?: Partial<T>): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([k, v]) => v === undefined || (row as Record<string, unknown>)[k] === v);
}

const clone = <T,>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export class MemoryStore implements DataStore {
  protected data: Snapshot;

  constructor(snapshot: Snapshot = {}) {
    this.data = clone(snapshot);
  }

  protected rows<T extends TableName>(table: T): Row<T>[] {
    if (!this.data[table]) (this.data as Record<string, unknown[]>)[table] = [];
    return this.data[table] as Row<T>[];
  }

  /** Hook appelé après chaque écriture (persistance). */
  protected async afterWrite(): Promise<void> {}

  async list<T extends TableName>(table: T, filter?: Filter<T>): Promise<Row<T>[]> {
    return clone(this.rows(table).filter((r) => matches(r, filter)));
  }

  async get<T extends TableName>(table: T, id: string): Promise<Row<T> | null> {
    const row = this.rows(table).find((r) => (r as { id: string }).id === id);
    return row ? clone(row) : null;
  }

  async insert<T extends TableName>(table: T, row: Row<T>): Promise<Row<T>> {
    const rows = this.rows(table);
    if (rows.some((r) => (r as { id: string }).id === (row as { id: string }).id)) {
      throw new Error(`Identifiant déjà utilisé dans ${table}`);
    }
    rows.push(clone(row));
    await this.afterWrite();
    return clone(row);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => (r as { id: string }).id === id);
    if (idx < 0) throw new Error(`Élément introuvable (${table})`);
    rows[idx] = { ...rows[idx], ...clone(patch), id } as Row<T>;
    await this.afterWrite();
    return clone(rows[idx]);
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => (r as { id: string }).id === id);
    if (idx >= 0) rows.splice(idx, 1);
    await this.afterWrite();
  }

  snapshot(): Snapshot {
    return clone(this.data);
  }
}
