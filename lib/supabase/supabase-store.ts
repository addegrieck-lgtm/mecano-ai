import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataStore, Filter, Row } from "@/lib/data/store";
import type { TableName } from "@/types";

/**
 * DataStore adossé à Supabase (PostgreSQL). Les noms de colonnes sont identiques aux types TS.
 * L'isolation multi-garage est garantie par Row Level Security (supabase/migrations/0002_rls.sql),
 * en plus du filtrage applicatif du TenantRepository.
 */
export class SupabaseStore implements DataStore {
  constructor(private readonly db: SupabaseClient) {}

  private fail(table: string, error: { message: string } | null): never {
    throw new Error(`[${table}] ${error?.message ?? "erreur inconnue"}`);
  }

  async list<T extends TableName>(table: T, filter?: Filter<T>): Promise<Row<T>[]> {
    let q = this.db.from(table).select("*");
    for (const [k, v] of Object.entries(filter ?? {})) {
      if (v === undefined) continue;
      q = v === null ? q.is(k, null) : q.eq(k, v as string | number | boolean);
    }
    const { data, error } = await q.limit(5000);
    if (error) this.fail(table, error);
    return (data ?? []) as Row<T>[];
  }

  async get<T extends TableName>(table: T, id: string): Promise<Row<T> | null> {
    const { data, error } = await this.db.from(table).select("*").eq("id", id).maybeSingle();
    if (error) this.fail(table, error);
    return (data as Row<T>) ?? null;
  }

  async insert<T extends TableName>(table: T, row: Row<T>): Promise<Row<T>> {
    const { data, error } = await this.db.from(table).insert(row as never).select("*").single();
    if (error) this.fail(table, error);
    return data as Row<T>;
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    const { data, error } = await this.db.from(table).update(patch as never).eq("id", id).select("*").single();
    if (error) this.fail(table, error);
    return data as Row<T>;
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    const { error } = await this.db.from(table).delete().eq("id", id);
    if (error) this.fail(table, error);
  }
}
