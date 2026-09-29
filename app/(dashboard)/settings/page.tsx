"use client";

import { useEffect, useState } from "react";
import { Bot, Database, Download, History, Package, Pencil, Plus, RefreshCw, Save, Settings2, Tags, Trash2 } from "lucide-react";
import { useAction, useApp, useData, useServices } from "@/components/app/app-provider";
import { ConfirmDialog, Empty, Field, FormDialog, Loading, NativeSelect, PageHeader, Pill, Section, TextInput } from "@/components/app/common";
import { TabBar } from "@/components/app/tab-bar";
import { useForm } from "@/components/app/use-form";
import { Button } from "@/components/ui/button";
import { fetchAIStatus, type AIStatusDto } from "@/lib/ai/client";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { formatEuro } from "@/lib/quotes/calc";
import { catalogItemSchema, garageSettingsSchema, partSchema } from "@/lib/validation/schemas";
import type { Part, PriceCatalogItem } from "@/types";

type Tab = "general" | "catalog" | "parts" | "ai" | "audit" | "data";

function GeneralSettings() {
  const { garage } = useApp();
  const s = useServices();
  const { run, pending } = useAction();
  const f = useForm({ vat_rate: "20", labor_hourly_rate: "", workshop_capacity: "6", quote_validity_days: "30", quote_follow_up_days: "3" });
  const { reset } = f;
  useEffect(() => {
    if (garage)
      reset({
        vat_rate: String(garage.settings.vat_rate),
        labor_hourly_rate: garage.settings.labor_hourly_rate?.toString() ?? "",
        workshop_capacity: String(garage.settings.workshop_capacity),
        quote_validity_days: String(garage.settings.quote_validity_days),
        quote_follow_up_days: String(garage.settings.quote_follow_up_days),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garage]);
  const editable = can(s.ctx, "garage:manage");
  return (
    <Section title="Paramètres du garage" icon={Settings2}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="TVA (%)" error={f.errors.vat_rate}>
          <TextInput {...f.bind("vat_rate")} inputMode="decimal" disabled={!editable} />
        </Field>
        <Field label="Taux horaire par défaut (€ HT)" error={f.errors.labor_hourly_rate} hint="Utilisé si le catalogue n'a pas de ligne « labor_hour ».">
          <TextInput {...f.bind("labor_hourly_rate")} inputMode="decimal" disabled={!editable} />
        </Field>
        <Field label="Capacité atelier (véhicules)" error={f.errors.workshop_capacity}>
          <TextInput {...f.bind("workshop_capacity")} inputMode="numeric" disabled={!editable} />
        </Field>
        <Field label="Validité des devis (jours)" error={f.errors.quote_validity_days}>
          <TextInput {...f.bind("quote_validity_days")} inputMode="numeric" disabled={!editable} />
        </Field>
        <Field label="Relance devis après (jours)" error={f.errors.quote_follow_up_days}>
          <TextInput {...f.bind("quote_follow_up_days")} inputMode="numeric" disabled={!editable} />
        </Field>
      </div>
      {editable && (
        <div className="mt-4 flex justify-end">
          <Button
            disabled={pending}
            onClick={async () => {
              const data = f.validate(garageSettingsSchema);
              if (data) await run((svc) => svc.org.updateSettings(data), "Paramètres enregistrés");
            }}
          >
            <Save className="size-4" /> Enregistrer
          </Button>
        </div>
      )}
    </Section>
  );
}

function CatalogSettings() {
  const s = useServices();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<PriceCatalogItem | null | "new">(null);
  const f = useForm({ category: "SERVICE", key: "", label: "", unit_price: "", default_hours: "" });
  const { data } = useData((svc) => svc.crm.catalog());
  const editable = can(s.ctx, "catalog:manage");
  const open = (item: PriceCatalogItem | "new") => {
    setEditing(item);
    f.reset(item === "new" ? { category: "SERVICE", key: "", label: "", unit_price: "", default_hours: "" } : { category: item.category, key: item.key, label: item.label, unit_price: item.unit_price?.toString() ?? "", default_hours: item.default_hours?.toString() ?? "" });
  };
  return (
    <Section
      title="Catalogue de prix du garage"
      icon={Tags}
      actions={
        editable && (
          <Button size="sm" onClick={() => open("new")}>
            <Plus className="size-4" /> Ajouter
          </Button>
        )
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Ces tarifs sont les SEULES sources de prix utilisées par MECANO AI pour pré-remplir les devis. « Temps garage » = temps facturé défini par le garage (pas un temps constructeur).
      </p>
      {!data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
              <Pill tone={c.category === "LABOR" ? "primary" : "muted"}>{c.category === "LABOR" ? "Main-d'œuvre" : "Prestation"}</Pill>
              <span className="flex-1">
                {c.label} <span className="font-mono text-[11px] text-muted-foreground">{c.key}</span>
              </span>
              <span className="text-right tabular-nums">
                {c.unit_price != null ? formatEuro(c.unit_price) : c.default_hours != null ? `${c.default_hours} h (temps garage)` : <span className="text-warning">Prix à renseigner</span>}
              </span>
              {editable && (
                <>
                  <Button size="icon-sm" variant="ghost" onClick={() => open(c)} aria-label="Modifier">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => run((svc) => svc.crm.removeCatalogItem(c.id), "Ligne supprimée")} aria-label="Supprimer">
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Nouvelle ligne de catalogue" : "Modifier la ligne"}
        pending={pending}
        onSubmit={async () => {
          const d = f.validate(catalogItemSchema);
          if (!d) return;
          const res = await run((svc) => svc.crm.saveCatalogItem(editing === "new" || !editing ? null : editing.id, d), "Catalogue mis à jour");
          if (res) setEditing(null);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Catégorie">
            <NativeSelect {...f.bind("category")}>
              <option value="SERVICE">Prestation (forfait)</option>
              <option value="LABOR">Main-d&apos;œuvre</option>
            </NativeSelect>
          </Field>
          <Field label="Clé *" error={f.errors.key} hint="ex. vidange, labor_hour, remplacement_bobine">
            <TextInput {...f.bind("key")} />
          </Field>
          <Field label="Libellé *" error={f.errors.label} className="sm:col-span-2">
            <TextInput {...f.bind("label")} />
          </Field>
          <Field label="Prix HT (€)" error={f.errors.unit_price}>
            <TextInput {...f.bind("unit_price")} inputMode="decimal" placeholder="Prix à renseigner" />
          </Field>
          <Field label="Temps garage (h)" error={f.errors.default_hours}>
            <TextInput {...f.bind("default_hours")} inputMode="decimal" />
          </Field>
        </div>
      </FormDialog>
    </Section>
  );
}

function PartsSettings() {
  const s = useServices();
  const { run, pending } = useAction();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Part | null | "new">(null);
  const f = useForm({ reference: "", name: "", brand: "", price: "", stock: "0", supplier: "" });
  const { data } = useData((svc) => svc.crm.parts(q), [q]);
  const editable = can(s.ctx, "catalog:manage");
  const open = (p: Part | "new") => {
    setEditing(p);
    f.reset(p === "new" ? { reference: "", name: "", brand: "", price: "", stock: "0", supplier: "" } : { reference: p.reference, name: p.name, brand: p.brand ?? "", price: p.price?.toString() ?? "", stock: String(p.stock), supplier: p.supplier ?? "" });
  };
  return (
    <Section
      title="Pièces (stock garage)"
      icon={Package}
      actions={
        editable && (
          <Button size="sm" onClick={() => open("new")}>
            <Plus className="size-4" /> Ajouter
          </Button>
        )
      }
    >
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une pièce…" className="mb-3" />
      {!data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty title="Aucune pièce" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
              <span className="flex-1">
                {p.name} <span className="font-mono text-[11px] text-muted-foreground">{p.reference}</span>
                {p.brand && <span className="text-xs text-muted-foreground"> · {p.brand}</span>}
              </span>
              <Pill tone={p.stock === 0 ? "danger" : p.stock < 2 ? "warning" : "muted"}>Stock {p.stock}</Pill>
              <span className="w-24 text-right tabular-nums">{formatEuro(p.price)}</span>
              {editable && (
                <>
                  <Button size="icon-sm" variant="ghost" onClick={() => open(p)} aria-label="Modifier">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => run((svc) => svc.crm.removePart(p.id), "Pièce supprimée")} aria-label="Supprimer">
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Intégrations fournisseurs (disponibilité, prix, commande) : prévues via l&apos;interface PartsProvider — non connectées dans le MVP.</p>
      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Nouvelle pièce" : "Modifier la pièce"}
        pending={pending}
        onSubmit={async () => {
          const d = f.validate(partSchema);
          if (!d) return;
          const res = await run((svc) => svc.crm.savePart(editing === "new" || !editing ? null : editing.id, d), "Pièce enregistrée");
          if (res) setEditing(null);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Référence *" error={f.errors.reference}>
            <TextInput {...f.bind("reference")} />
          </Field>
          <Field label="Nom *" error={f.errors.name}>
            <TextInput {...f.bind("name")} />
          </Field>
          <Field label="Marque">
            <TextInput {...f.bind("brand")} />
          </Field>
          <Field label="Fournisseur">
            <TextInput {...f.bind("supplier")} />
          </Field>
          <Field label="Prix HT (€)" error={f.errors.price}>
            <TextInput {...f.bind("price")} inputMode="decimal" />
          </Field>
          <Field label="Stock" error={f.errors.stock}>
            <TextInput {...f.bind("stock")} inputMode="numeric" />
          </Field>
        </div>
      </FormDialog>
    </Section>
  );
}

function AISettings() {
  const [status, setStatus] = useState<AIStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (refresh = false) => {
    setBusy(true);
    setStatus(await fetchAIStatus(refresh));
    setBusy(false);
  };
  useEffect(() => {
    void fetchAIStatus().then(setStatus);
  }, []);
  return (
    <Section
      title="Intelligence artificielle"
      icon={Bot}
      actions={
        <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={busy}>
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> Tester
        </Button>
      }
    >
      {!status ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            Fournisseur actif :
            {status.provider === "ollama" ? <Pill tone="success">Ollama — {status.model}</Pill> : <Pill tone="warning">MockAIProvider (moteur de règles)</Pill>}
          </div>
          {status.reason && <div className="text-muted-foreground">{status.reason}</div>}
          {status.models.length > 0 && <div className="text-muted-foreground">Modèles installés : {status.models.join(", ")}</div>}
          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            IA 100 % locale et gratuite : installez <b>Ollama</b> (ollama.com), puis <code className="rounded bg-background px-1">ollama pull llama3.2</code> (ou mistral, qwen2.5…). Configurez <code className="rounded bg-background px-1">OLLAMA_BASE_URL</code> et{" "}
            <code className="rounded bg-background px-1">OLLAMA_MODEL</code> dans .env.local. Sans Ollama, le moteur de règles répond automatiquement. Dans tous les cas, l&apos;IA ne génère ni prix, ni valeurs constructeur.
          </div>
        </div>
      )}
    </Section>
  );
}

function AuditSettings() {
  const s = useServices();
  const { data } = useData(async (svc) => (can(svc.ctx, "audit:view") ? { logs: await svc.insights.auditLogs(300), members: await svc.org.members() } : null));
  if (!can(s.ctx, "audit:view")) return <Empty title="Journal réservé à la direction" />;
  if (!data) return <Loading />;
  const who = (id: string) => data.members.find((m) => m.profile.id === id)?.profile;
  return (
    <Section title="Journal d'audit" icon={History}>
      <div className="flex flex-col gap-1">
        {data.logs.map((l) => (
          <div key={l.id} className="grid grid-cols-[140px_1fr] gap-2 border-b border-border/40 py-1.5 text-xs sm:grid-cols-[150px_180px_1fr]">
            <span className="text-muted-foreground">{fmtDateTime(l.created_at)}</span>
            <span className="font-mono text-primary">{l.action}</span>
            <span className="col-span-2 truncate text-muted-foreground sm:col-span-1">
              {who(l.user_id) ? `${who(l.user_id)!.first_name} ${who(l.user_id)!.name}` : l.user_id} · {l.entity_type}
              {l.details ? ` · ${JSON.stringify(l.details).slice(0, 120)}` : ""}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DataSettings() {
  const { mode, resetDemo, store } = useApp();
  const [confirm, setConfirm] = useState(false);
  return (
    <Section title="Données" icon={Database}>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          Mode : {mode === "demo" ? <Pill tone="primary">DÉMO — données locales (IndexedDB)</Pill> : <Pill tone="success">Supabase</Pill>}
        </div>
        {mode === "demo" && (
          <>
            <p className="text-muted-foreground">Les données de démonstration sont stockées uniquement sur cet appareil, fonctionnent hors connexion et ne sont jamais envoyées à un serveur.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  const s = store as unknown as { snapshot?: () => unknown };
                  const blob = new Blob([JSON.stringify(s.snapshot?.() ?? {}, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `mecano-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download className="size-4" /> Exporter (JSON)
              </Button>
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                <RefreshCw className="size-4" /> Réinitialiser la démo
              </Button>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Réinitialiser les données de démonstration ?" description="Toutes les modifications locales seront remplacées par le jeu de données initial." confirmLabel="Réinitialiser" onConfirm={resetDemo} />
    </Section>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Garage, tarifs, pièces, IA, journal d'audit" />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "general", label: "Général" },
          { id: "catalog", label: "Catalogue de prix" },
          { id: "parts", label: "Pièces" },
          { id: "ai", label: "IA" },
          { id: "audit", label: "Journal d'audit" },
          { id: "data", label: "Données" },
        ]}
      />
      {tab === "general" && <GeneralSettings />}
      {tab === "catalog" && <CatalogSettings />}
      {tab === "parts" && <PartsSettings />}
      {tab === "ai" && <AISettings />}
      {tab === "audit" && <AuditSettings />}
      {tab === "data" && <DataSettings />}
    </div>
  );
}
