import { requireCtx } from "@/lib/auth/server";
import { getPrefs } from "@/lib/services/opportunities";
import { isEmailConfigured } from "@/lib/email";
import { llmStatus } from "@/lib/assistant/llm";
import { dbKind } from "@/lib/db";
import { demoEnabled } from "@/lib/demo";
import { DEPARTMENTS } from "@/lib/radar/geo";
import { Alert, Card, KV, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { OfflineDataPanel } from "@/components/app/offline-data";
import { orgSettingsAction, passwordAction, prefsAction } from "./actions";
import { setThemeAction } from "../shell-actions";
import { PASSWORD_MIN } from "@/lib/auth/core";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireCtx();
  const { welcome } = await searchParams;
  const prefs = await getPrefs(ctx);
  const s = ctx.org.settings;
  return (
    <>
      <PageHeader title="Paramètres" />
      {welcome && <div className="mb-4"><Alert tone="green" title="Organisation créée">Prochaines étapes : créer les comptes (Utilisateurs & droits), installer et faire valider les modèles de mission, lancer une première collecte (État des connecteurs).</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        {ctx.perms.has("opps.read") && (
          <Card title="Préférences de veille et notifications">
            <ActionForm action={prefsAction} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="homeDepartment">Mon département</label>
                  <select id="homeDepartment" name="homeDepartment" className="input" defaultValue={prefs.homeDepartment ?? ""}>
                    <option value="">—</option>
                    {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="radiusKm">Rayon (km)</label>
                  <input id="radiusKm" name="radiusKm" type="number" min={10} max={2000} className="input" defaultValue={prefs.radiusKm ?? ""} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="preferredDepartments">Départements suivis (séparés par des virgules)</label>
                <input id="preferredDepartments" name="preferredDepartments" className="input" defaultValue={prefs.preferredDepartments?.join(", ")} />
              </div>
              <fieldset className="flex gap-4 text-sm">
                <legend className="label">Domaines suivis</legend>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="domains" value="LEVAGE" defaultChecked={prefs.domains?.includes("LEVAGE")} /> Levage</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="domains" value="ELECTRICITE" defaultChecked={prefs.domains?.includes("ELECTRICITE")} /> Électricité</label>
              </fieldset>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="digestFrequency">Rapport par e-mail</label>
                  <select id="digestFrequency" name="digestFrequency" className="input" defaultValue={prefs.digestFrequency}>
                    <option value="daily">Quotidien</option>
                    <option value="weekly">Hebdomadaire (lundi)</option>
                    <option value="off">Désactivé</option>
                  </select>
                </div>
                <label className="mt-6 inline-flex items-center gap-2 text-sm"><input type="checkbox" name="emailEnabled" defaultChecked={prefs.emailEnabled} /> Recevoir les e-mails</label>
              </div>
              {!isEmailConfigured() && <p className="text-xs text-amber-700">La messagerie n&apos;est pas configurée sur ce serveur : aucun e-mail ne sera envoyé (rapports consultables dans l&apos;application).</p>}
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
          </Card>
        )}
        <Card title="Mon compte">
          <KV rows={[["Nom", ctx.user.name], ["E-mail", ctx.user.email], ["Organisation", ctx.org.name]]} />
          <ActionForm action={passwordAction} className="mt-4 space-y-2" resetOnSuccess>
            <input className="input" type="password" name="current" placeholder="Mot de passe actuel" autoComplete="current-password" required aria-label="Mot de passe actuel" />
            <input className="input" type="password" name="next" placeholder={`Nouveau mot de passe (${PASSWORD_MIN} car. min.)`} minLength={PASSWORD_MIN} autoComplete="new-password" required aria-label="Nouveau mot de passe" />
            <input className="input" type="password" name="confirm" placeholder="Confirmation" autoComplete="new-password" required aria-label="Confirmation" />
            <SubmitButton size="sm" variant="secondary">Changer le mot de passe</SubmitButton>
          </ActionForm>
          <form action={setThemeAction} className="mt-4 flex items-center gap-2 text-sm">
            <span className="label !mb-0">Thème</span>
            <button name="theme" value="light" className="rounded px-3 py-1 ring-1 ring-slate-300">Clair</button>
            <button name="theme" value="dark" className="rounded px-3 py-1 ring-1 ring-slate-300">Sombre</button>
          </form>
        </Card>
        <Card title="Données hors ligne sur cet appareil">
          <OfflineDataPanel />
        </Card>
        {ctx.perms.has("settings.manage") && (
          <Card title="Organisation">
            <ActionForm action={orgSettingsAction} className="space-y-3">
              <input className="input" name="name" defaultValue={ctx.org.name} aria-label="Nom de l'organisation" />
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="allowExternalAi" className="mt-1" defaultChecked={!!s.allowExternalAi} /> Autoriser l&apos;envoi de données PUBLIQUES d&apos;avis à un service d&apos;IA externe configuré (jamais les notes internes ni les rapports).</label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="allowBrowserDictation" className="mt-1" defaultChecked={!!s.allowBrowserDictation} /> Autoriser la dictée vocale du navigateur (l&apos;audio peut être traité par le service du fabricant du navigateur).</label>
              <div>
                <label className="label" htmlFor="auditDays">Conservation des journaux d&apos;audit (jours, vide = illimitée, min. 30)</label>
                <input id="auditDays" name="auditDays" type="number" min={30} max={3650} className="input" defaultValue={s.retentionDays?.audit ?? ""} />
              </div>
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <KV rows={[
                ["Base de données", dbKind() === "postgres" ? "PostgreSQL (DATABASE_URL)" : "PGlite locale (développement)"],
                ["Messagerie", isEmailConfigured() ? "configurée" : "non configurée"],
                ["IA", llmStatus(ctx).reason],
                ["Collecte planifiée", process.env.CRON_SECRET ? "point d'entrée sécurisé configuré" : "CRON_SECRET absent"],
                ["Données de démonstration", demoEnabled() ? "autorisées (espace séparé)" : "désactivées"],
              ]} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
