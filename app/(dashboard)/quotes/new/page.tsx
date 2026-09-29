"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useApp, useData } from "@/components/app/app-provider";
import { Field, Loading, NativeSelect, PageHeader, Section, TextArea } from "@/components/app/common";
import { fromEditable, QuoteEditor, type EditableLine } from "@/components/quotes/quote-editor";
import { Button } from "@/components/ui/button";

function NewQuote() {
  const params = useSearchParams();
  const router = useRouter();
  const { services, garage, refresh } = useApp();
  const [vehicleId, setVehicleId] = useState(params.get("vehicle") ?? "");
  const [teamId, setTeamId] = useState("");
  const [mechanicId, setMechanicId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [saving, setSaving] = useState(false);
  const { data } = useData(async (s) => ({ vehicles: await s.crm.vehicles(), teams: await s.org.teams(), members: await s.org.members() }));
  if (!data || !services) return <Loading />;

  async function save() {
    if (!services) return;
    if (!vehicleId) return toast.error("Sélectionnez un véhicule");
    if (lines.some((l) => !l.label.trim())) return toast.error("Chaque ligne doit avoir un libellé");
    setSaving(true);
    try {
      const q = await services.work.createQuote({ vehicle_id: vehicleId, team_id: teamId || null, mechanic_id: mechanicId || null, notes: notes || null, items: lines.map(fromEditable) });
      refresh();
      toast.success(`Devis ${q.number} créé`);
      router.push(`/quotes/${q.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/quotes", label: "Devis" }} title="Nouveau devis" subtitle="Les prix proviennent du catalogue du garage ; à défaut : « Prix à renseigner »." />
      <Section title="Informations">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Véhicule *">
            <NativeSelect value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {data.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.registration} {v.client ? `(${v.client.last_name})` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Équipe">
            <NativeSelect value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">—</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Mécanicien">
            <NativeSelect value={mechanicId} onChange={(e) => setMechanicId(e.target.value)}>
              <option value="">—</option>
              {data.members
                .filter((m) => m.member.role === "MECHANIC" || m.member.role === "TEAM_MANAGER")
                .map((m) => (
                  <option key={m.profile.id} value={m.profile.id}>
                    {m.profile.first_name} {m.profile.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
          </Field>
        </div>
      </Section>
      <Section title="Lignes du devis">
        <QuoteEditor lines={lines} onChange={setLines} vatRate={garage?.settings.vat_rate ?? 20} />
      </Section>
      <div className="flex justify-end">
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Créer le devis
        </Button>
      </div>
    </div>
  );
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewQuote />
    </Suspense>
  );
}
