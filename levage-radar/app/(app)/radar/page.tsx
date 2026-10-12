import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { listSavedSearches, parseSearch, searchOpportunities, STATUS_OPTIONS } from "@/lib/services/opportunities";
import { isDemoView } from "@/lib/demo-server";
import { CATEGORIES, SERVICE_TYPES } from "@/lib/radar/types";
import { COUNTRY_NAMES, DEPARTMENTS, REGIONS } from "@/lib/radar/geo";
import { IMPLEMENTED_INFOS } from "@/lib/connectors/registry";
import { Alert, ButtonLink, DemoBanner, Empty, PageHeader, ScorePill } from "@/components/ui";
import { CategoryBadge, Deadline, DomainBadge, ServiceBadge, StatusBadge } from "@/components/radar/badges";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtAmount, fmtDate } from "@/lib/format";
import { publicMessage } from "@/lib/errors";
import { saveSearchAction } from "./actions";
import { CSV_FIELDS, DEFAULT_CSV_FIELDS } from "@/lib/services/opp-exports";

export const metadata = { title: "Opportunités" };

type SP = Record<string, string | string[] | undefined>;

export default async function RadarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx("opps.read");
  const sp = await searchParams;
  const demo = await isDemoView();
  let filters;
  let error: string | null = null;
  try {
    filters = parseSearch(sp);
  } catch (e) {
    error = publicMessage(e);
    filters = parseSearch({});
  }
  const res = await searchOpportunities(ctx, filters, { demo });
  const saved = await listSavedSearches(ctx);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "page") qs.set(k, v);
  const pageHref = (p: number) => `/radar?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(p) })}`;
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const cats = filters.category;

  return (
    <>
      {demo && <DemoBanner />}
      <PageHeader
        title="Opportunités"
        subtitle={`${res.total} résultat(s)${res.truncated ? " (recherche limitée aux 3 000 premiers candidats : affinez les filtres)" : ""}`}
        actions={
          ctx.perms.has("opps.export") ? (
            <ButtonLink href={`/api/opportunities/export?${qs}${demo ? "&demo=1" : ""}&fields=${DEFAULT_CSV_FIELDS.join(",")}`}>Exporter CSV</ButtonLink>
          ) : null
        }
      />
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}

      <details className="card mb-4" open={!qs.toString() || undefined}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Filtres de recherche {qs.toString() && <span className="ml-2 text-xs font-normal text-slate-500">(actifs)</span>}</summary>
        <form method="get" action="/radar" className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="q">Recherche plein texte</label>
            <input className="input" id="q" name="q" defaultValue={v("q")} placeholder="ex. ponts roulants, TGBT, nom d'acheteur, référence…" />
          </div>
          <div>
            <label className="label" htmlFor="domain">Domaine</label>
            <select className="input" id="domain" name="domain" defaultValue={v("domain")}>
              <option value="">Levage + électricité</option>
              <option value="LEVAGE">Levage</option>
              <option value="ELECTRICITE">Électricité</option>
              <option value="MIXTE">Mixte uniquement</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="category">Catégorie</label>
            <select className="input" id="category" name="category" defaultValue={cats.length === 1 ? cats[0] : cats.join(",")}>
              <option value="">Toutes (hors non pertinentes)</option>
              {Object.entries(CATEGORIES).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
              <option value="AWARDED,CONTRACT_WATCH">Attribués + contrats à surveiller</option>
              <option value="SIGNAL,INDIRECT">Signaux + opportunités indirectes</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="serviceType">Type de prestation</label>
            <select className="input" id="serviceType" name="serviceType" defaultValue={v("serviceType")}>
              <option value="">Tous</option>
              {Object.entries(SERVICE_TYPES).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sector">Public / privé</label>
            <select className="input" id="sector" name="sector" defaultValue={v("sector")}>
              <option value="">Tous</option>
              <option value="public">Public</option>
              <option value="private">Privé</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="country">Pays</label>
            <select className="input" id="country" name="country" defaultValue={v("country")}>
              <option value="">Tous</option>
              {Object.entries(COUNTRY_NAMES).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="region">Région</label>
            <select className="input" id="region" name="region" defaultValue={v("region")}>
              <option value="">Toutes</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="department">Département(s)</label>
            <input className="input" id="department" name="department" defaultValue={v("department")} placeholder="ex. 69 ou 69,42,38" list="depts" />
            <datalist id="depts">
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="city">Ville</label>
            <input className="input" id="city" name="city" defaultValue={v("city")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="radiusFrom">Rayon depuis (dép.)</label>
              <input className="input" id="radiusFrom" name="radiusFrom" defaultValue={v("radiusFrom")} placeholder="votre dép." />
            </div>
            <div>
              <label className="label" htmlFor="radiusKm">km</label>
              <input className="input" id="radiusKm" name="radiusKm" type="number" min={10} max={2000} defaultValue={v("radiusKm")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="publishedFrom">Publié depuis</label>
              <input className="input" id="publishedFrom" name="publishedFrom" type="date" defaultValue={v("publishedFrom")} />
            </div>
            <div>
              <label className="label" htmlFor="publishedTo">jusqu&apos;au</label>
              <input className="input" id="publishedTo" name="publishedTo" type="date" defaultValue={v("publishedTo")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="deadlineFrom">Date limite après</label>
              <input className="input" id="deadlineFrom" name="deadlineFrom" type="date" defaultValue={v("deadlineFrom")} />
            </div>
            <div>
              <label className="label" htmlFor="deadlineTo">avant</label>
              <input className="input" id="deadlineTo" name="deadlineTo" type="date" defaultValue={v("deadlineTo")} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="buyer">Acheteur</label>
            <input className="input" id="buyer" name="buyer" defaultValue={v("buyer")} />
          </div>
          <div>
            <label className="label" htmlFor="source">Source</label>
            <select className="input" id="source" name="source" defaultValue={v("source")}>
              <option value="">Toutes</option>
              {IMPLEMENTED_INFOS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label" htmlFor="minScore">Score min.</label>
              <input className="input" id="minScore" name="minScore" type="number" min={0} max={100} defaultValue={v("minScore")} />
            </div>
            <div>
              <label className="label" htmlFor="amountMin">Montant min.</label>
              <input className="input" id="amountMin" name="amountMin" type="number" min={0} defaultValue={v("amountMin")} />
            </div>
            <div>
              <label className="label" htmlFor="amountMax">max.</label>
              <input className="input" id="amountMax" name="amountMax" type="number" min={0} defaultValue={v("amountMax")} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="status">Suivi</label>
            <select className="input" id="status" name="status" defaultValue={v("status")}>
              <option value="">Actifs (hors écartés / archivés)</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="newSince">Nouveauté</label>
            <select className="input" id="newSince" name="newSince" defaultValue={v("newSince")}>
              <option value="">Toutes</option>
              <option value="today">Détectées aujourd&apos;hui</option>
              <option value="last_visit">Depuis ma dernière connexion</option>
              <option value="7d">7 derniers jours</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sort">Tri</label>
            <select className="input" id="sort" name="sort" defaultValue={v("sort") || "score"}>
              <option value="score">Score de pertinence</option>
              <option value="deadline">Date limite la plus proche</option>
              <option value="published">Publication la plus récente</option>
              <option value="updated">Mise à jour récente</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2 lg:col-span-4">
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="open" value="1" defaultChecked={filters.open} /> Candidature encore possible</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="favorite" value="1" defaultChecked={filters.favorite} /> Favoris</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="assignedToMe" value="1" defaultChecked={filters.assignedToMe} /> M&apos;étant attribuées</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="includeIrrelevant" value="1" defaultChecked={filters.includeIrrelevant} /> Inclure les résultats non pertinents</label>
            <span className="grow" />
            <Link href="/radar" className="text-sm text-slate-500 hover:underline">Réinitialiser</Link>
            <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Rechercher</button>
          </div>
        </form>
      </details>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {saved.length > 0 && <span className="text-slate-500">Recherches enregistrées :</span>}
        {saved.map((s) => (
          <Link key={s.id} href={`/radar?${s.query}`} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 hover:ring-brand-500 dark:bg-slate-900 dark:ring-slate-700">
            {s.name}
          </Link>
        ))}
        {qs.toString() && (
          <ActionForm action={saveSearchAction} className="flex items-center gap-2" resetOnSuccess>
            <input type="hidden" name="query" value={qs.toString()} />
            <input className="input !w-48 !py-1" name="name" placeholder="Nom de la recherche" required aria-label="Nom de la recherche" />
            <SubmitButton size="sm" variant="secondary">Enregistrer ces filtres</SubmitButton>
          </ActionForm>
        )}
      </div>

      {res.items.length === 0 ? (
        <Empty title="Aucune opportunité ne correspond à ces critères.">
          {res.total === 0 && !qs.toString() ? "La base est vide : lancez une collecte depuis « État des connecteurs »." : "Élargissez les filtres ou incluez les résultats non pertinents."}
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-12">Score</th>
                <th>Opportunité</th>
                <th>Classement</th>
                <th>Lieu</th>
                <th>Publication</th>
                <th>Date limite</th>
                <th>Montant publié</th>
                <th>Suivi</th>
              </tr>
            </thead>
            <tbody>
              {res.items.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td><ScorePill score={o.score} /></td>
                  <td className="max-w-md">
                    <Link href={`/radar/${o.id}`} className="font-medium text-slate-900 hover:text-brand-600 dark:text-slate-100">
                      {o.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">{o.buyerName ?? "Acheteur non publié"} · {o.primarySourceId?.toUpperCase()} {o.reference}</div>
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <DomainBadge domain={o.domain} />
                      <CategoryBadge category={o.category} />
                      <ServiceBadge serviceType={o.serviceType} />
                    </div>
                  </td>
                  <td className="text-xs">{[o.city, o.department, o.country !== "FR" ? COUNTRY_NAMES[o.country ?? ""] ?? o.country : null].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-xs whitespace-nowrap">{fmtDate(o.publishedAt)}</td>
                  <td className="whitespace-nowrap"><Deadline at={o.deadlineAt} open={o.isOpen} /></td>
                  <td className="text-xs whitespace-nowrap">{o.publishedAmount ? fmtAmount(o.publishedAmount, o.amountCurrency) : "—"}</td>
                  <td>
                    <StatusBadge status={o.tracking?.status} />
                    {o.tracking?.favorite && <span className="ml-1" title="Favori">★</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
          {res.page > 1 && <Link className="link" href={pageHref(res.page - 1)}>← Précédent</Link>}
          <span className="text-slate-500">Page {res.page} / {pages}</span>
          {res.page < pages && <Link className="link" href={pageHref(res.page + 1)}>Suivant →</Link>}
        </nav>
      )}
      {ctx.perms.has("opps.export") && res.total > 0 && (
        <details className="card mt-6">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Export CSV : choisir les colonnes</summary>
          <form method="get" action="/api/opportunities/export" className="border-t border-slate-100 p-4 dark:border-slate-800">
            {Object.entries(Object.fromEntries(qs)).map(([k, val]) => (
              <input key={k} type="hidden" name={k} value={val} />
            ))}
            {demo && <input type="hidden" name="demo" value="1" />}
            <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(CSV_FIELDS).map(([k, f]) => (
                <label key={k} className="inline-flex items-center gap-2">
                  <input type="checkbox" name="fields" value={k} defaultChecked={DEFAULT_CSV_FIELDS.includes(k)} /> {f.label}
                </label>
              ))}
            </div>
            <button type="submit" className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">Télécharger le CSV (compatible Excel)</button>
          </form>
        </details>
      )}
    </>
  );
}
