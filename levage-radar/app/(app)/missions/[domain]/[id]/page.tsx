import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";
import { DOMAIN_SLUGS } from "@/lib/reports/domain";
import { loadMission } from "@/lib/services/missions";
import { AppError } from "@/lib/errors";
import { PageHeader } from "@/components/ui";
import { MissionEditor } from "@/components/missions/editor";

/**
 * Coque de l'éditeur : volontairement sans données métier dans le HTML (mis en cache pour le hors ligne).
 * Les données sont chargées par l'éditeur via l'API, puis gardées chiffrées sur l'appareil.
 */
export default async function MissionPage({ params }: { params: Promise<{ domain: string; id: string }> }) {
  const { domain: slug, id } = await params;
  const domain = DOMAIN_SLUGS[slug];
  if (!domain) notFound();
  const ctx = await requireCtx();
  try {
    const m = await loadMission(ctx, id);
    if (m.domain !== domain) notFound();
  } catch (e) {
    // Hors connexion la page servie vient du cache ; en ligne, un dossier inaccessible renvoie 404.
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <>
      <PageHeader back={{ href: `/missions/${slug}`, label: "Dossiers" }} title={domain === "LEVAGE" ? "Fiche de mission levage" : "Fiche de mission électricité"} subtitle="Saisie terrain — sauvegarde automatique, fonctionnement hors connexion." />
      <MissionEditor missionId={id} userId={ctx.user.id} listHref={`/missions/${slug}`} />
    </>
  );
}
