/** CSV compatible Excel (séparateur « ; », BOM UTF-8, protection contre l'injection de formules). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(", ") : String(v);
  // Injection de formule (CSV injection) : préfixe une apostrophe si la cellule commence par = + - @ tab CR.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\r\n") + "\r\n";
}
