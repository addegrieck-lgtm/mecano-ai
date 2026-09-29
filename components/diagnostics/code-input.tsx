"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { TextInput } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { describeDtc, DTC_PATTERN } from "@/lib/diagnostics/engine";

export function CodeInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    const c = code.trim().toUpperCase();
    if (!DTC_PATTERN.test(c)) {
      setErr("Format attendu : lettre P/C/B/U + 4 caractères (ex. P0302)");
      return;
    }
    if (!value.includes(c)) onChange([...value, c]);
    setCode("");
    setErr(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <TextInput
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="P0302"
          maxLength={5}
          className="font-mono uppercase"
          aria-invalid={!!err || undefined}
        />
        <Button type="button" variant="secondary" onClick={add}>
          <Plus className="size-4" /> Ajouter
        </Button>
      </div>
      {err && <span className="text-xs text-destructive">{err}</span>}
      <div className="flex flex-col gap-1.5">
        {value.map((c) => (
          <div key={c} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono font-bold text-destructive">{c}</span>
            <span className="flex-1 text-muted-foreground">{describeDtc(c)}</span>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="text-muted-foreground hover:text-destructive" aria-label={`Retirer ${c}`}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
