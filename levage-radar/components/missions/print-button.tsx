"use client";

import { btnClass } from "@/components/ui";

export function PrintButton() {
  return <button type="button" className={btnClass("secondary")} onClick={() => window.print()}>Imprimer</button>;
}
