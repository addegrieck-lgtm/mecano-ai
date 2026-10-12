import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert } from "@/components/ui";
import { getDb } from "@/lib/db";
import { isInitialized } from "@/lib/services/users";
import { PASSWORD_MIN } from "@/lib/auth/core";
import { setupAction } from "../actions";

export const metadata = { title: "Installation" };

export default async function SetupPage() {
  if (await isInitialized(await getDb())) redirect("/login");
  const needsToken = !!process.env.SETUP_TOKEN;
  return (
    <>
      <h1 className="mb-2 text-lg font-semibold">Première installation</h1>
      <p className="mb-4 text-sm text-slate-500">Création de l&apos;organisation et du premier compte administrateur. Cette page n&apos;est accessible que tant qu&apos;aucun compte n&apos;existe.</p>
      {!needsToken && process.env.NODE_ENV === "production" && (
        <div className="mb-4"><Alert tone="amber">Conseil : définissez SETUP_TOKEN en production pour protéger cette étape.</Alert></div>
      )}
      <ActionForm action={setupAction} className="space-y-3">
        {needsToken && (
          <div>
            <label className="label" htmlFor="setupToken">Jeton d&apos;installation (SETUP_TOKEN)</label>
            <input className="input" id="setupToken" name="setupToken" type="password" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="orgName">Nom de l&apos;organisation / de l&apos;agence</label>
          <input className="input" id="orgName" name="orgName" required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="name">Votre nom</label>
          <input className="input" id="name" name="name" required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Mot de passe ({PASSWORD_MIN} caractères min.)</label>
          <input className="input" id="password" name="password" type="password" minLength={PASSWORD_MIN} required autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirmation</label>
          <input className="input" id="confirm" name="confirm" type="password" minLength={PASSWORD_MIN} required autoComplete="new-password" />
        </div>
        <SubmitButton className="w-full">Créer l&apos;organisation</SubmitButton>
      </ActionForm>
    </>
  );
}
