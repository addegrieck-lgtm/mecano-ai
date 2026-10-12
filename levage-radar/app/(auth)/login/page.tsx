import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert } from "@/components/ui";
import { getDb } from "@/lib/db";
import { isInitialized } from "@/lib/services/users";
import { getCtx } from "@/lib/auth/server";
import { loginAction } from "../actions";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (!(await isInitialized(await getDb()))) redirect("/setup");
  if (await getCtx()) redirect("/");
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Connexion</h1>
      {sp.reset && <div className="mb-4"><Alert tone="green">Mot de passe mis à jour. Vous pouvez vous connecter.</Alert></div>}
      {sp.logout && <div className="mb-4"><Alert tone="blue">Vous êtes déconnecté.</Alert></div>}
      <ActionForm action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Adresse e-mail</label>
          <input className="input" id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="password">Mot de passe</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="w-full" pendingLabel="Connexion…">Se connecter</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        <Link className="link" href="/forgot-password">Mot de passe oublié ?</Link>
      </p>
    </>
  );
}
