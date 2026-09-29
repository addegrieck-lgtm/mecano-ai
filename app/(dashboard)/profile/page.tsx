"use client";

import { useApp } from "@/components/app/app-provider";
import { KeyValue, PageHeader, Section } from "@/components/app/common";
import { ROLE_LABELS } from "@/lib/permissions";

export default function ProfilePage() {
  const { profile, garages, mode } = useApp();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Mon profil" subtitle={mode === "demo" ? "Mode démo : profil fictif" : "Compte Supabase"} />
      <Section title="Identité">
        <KeyValue
          items={[
            ["Prénom", profile?.first_name ?? "—"],
            ["Nom", profile?.name ?? "—"],
            ["Email", profile?.email ?? "—"],
            ["Téléphone", profile?.phone ?? "—"],
          ]}
        />
      </Section>
      <Section title="Garages et rôles">
        <KeyValue items={garages.map(({ garage, member }) => [garage.name, ROLE_LABELS[member.role]])} />
      </Section>
    </div>
  );
}
