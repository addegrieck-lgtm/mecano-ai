import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { dbKind, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", database: dbKind() });
  } catch {
    return NextResponse.json({ status: "error", database: dbKind() }, { status: 503 });
  }
}
