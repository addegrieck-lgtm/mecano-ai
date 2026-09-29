"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { COMMON_SYMPTOMS } from "@/data/diagnostic-rules";
import { TextInput } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SymptomPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  const extra = value.filter((s) => !COMMON_SYMPTOMS.includes(s));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {[...COMMON_SYMPTOMS, ...extra].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", value.includes(s) ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground")}
          >
            {value.includes(s) && extra.includes(s) && <X className="mr-1 inline size-3" />}
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <TextInput value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Autre symptôme…" maxLength={200} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const v = custom.trim();
            if (v && !value.includes(v)) onChange([...value, v]);
            setCustom("");
          }}
        >
          <Plus className="size-4" /> Ajouter
        </Button>
      </div>
    </div>
  );
}
