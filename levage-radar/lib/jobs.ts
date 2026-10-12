import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { dailyReports, organizations, tasks } from "@/lib/db/schema";
import { runCollection, type CollectOptions, type SourceRunSummary } from "@/lib/radar/collect";
import { dueReminders, generateDailyReport, reportRecipients, reportText, type DailyReportContent } from "@/lib/radar/daily-report";
import { appUrl, isEmailConfigured, sendEmail } from "@/lib/email";
import { systemAudit } from "@/lib/audit";

export type DailyJobResult = {
  collection: SourceRunSummary[];
  reports: { orgId: string; status: string; emailed: number; emailErrors: string[] }[];
  reminders: { sent: number; skipped: number };
  emailConfigured: boolean;
};

/**
 * Tâche quotidienne : collecte → rapports → e-mails → rappels.
 * Déclenchée par le cron de l'hébergeur (/api/cron/daily), GitHub Actions ou `npm run collect -- --daily`.
 */
export async function runDailyJob(db: DB, opts: Partial<CollectOptions> & { trigger: CollectOptions["trigger"]; skipCollection?: boolean } ): Promise<DailyJobResult> {
  const now = opts.now ?? new Date();
  const collection = opts.skipCollection ? [] : await runCollection(db, { ...opts, now });
  const emailConfigured = isEmailConfigured();
  const reports: DailyJobResult["reports"] = [];
  for (const org of await db.select({ id: organizations.id }).from(organizations)) {
    const report = await generateDailyReport(db, org.id, now);
    const content = report.content as unknown as DailyReportContent;
    let emailed = 0;
    const emailErrors: string[] = [];
    if (emailConfigured) {
      const msg = reportText(content, (p) => appUrl(p));
      for (const u of await reportRecipients(db, org.id, now)) {
        try {
          await sendEmail({ to: u.email, ...msg });
          emailed++;
        } catch (e) {
          emailErrors.push(`${u.email} : ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      await db
        .update(dailyReports)
        .set({ emailedAt: emailed ? new Date() : null, emailError: emailErrors[0] ?? null })
        .where(eq(dailyReports.id, report.id));
    }
    reports.push({ orgId: org.id, status: report.status, emailed, emailErrors });
  }

  let sent = 0;
  let skipped = 0;
  for (const r of await dueReminders(db, now)) {
    if (!emailConfigured) {
      skipped++; // reste visible dans le tableau de bord ; non marqué comme envoyé
      continue;
    }
    try {
      await sendEmail({
        to: r.email,
        subject: `[LEVAGE RADAR] Rappel : ${r.t.title}`,
        text: `Bonjour ${r.name},\n\nRappel : ${r.t.title}${r.t.dueAt ? `\nÉchéance : ${r.t.dueAt.toISOString().slice(0, 10)}` : ""}\n\n${appUrl(r.t.opportunityId ? `/radar/${r.t.opportunityId}` : "/tasks")}`,
      });
      await db.update(tasks).set({ reminderSentAt: new Date() }).where(eq(tasks.id, r.t.id));
      sent++;
    } catch {
      skipped++;
    }
  }
  await systemAudit(db, "job", null, "daily_job", {
    trigger: opts.trigger,
    collection: collection.map((c) => ({ source: c.sourceId, status: c.status, fetched: c.fetched, error: c.error })),
    reports: reports.map((r) => ({ status: r.status, emailed: r.emailed })),
  });
  return { collection, reports, reminders: { sent, skipped }, emailConfigured };
}
