import { and, desc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { dailyReports, opportunities, organizations, sources, syncRuns, tasks, userPreferences, users, watchAlerts } from "@/lib/db/schema";
import { alertCondition } from "@/lib/services/opportunities";
import { resolvePermissions } from "@/lib/auth/permissions";
import { CANDIDATABLE, CATEGORIES, DOMAINS, type Category, type OppDomain } from "./types";
import { connectorInfo } from "@/lib/connectors/registry";

export type ReportItem = {
  id: string;
  title: string;
  buyer: string | null;
  domain: string;
  category: string;
  score: number;
  deadlineAt: string | null;
  publishedAt: string | null;
  officialUrl: string | null;
  department: string | null;
  country: string | null;
  reason?: string;
};

export type DailyReportContent = {
  windowStart: string;
  windowEnd: string;
  status: "ok" | "degraded" | "failed";
  statusMessage: string;
  sources: { id: string; name: string; status: string; lastSuccessAt: string | null; error: string | null; runs: number }[];
  sections: { key: string; title: string; items: ReportItem[]; empty: string }[];
  alerts: { alertId: string; name: string; items: ReportItem[] }[];
  counts: Record<string, number>;
};

type Opp = typeof opportunities.$inferSelect;

const item = (o: Opp, reason?: string): ReportItem => ({
  id: o.id,
  title: o.title,
  buyer: o.buyerName,
  domain: o.domain,
  category: o.category,
  score: o.baseScore,
  deadlineAt: o.deadlineAt?.toISOString() ?? null,
  publishedAt: o.publishedAt,
  officialUrl: o.officialUrl,
  department: o.department,
  country: o.country,
  reason,
});

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Construit (ou reconstruit) le rapport du jour d'une organisation. Données réelles uniquement. */
export async function generateDailyReport(db: DB, orgId: string, now: Date = new Date()): Promise<typeof dailyReports.$inferSelect> {
  const [prev] = await db
    .select({ generatedAt: dailyReports.generatedAt, reportDate: dailyReports.reportDate })
    .from(dailyReports)
    .where(and(eq(dailyReports.orgId, orgId), ne(dailyReports.reportDate, day(now))))
    .orderBy(desc(dailyReports.reportDate))
    .limit(1);
  const start = prev?.generatedAt && now.getTime() - prev.generatedAt.getTime() < 8 * 86400000 ? prev.generatedAt : new Date(now.getTime() - 86400000);
  const real = eq(opportunities.isDemo, false);
  const created = and(real, gte(opportunities.createdAt, start), ne(opportunities.category, "IRRELEVANT"));
  const newOpps = await db.select().from(opportunities).where(created).orderBy(desc(opportunities.baseScore)).limit(500);
  const touched = await db
    .select()
    .from(opportunities)
    .where(and(real, gte(opportunities.updatedAt, start), inArray(opportunities.category, ["AWARDED", "CONTRACT_WATCH"])))
    .orderBy(desc(opportunities.updatedAt))
    .limit(100);
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const deadlines = await db
    .select()
    .from(opportunities)
    .where(and(real, inArray(opportunities.category, CANDIDATABLE), gte(opportunities.deadlineAt, now), lte(opportunities.deadlineAt, in7)))
    .orderBy(opportunities.deadlineAt)
    .limit(50);
  const top = await db
    .select()
    .from(opportunities)
    .where(and(real, inArray(opportunities.category, CANDIDATABLE), or(isNull(opportunities.deadlineAt), gte(opportunities.deadlineAt, now)), gte(opportunities.baseScore, 60)))
    .orderBy(desc(opportunities.baseScore))
    .limit(10);
  const watch = await db.select().from(opportunities).where(and(real, eq(opportunities.category, "CONTRACT_WATCH"))).orderBy(desc(opportunities.awardedAt)).limit(10);

  const isDom = (o: Opp, d: OppDomain) => o.domain === d || o.domain === "MIXTE";
  const candidatable = (o: Opp) => CANDIDATABLE.includes(o.category as Category);
  const needsReview = newOpps.filter(
    (o) => o.reliability !== "high" || (o.category === "ACTIVE" && !o.deadlineAt) || (o.domain === "MIXTE" && o.classification.levageScore < 3 && o.classification.electriciteScore < 3),
  );
  const reviewReason = (o: Opp) =>
    [
      o.reliability !== "high" ? "données partielles" : null,
      o.category === "ACTIVE" && !o.deadlineAt ? "date limite non publiée" : null,
      o.domain === "MIXTE" && o.classification.levageScore < 3 && o.classification.electriciteScore < 3 ? "domaine déduit (marché de contrôles)" : null,
    ]
      .filter(Boolean)
      .join(", ");

  // État des sources pendant la fenêtre
  const states = await db.select().from(sources).where(ne(sources.id, "demo"));
  const runs = await db.select().from(syncRuns).where(gte(syncRuns.startedAt, start));
  const srcSummary = states.map((s) => {
    const r = runs.filter((x) => x.sourceId === s.id);
    const ok = r.some((x) => x.status === "success" || x.status === "partial");
    const failed = r.filter((x) => x.status === "failed");
    return {
      id: s.id,
      name: connectorInfo(s.id)?.name ?? s.id,
      status: !s.enabled ? "désactivée" : r.length === 0 ? "aucune collecte" : ok ? (r.some((x) => x.status === "partial") ? "partielle" : "réussie") : "échec",
      lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
      error: failed[0]?.errors?.[0] ?? (r.length === 0 && s.enabled ? "Aucune collecte exécutée pendant la période" : null),
      runs: r.length,
    };
  });
  const enabled = srcSummary.filter((s) => s.status !== "désactivée");
  const succeeded = enabled.filter((s) => s.status === "réussie" || s.status === "partielle");
  const status: DailyReportContent["status"] = succeeded.length === 0 ? "failed" : succeeded.length < enabled.length || enabled.some((s) => s.status === "partielle") ? "degraded" : "ok";
  const statusMessage =
    status === "failed"
      ? "Aucune source n'a été collectée avec succès sur la période : ce rapport ne reflète PAS l'état du marché."
      : status === "degraded"
        ? `Veille incomplète : ${enabled.filter((s) => !(s.status === "réussie")).map((s) => `${s.name} (${s.status})`).join(", ")}.`
        : "Toutes les sources actives ont été collectées.";

  const sections: DailyReportContent["sections"] = [
    { key: "new_levage", title: "Nouvelles consultations levage", items: newOpps.filter((o) => isDom(o, "LEVAGE") && candidatable(o)).map((o) => item(o)), empty: "Aucune nouvelle consultation levage détectée." },
    { key: "new_elec", title: "Nouvelles consultations électricité", items: newOpps.filter((o) => isDom(o, "ELECTRICITE") && candidatable(o)).map((o) => item(o)), empty: "Aucune nouvelle consultation électricité détectée." },
    { key: "top", title: "Opportunités les plus pertinentes (ouvertes)", items: top.map((o) => item(o)), empty: "Aucune opportunité ouverte avec un score ≥ 60." },
    { key: "deadlines", title: "Échéances dans les 7 jours", items: deadlines.map((o) => item(o)), empty: "Aucune échéance proche." },
    { key: "awards", title: "Nouveaux avis d'attribution", items: touched.map((o) => item(o)), empty: "Aucun nouvel avis d'attribution." },
    { key: "watch", title: "Contrats à surveiller", items: watch.map((o) => item(o)), empty: "Aucun contrat à surveiller." },
    { key: "supplier", title: "Appels à fournisseurs", items: newOpps.filter((o) => o.category === "SUPPLIER_CALL").map((o) => item(o)), empty: "Aucun nouvel appel à fournisseurs." },
    { key: "signals", title: "Signaux commerciaux / projets", items: newOpps.filter((o) => o.category === "SIGNAL" || o.category === "INDIRECT").map((o) => item(o)), empty: "Aucun nouveau signal." },
    { key: "review", title: "À vérifier par un humain", items: needsReview.map((o) => item(o, reviewReason(o))), empty: "Rien à signaler." },
  ];

  const alertRows = await db.select().from(watchAlerts).where(and(eq(watchAlerts.orgId, orgId), eq(watchAlerts.active, true)));
  const alerts: DailyReportContent["alerts"] = [];
  for (const a of alertRows) {
    const matched = await db
      .select()
      .from(opportunities)
      .where(and(real, gte(opportunities.createdAt, a.lastCheckedAt ?? start), alertCondition(a)))
      .orderBy(desc(opportunities.baseScore))
      .limit(20);
    if (matched.length) alerts.push({ alertId: a.id, name: a.name, items: matched.map((o) => item(o)) });
    await db.update(watchAlerts).set({ lastCheckedAt: now }).where(eq(watchAlerts.id, a.id));
  }

  const content: DailyReportContent = {
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
    status,
    statusMessage,
    sources: srcSummary,
    sections,
    alerts,
    counts: Object.fromEntries(sections.map((s) => [s.key, s.items.length])),
  };
  const [row] = await db
    .insert(dailyReports)
    .values({ orgId, reportDate: day(now), status, content: content as unknown as Record<string, unknown>, generatedAt: now })
    .onConflictDoUpdate({
      target: [dailyReports.orgId, dailyReports.reportDate],
      set: { status, content: content as unknown as Record<string, unknown>, generatedAt: now, emailedAt: null, emailError: null },
    })
    .returning();
  return row;
}

export function reportText(content: DailyReportContent, link: (path: string) => string): { subject: string; text: string; html: string } {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const date = content.windowEnd.slice(0, 10);
  const subject =
    content.status === "failed"
      ? `[LEVAGE RADAR] ${date} — Veille NON effectuée : collecte en échec`
      : content.status === "degraded"
        ? `[LEVAGE RADAR] ${date} — Veille incomplète (${content.counts.new_levage ?? 0} levage, ${content.counts.new_elec ?? 0} électricité)`
        : `[LEVAGE RADAR] ${date} — ${content.counts.new_levage ?? 0} levage, ${content.counts.new_elec ?? 0} électricité`;
  const lines: string[] = [`Rapport de veille du ${date}`, "", content.statusMessage, ""];
  let html = `<h2>Rapport de veille du ${esc(date)}</h2><p><strong>${esc(content.statusMessage)}</strong></p>`;
  for (const s of content.sections) {
    lines.push(`== ${s.title} (${s.items.length}) ==`);
    html += `<h3>${esc(s.title)} (${s.items.length})</h3>`;
    if (!s.items.length) {
      lines.push(s.empty, "");
      html += `<p>${esc(s.empty)}</p>`;
      continue;
    }
    html += "<ul>";
    for (const i of s.items.slice(0, 15)) {
      const meta = [DOMAINS[i.domain as OppDomain], CATEGORIES[i.category as Category], i.buyer, i.deadlineAt ? `limite ${i.deadlineAt.slice(0, 10)}` : null, `score ${i.score}`, i.reason].filter(Boolean).join(" · ");
      lines.push(`- ${i.title}\n  ${meta}\n  Fiche : ${link(`/radar/${i.id}`)}${i.officialUrl ? `\n  Source : ${i.officialUrl}` : ""}`);
      html += `<li><a href="${esc(link(`/radar/${i.id}`))}">${esc(i.title)}</a><br><small>${esc(meta)}${i.officialUrl ? ` · <a href="${esc(i.officialUrl)}">source officielle</a>` : ""}</small></li>`;
    }
    html += "</ul>";
    if (s.items.length > 15) {
      lines.push(`… et ${s.items.length - 15} autres dans l'application.`);
      html += `<p>… et ${s.items.length - 15} autres dans l'application.</p>`;
    }
    lines.push("");
  }
  if (content.alerts.length) {
    lines.push("== Alertes de surveillance ==");
    html += "<h3>Alertes de surveillance</h3>";
    for (const a of content.alerts) {
      lines.push(`${a.name} : ${a.items.length} résultat(s)`);
      html += `<p><strong>${esc(a.name)}</strong> : ${a.items.length} résultat(s)</p><ul>`;
      for (const i of a.items.slice(0, 10)) {
        lines.push(`- ${i.title} — ${link(`/radar/${i.id}`)}`);
        html += `<li><a href="${esc(link(`/radar/${i.id}`))}">${esc(i.title)}</a></li>`;
      }
      html += "</ul>";
    }
  }
  lines.push("== Sources ==");
  html += "<h3>Sources</h3><ul>";
  for (const s of content.sources) {
    lines.push(`- ${s.name} : ${s.status}${s.error ? ` (${s.error})` : ""}`);
    html += `<li>${esc(s.name)} : ${esc(s.status)}${s.error ? ` — ${esc(s.error)}` : ""}</li>`;
  }
  html += "</ul>";
  lines.push("", `Rapport complet : ${link(`/reports/daily`)}`, "", "Les informations proviennent des sources indiquées ; vérifiez toujours l'avis officiel avant toute démarche.");
  html += `<p><a href="${esc(link("/reports/daily"))}">Ouvrir le rapport complet</a></p><p><small>Les informations proviennent des sources indiquées ; vérifiez toujours l'avis officiel avant toute démarche.</small></p>`;
  return { subject, text: lines.join("\n"), html };
}

/** Destinataires : utilisateurs actifs avec accès au radar, e-mail activé et fréquence compatible. */
export async function reportRecipients(db: DB, orgId: string, now: Date) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const rows = await db
    .select({ u: users, p: userPreferences })
    .from(users)
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(and(eq(users.orgId, orgId), eq(users.active, true)));
  return rows
    .filter(({ u, p }) => {
      if (!p?.emailEnabled) return false;
      if (!resolvePermissions(u.role, u.extraPermissions, org?.settings.rolePermissions).has("opps.read")) return false;
      if (p.digestFrequency === "off") return false;
      if (p.digestFrequency === "weekly" && now.getDay() !== 1) return false;
      return true;
    })
    .map(({ u }) => u);
}

/** Rappels de tâches arrivés à échéance (pour envoi). */
export async function dueReminders(db: DB, now: Date) {
  return db
    .select({ t: tasks, email: users.email, name: users.name })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(isNull(tasks.doneAt), isNull(tasks.reminderSentAt), lte(tasks.remindAt, now), eq(users.active, true)))
    .limit(500);
}

