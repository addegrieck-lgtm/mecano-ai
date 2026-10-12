"use client";

import { useEffect, useRef, useState } from "react";
import type { Field } from "@/lib/reports/template-schema";
import { cx } from "@/lib/format";

type Props = {
  field: Field;
  value: unknown;
  pending: boolean;
  disabled?: boolean;
  allowDictation?: boolean;
  onChange: (v: unknown) => void;
  onTogglePending: () => void;
};

/** Champ de formulaire généré à partir du modèle (grands contrôles tactiles, état « en attente »). */
export function FieldInput({ field, value, pending, disabled, allowDictation, onChange, onTogglePending }: Props) {
  const id = `f-${field.key}`;
  const base = "input !py-2.5 !text-base sm:!text-sm";
  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = <TextArea id={id} value={(value as string) ?? ""} disabled={disabled} onChange={onChange} allowDictation={allowDictation} />;
      break;
    case "number":
      control = (
        <div className="flex items-center gap-2">
          <input id={id} className={base} inputMode="decimal" type="text" disabled={disabled} value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
          {field.unit && <span className="text-sm text-slate-500">{field.unit}</span>}
        </div>
      );
      break;
    case "date":
      control = <input id={id} className={base} type="date" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case "datetime":
      control = <input id={id} className={base} type="datetime-local" disabled={disabled} value={(value as string)?.slice(0, 16) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case "select":
      control = (
        <select id={id} className={base} disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((o) => {
            const on = arr.includes(o);
            return (
              <button key={o} type="button" disabled={disabled} onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])} className={cx("rounded-full px-3 py-1.5 text-sm ring-1", on ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300 dark:ring-slate-600")} aria-pressed={on}>
                {o}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case "boolean":
      control = (
        <div className="flex gap-2">
          {[["Oui", true], ["Non", false]].map(([l, v]) => (
            <button key={String(l)} type="button" disabled={disabled} onClick={() => onChange(value === v ? null : v)} className={cx("rounded-md px-4 py-2 text-sm ring-1", value === v ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300 dark:ring-slate-600")} aria-pressed={value === v}>
              {String(l)}
            </button>
          ))}
        </div>
      );
      break;
    default:
      control = <input id={id} className={base} type="text" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={cx("rounded-md p-2", pending && "bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-950/30")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {field.label}
          {field.required && <span className="text-red-600" title="Obligatoire"> *</span>}
        </label>
        {!disabled && (
          <button type="button" onClick={onTogglePending} className={cx("rounded px-2 py-0.5 text-[11px]", pending ? "bg-amber-200 text-amber-900" : "text-slate-400 hover:text-amber-700")} title="Marquer ce champ comme à compléter plus tard">
            {pending ? "En attente ✕" : "Laisser en attente"}
          </button>
        )}
      </div>
      {control}
      {field.help && <p className="mt-1 text-xs text-slate-500">{field.help}</p>}
    </div>
  );
}

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void; onend: () => void };

export function TextArea({ id, value, disabled, onChange, allowDictation, rows = 3 }: { id: string; value: string; disabled?: boolean; onChange: (v: string) => void; allowDictation?: boolean; rows?: number }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SR | null>(null);
  const valRef = useRef(value);
  useEffect(() => {
    valRef.current = value;
  }, [value]);
  const Rec = typeof window !== "undefined" ? ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => SR) | undefined : undefined;
  const dictate = () => {
    if (!Rec) return;
    if (listening) return recRef.current?.stop();
    const r = new Rec();
    r.lang = "fr-FR";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1][0].transcript;
      onChange(`${valRef.current ? valRef.current + " " : ""}${last.trim()}`);
    };
    r.onend = () => setListening(false);
    recRef.current = r;
    setListening(true);
    r.start();
  };
  return (
    <div>
      <textarea id={id} className="input !text-base sm:!text-sm" rows={rows} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
      {allowDictation && Rec && !disabled && (
        <button type="button" onClick={dictate} className="mt-1 text-xs text-brand-600" title="Dictée du navigateur (service du fabricant du navigateur, autorisée par l'administrateur)">
          {listening ? "■ Arrêter la dictée" : "🎤 Dicter"}
        </button>
      )}
    </div>
  );
}
