import { Alert, ButtonLink } from "@/components/ui";

export default function Forbidden() {
  return (
    <div className="max-w-xl space-y-4">
      <Alert tone="red" title="Accès refusé">Votre rôle ne donne pas accès à cette page. Contactez un administrateur si nécessaire.</Alert>
      <ButtonLink href="/">Retour à l&apos;accueil</ButtonLink>
    </div>
  );
}
