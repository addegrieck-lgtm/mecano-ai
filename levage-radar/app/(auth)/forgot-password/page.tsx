import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { forgotAction } from "../actions";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="mb-2 text-lg font-semibold">Mot de passe oublié</h1>
      <p className="mb-4 text-sm text-slate-500">Indiquez votre adresse : si elle correspond à un compte, un lien à usage unique vous sera envoyé.</p>
      <ActionForm action={forgotAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Adresse e-mail</label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <SubmitButton className="w-full">Envoyer le lien</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm"><Link className="link" href="/login">Retour à la connexion</Link></p>
    </>
  );
}
