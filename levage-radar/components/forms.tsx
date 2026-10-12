"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { btnClass, type BtnVariant } from "./ui";

export type ActionResult = { ok?: boolean; message?: string; error?: string; data?: Record<string, unknown> } | null;

export function SubmitButton({ children, variant = "primary", size = "md", pendingLabel, confirm, className }: { children: ReactNode; variant?: BtnVariant; size?: "sm" | "md" | "lg"; pendingLabel?: string; confirm?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnClass(variant, size)} ${className ?? ""}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? (pendingLabel ?? "En cours…") : children}
    </button>
  );
}

/** Formulaire branché sur une Server Action renvoyant { ok, message, error }. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className={btnClass("secondary", "sm")}
      onClick={async (e) => {
        const btn = e.currentTarget;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = "Copié ✓";
        } catch {
          btn.textContent = "Copie impossible";
        }
        setTimeout(() => (btn.textContent = label), 2000);
      }}
    >
      {label}
    </button>
  );
}
