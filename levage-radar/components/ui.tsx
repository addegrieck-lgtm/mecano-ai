import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";

type Tone = "slate" | "blue" | "green" | "amber" | "red" | "violet" | "teal";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  blue: "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-700/20 dark:text-brand-100 dark:ring-brand-700/40",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800",
  teal: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:ring-teal-800",
};

export function Badge({ children, tone = "slate", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone])}>
      {children}
    </span>
  );
}

const BTN = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
};
export type BtnVariant = keyof typeof BTN;

export function btnClass(variant: BtnVariant = "secondary", size: "sm" | "md" | "lg" = "md") {
  const s = size === "sm" ? "px-2.5 py-1.5 text-xs" : size === "lg" ? "px-5 py-3 text-base" : "px-3.5 py-2 text-sm";
  return cx("inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50", s, BTN[variant]);
}

export function ButtonLink({ href, children, variant = "secondary", size = "md", external }: { href: string; children: ReactNode; variant?: BtnVariant; size?: "sm" | "md" | "lg"; external?: boolean }) {
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={btnClass(variant, size)}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={btnClass(variant, size)}>
      {children}
    </Link>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          {title && <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, href, hint, tone = "slate" }: { label: string; value: ReactNode; href?: string; hint?: string; tone?: "slate" | "amber" | "red" | "blue" | "green" }) {
  const accent = { slate: "", amber: "border-l-4 border-l-amber-400", red: "border-l-4 border-l-red-500", blue: "border-l-4 border-l-brand-500", green: "border-l-4 border-l-emerald-500" }[tone];
  const body = (
    <div className={cx("card h-full p-4 transition", accent, href && "hover:border-brand-500 hover:shadow")}>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "amber", title, children }: { tone?: "amber" | "red" | "blue" | "green"; title?: ReactNode; children?: ReactNode }) {
  const t = {
    amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    red: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
    blue: "border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-700/20 dark:text-brand-100",
    green: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  }[tone];
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cx("rounded-md border px-4 py-3 text-sm", t)}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
          <dd className="min-w-0 break-words text-slate-900 dark:text-slate-100">{v ?? <span className="text-amber-700">Non renseigné</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Missing({ children = "Non publié" }: { children?: ReactNode }) {
  return <span className="text-slate-400 italic">{children}</span>;
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-emerald-600" : score >= 45 ? "bg-brand-600" : score > 0 ? "bg-slate-500" : "bg-slate-300";
  return <span className={cx("inline-flex h-7 w-10 items-center justify-center rounded-md text-xs font-bold text-white tabular-nums", tone)}>{score}</span>;
}

export function DemoBanner() {
  return (
    <div className="mb-4 rounded-md border-2 border-dashed border-violet-400 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
      MODE DÉMONSTRATION — données FICTIVES, sans lien avec des avis réels. Elles ne sont jamais mélangées aux données collectées.
    </div>
  );
}
