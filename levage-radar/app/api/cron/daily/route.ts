import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { runDailyJob } from "@/lib/jobs";
import { applyRetention } from "@/lib/services/users";

// Collecte potentiellement longue : durée maximale demandée à l'hébergeur (plafonnée selon l'offre).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Tâche quotidienne : appelée par le cron de l'hébergeur (Vercel Cron, GitHub Actions, crontab…). */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Non autorisé (CRON_SECRET)." }, { status: 401 });
  const db = await getDb();
  const result = await runDailyJob(db, { trigger: "cron", log: (m) => console.log("[cron]", m) });
  const purged = await applyRetention(db);
  const failed = result.collection.filter((c) => c.status === "failed");
  return NextResponse.json({ ...result, purgedAuditEvents: purged }, { status: failed.length && failed.length === result.collection.length ? 502 : 200 });
}

export const GET = handle;
export const POST = handle;
