/** Normalisation de texte : minuscules, sans accents, ponctuation réduite à des espaces. */
export function normalize(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a au aux avec ce ces dans de des du en et la le les leur lot lots l d un une ou par pour sur the of and for to in on at by with marche marches accord cadre prestations prestation services service relatif relative relatifs relatives concernant n no".split(
    " ",
  ),
);

export function tokens(input: string | null | undefined): string[] {
  return normalize(input)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    // Racinisation minimale : singulier (vérifications → verification, travaux → travau).
    .map((t) => (t.length > 3 && /[sx]$/.test(t) ? t.slice(0, -1) : t));
}

/** Similarité de Jaccard sur les ensembles de mots significatifs (0..1). */
export function jaccard(a: string | null | undefined, b: string | null | undefined): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const LEGAL_FORMS = /\b(sas|sasu|sa|sarl|eurl|sci|gie|epic|epa|ets|etablissement|ste|societe)\b/g;

export function normalizeBuyer(name: string | null | undefined): string {
  return normalize(name).replace(LEGAL_FORMS, " ").replace(/\s+/g, " ").trim();
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
