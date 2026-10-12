"use client";

/** Page d'erreur lisible (au lieu d'un écran blanc) avec les pistes de configuration les plus fréquentes. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold">Le service est momentanément indisponible</h1>
      <p className="mt-3 text-sm text-slate-600">
        Une erreur serveur s&apos;est produite. Si l&apos;application vient d&apos;être installée, vérifiez la configuration :
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>une base PostgreSQL est connectée (Vercel → Storage → Neon, ou variable DATABASE_URL) ;</li>
        <li>le projet a été redéployé après l&apos;ajout de la base ;</li>
        <li>l&apos;état est visible sur <a className="underline" href="/api/health">/api/health</a>.</li>
      </ul>
      {error.digest && <p className="mt-4 font-mono text-xs text-slate-400">Référence de l&apos;erreur : {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-6 rounded-md bg-blue-700 px-4 py-2 text-sm text-white">Réessayer</button>
    </main>
  );
}
