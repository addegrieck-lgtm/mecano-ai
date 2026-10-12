import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { dbKind, getDb } from "@/lib/db";
import { databaseUrl } from "@/lib/db/url";

export const dynamic = "force-dynamic";

/** État de santé + diagnostic de configuration (sans exposer de secret). */
export async function GET() {
  const config = {
    database: dbKind(),
    databaseConfigured: !!databaseUrl(),
    cronSecretConfigured: (process.env.CRON_SECRET ?? "").length >= 16,
    setupTokenConfigured: !!process.env.SETUP_TOKEN,
  };
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    let migrated = true;
    try {
      await db.execute(sql`select 1 from users limit 1`);
    } catch {
      migrated = false;
    }
    return NextResponse.json({ status: migrated ? "ok" : "base sans tables : redéployez pour appliquer les migrations", ...config }, { status: migrated ? 200 : 503 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Message utile au diagnostic, débarrassé de toute chaîne de connexion éventuelle.
    return NextResponse.json({ status: "erreur", detail: msg.replace(/postgres(ql)?:\/\/\S+/gi, "[url masquée]").slice(0, 300), ...config }, { status: 503 });
  }
}
