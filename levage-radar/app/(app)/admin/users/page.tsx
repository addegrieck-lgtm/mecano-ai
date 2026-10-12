import { requireCtx } from "@/lib/auth/server";
import { listUsers } from "@/lib/services/users";
import { ALL_PERMISSIONS, ALL_ROLES, PERMISSIONS, ROLES, resolvePermissions, type Role } from "@/lib/auth/permissions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { createUserAction, matrixAction, resetLinkAction, updateUserAction } from "./actions";

export const metadata = { title: "Utilisateurs et droits" };

export default async function UsersPage() {
  const ctx = await requireCtx("users.manage");
  const list = await listUsers(ctx);
  const overrides = ctx.org.settings.rolePermissions;
  return (
    <>
      <PageHeader title="Utilisateurs et droits" subtitle="Les droits sont contrôlés côté serveur pour chaque page, action, export et fichier." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Comptes (${list.length})`} className="lg:col-span-2">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((u) => (
              <li key={u.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <strong>{u.name}</strong> <span className="text-slate-500">{u.email}</span>
                    <Badge tone="blue">{ROLES[u.role as Role] ?? u.role}</Badge>
                    {!u.active && <Badge tone="red">désactivé</Badge>}
                    <span className="text-xs text-slate-400">dernière connexion : {fmtDateTime(u.lastLoginAt)}</span>
                  </summary>
                  <ActionForm action={updateUserAction.bind(null, u.id)} className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                    <div className="flex flex-wrap items-center gap-3">
                      <select className="input !w-60" name="role" defaultValue={u.role} aria-label="Rôle">
                        {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
                      </select>
                      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> Compte actif</label>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer">Permissions supplémentaires individuelles</summary>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {ALL_PERMISSIONS.map((p) => <label key={p} className="inline-flex items-center gap-2"><input type="checkbox" name="extra" value={p} defaultChecked={u.extraPermissions.includes(p)} /> {PERMISSIONS[p]}</label>)}
                      </div>
                    </details>
                    <SubmitButton size="sm">Enregistrer</SubmitButton>
                  </ActionForm>
                  <ActionForm action={resetLinkAction.bind(null, u.id)} className="mt-2">
                    <SubmitButton size="sm" variant="ghost">Générer un lien de réinitialisation du mot de passe</SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Nouvel utilisateur">
          <ActionForm action={createUserAction} className="space-y-2" resetOnSuccess>
            <input className="input" name="name" required placeholder="Nom" aria-label="Nom" />
            <input className="input" name="email" type="email" required placeholder="E-mail" aria-label="E-mail" />
            <select className="input" name="role" aria-label="Rôle" defaultValue="READER">
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
            <SubmitButton size="sm">Créer le compte</SubmitButton>
            <p className="text-xs text-slate-500">L&apos;utilisateur définit lui-même son mot de passe via un lien d&apos;activation à usage unique.</p>
          </ActionForm>
        </Card>
      </div>
      <Card title="Matrice des rôles (configurable)" className="mt-6">
        <ActionForm action={matrixAction}>
          <div className="overflow-x-auto">
            <table className="table min-w-[900px] text-xs">
              <thead><tr><th>Permission</th>{ALL_ROLES.map((r) => <th key={r} className="text-center">{ROLES[r]}</th>)}</tr></thead>
              <tbody>
                {ALL_PERMISSIONS.map((p) => (
                  <tr key={p}>
                    <td>{PERMISSIONS[p]}</td>
                    {ALL_ROLES.map((r) => (
                      <td key={r} className="text-center">
                        <input type="checkbox" name={`perm:${r}`} value={p} defaultChecked={resolvePermissions(r, [], overrides).has(p)} disabled={r === "ADMIN"} aria-label={`${ROLES[r]} : ${PERMISSIONS[p]}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <SubmitButton size="sm" confirm="Appliquer cette matrice à tous les utilisateurs de l'organisation ?">Enregistrer la matrice</SubmitButton>
          </div>
        </ActionForm>
        <ActionForm action={matrixAction} className="mt-2">
          <input type="hidden" name="reset" value="true" />
          <SubmitButton size="sm" variant="ghost">Rétablir les valeurs par défaut</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-slate-500">L&apos;administrateur conserve toujours tous les droits. Les modifications s&apos;appliquent à la requête suivante de chaque utilisateur.</p>
      </Card>
    </>
  );
}
