import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4 py-10 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-ink dark:text-white">
            <Logo /> LEVAGE RADAR
          </div>
          <p className="mt-1 text-xs text-slate-500">Veille commerciale & préparation des rapports — levage et électricité</p>
        </div>
        <div className="card p-6">{children}</div>
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          Outil interne de préparation. Il ne remplace ni le logiciel commercial officiel, ni l&apos;outil officiel de rédaction et de validation des rapports.
        </p>
      </div>
    </main>
  );
}
