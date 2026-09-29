"use client";

import { cn } from "@/lib/utils";

export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="no-print -mx-4 mb-4 overflow-x-auto px-4">
      <div className="flex min-w-max gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              value === t.id ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded bg-muted px-1.5 text-[11px]">{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
