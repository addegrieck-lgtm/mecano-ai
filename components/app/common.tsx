"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs font-medium text-muted-foreground hover:text-primary">
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, icon: Icon, actions, children, className }: { title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {Icon && <Icon className="size-4 text-primary" />}
              {title}
            </h2>
          )}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "muted", href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: Tone; href?: string }) {
  const body = (
    <div className={cn("flex h-full flex-col justify-between rounded-xl border bg-card p-4 transition-colors", href && "hover:border-primary/50")}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        {Icon && <Icon className={cn("size-4", toneText[tone])} />}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export const toneText: Record<Tone, string> = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
};

const toneBadge: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground border-transparent",
  primary: "bg-primary/15 text-primary border-primary/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-info/15 text-info border-info/30",
};

export function Pill({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", toneBadge[tone], className)}>{children}</span>;
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertTriangle className="size-4 shrink-0" /> {message}
    </div>
  );
}

export function Empty({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
      <Icon className="size-8 text-muted-foreground/60" />
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-foreground/90">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  );
}

export const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-input/30 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50";

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(inputClass, "appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-20 py-2", className)} {...props} />;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmer",
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={cn("size-5", tone === "danger" ? "text-destructive" : "text-primary")} /> {title}
          </DialogTitle>
          <DialogDescription render={<div />}>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Enregistrer",
  pending,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => unknown;
  submitLabel?: string;
  pending?: boolean;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Avatar({ first, last, color, size = "md" }: { first?: string; last?: string; color?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground", size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs")}
      style={color ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      {`${(first ?? "?")[0] ?? ""}${(last ?? "")[0] ?? ""}`.toUpperCase()}
    </span>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-1.5">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
