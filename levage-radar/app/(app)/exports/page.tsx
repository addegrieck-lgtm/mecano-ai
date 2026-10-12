import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireCtx } from "@/lib/auth/server";
import { exportsLog, users } from "@/lib/db/schema";
import { Card, Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Exports et documents" };

const KINDS: Record<string, string> = { opportunities_csv: "Liste d'opportunités (CSV)", opportunity_pdf: "Synthèse commerciale (PDF)", mission_pdf: "Brouillon de rapport (PDF)", mission_json: "Brouillon structuré (JSON)" };

export default async function ExportsPage() {
  const ctx = await requireCtx("opps.export", "reports.export");
  const all = ctx.perms.has("audit.read");
  const rows = await ctx.db
    .select({ e: exportsLog, user: users.name })
    .from(exportsLog)
    .leftJoin(users, eq(users.id, exportsLog.userId))
    .where(and(eq(exportsLog.orgId, ctx.org.id), all ? undefined : eq(exportsLog.userId, ctx.user.id)))
    .orderBy(desc(exportsLog.createdAt))
    .limit(200);
  return (
    <>
      <PageHeader title="Exports et documents" subtitle={`Journal des exports ${all ? "de l'organisation" : "que vous avez réalisés"}. Les fichiers sont régénérés à la demande à partir des données (et des droits) actuels.`} />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {ctx.perms.has("opps.export") && <Card title="Opportunités"><p className="text-sm">CSV compatible Excel avec choix des colonnes depuis <Link className="link" href="/radar">Opportunités</Link> ; synthèse PDF depuis chaque fiche.</p></Card>}
        {ctx.perms.has("reports.export") && <Card title="Rapports"><p className="text-sm">Brouillon PDF et JSON structuré depuis l&apos;onglet « Brouillon & export » de chaque dossier ; chaque export fige une version.</p></Card>}
        <Card title="Pièces jointes"><p className="text-sm">Photos et documents accessibles depuis les dossiers, selon vos droits.</p></Card>
      </div>
      {rows.length === 0 ? <Empty title="Aucun export." /> : (
        <Card>
          <table className="table text-sm">
            <thead><tr><th>Date</th><th>Type</th><th>Fichier</th><th>Utilisateur</th><th className="text-right">Lignes</th></tr></thead>
            <tbody>
              {rows.map(({ e, user }) => <tr key={e.id}><td className="text-xs">{fmtDateTime(e.createdAt)}</td><td>{KINDS[e.kind] ?? e.kind}</td><td className="font-mono text-xs">{e.filename}</td><td>{user}</td><td className="text-right">{e.rowCount ?? ""}</td></tr>)}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
