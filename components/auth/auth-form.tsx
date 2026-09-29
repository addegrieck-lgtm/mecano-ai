"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Field, TextInput } from "@/components/app/common";
import { Button, buttonVariants } from "@/components/ui/button";

type Kind = "login" | "signup" | "forgot" | "reset";

const TITLES: Record<Kind, string> = {
  login: "Connexion",
  signup: "Créer un compte",
  forgot: "Mot de passe oublié",
  reset: "Nouveau mot de passe",
};

export function AuthForm({ kind, demo }: { kind: Kind; demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (demo) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">{TITLES[kind]}</h1>
        <p className="text-sm text-muted-foreground">Le mode démonstration est actif (DEMO_MODE=true) : aucune authentification n&apos;est nécessaire. Choisissez un utilisateur fictif depuis le menu de compte.</p>
        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          Ouvrir MECANO AI
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const db = getSupabaseBrowserClient();
      if (kind === "login") {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
      } else if (kind === "signup") {
        if (password.length < 8) throw new Error("8 caractères minimum");
        const { error } = await db.auth.signUp({ email, password, options: { data: { first_name: first, name: last }, emailRedirectTo: `${location.origin}/dashboard` } });
        if (error) throw error;
        setMsg({ ok: true, text: "Compte créé. Vérifiez votre email pour confirmer l'inscription." });
      } else if (kind === "forgot") {
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
        if (error) throw error;
        setMsg({ ok: true, text: "Si un compte existe, un email de réinitialisation a été envoyé." });
      } else {
        if (password.length < 8) throw new Error("8 caractères minimum");
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        router.replace("/dashboard");
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{TITLES[kind]}</h1>
      {kind === "signup" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom">
            <TextInput value={first} onChange={(e) => setFirst(e.target.value)} required autoComplete="given-name" />
          </Field>
          <Field label="Nom">
            <TextInput value={last} onChange={(e) => setLast(e.target.value)} required autoComplete="family-name" />
          </Field>
        </div>
      )}
      {kind !== "reset" && (
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
      )}
      {kind !== "forgot" && (
        <Field label="Mot de passe">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={kind === "login" ? 1 : 8} autoComplete={kind === "login" ? "current-password" : "new-password"} />
        </Field>
      )}
      {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p>}
      <Button size="lg" type="submit" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} {kind === "login" ? "Se connecter" : kind === "signup" ? "Créer mon compte" : kind === "forgot" ? "Envoyer le lien" : "Enregistrer"}
      </Button>
      <div className="flex justify-between text-sm text-muted-foreground">
        {kind !== "login" && <Link href="/login">Connexion</Link>}
        {kind === "login" && <Link href="/signup">Créer un compte</Link>}
        {kind === "login" && <Link href="/forgot-password">Mot de passe oublié ?</Link>}
      </div>
    </form>
  );
}
