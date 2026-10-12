import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/auth/core";
import { resetAction } from "../actions";

export const metadata = { title: "Nouveau mot de passe" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <Alert tone="red">Lien incomplet. <Link className="link" href="/forgot-password">Demander un nouveau lien</Link></Alert>;
  return (
    <>
      <h1 className="mb-2 text-lg font-semibold">Définir un mot de passe</h1>
      <p className="mb-4 text-sm text-slate-500">{PASSWORD_MIN} caractères minimum, avec au moins trois types de caractères.</p>
      <ActionForm action={resetAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">Nouveau mot de passe</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirmation</label>
          <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        </div>
        <SubmitButton className="w-full">Enregistrer</SubmitButton>
      </ActionForm>
    </>
  );
}
