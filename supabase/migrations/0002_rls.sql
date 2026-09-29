-- =====================================================================
-- MECANO AI — Row Level Security
-- Règle fondamentale : USER → GARAGE MEMBERSHIP → GARAGE → DATA
-- Un utilisateur ne peut JAMAIS lire ni écrire les données d'un garage dont il n'est pas membre.
-- La couche applicative (lib/services) applique en plus les permissions fines par rôle.
-- =====================================================================

-- ---------- Fonctions d'aide (security definer : évitent la récursion RLS) ----------
create or replace function public.is_garage_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from garage_members m where m.garage_id = g and m.user_id = auth.uid());
$$;

create or replace function public.garage_role(g uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select m.role from garage_members m where m.garage_id = g and m.user_id = auth.uid();
$$;

create or replace function public.has_garage_role(g uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.garage_role(g) = any (roles), false);
$$;

create or replace function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members tm where tm.team_id = t and tm.user_id = auth.uid())
      or exists (select 1 from teams tt where tt.id = t and tt.manager_id = auth.uid());
$$;

create or replace function public.can_write(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_garage_role(g, array['OWNER', 'ADMIN', 'TEAM_MANAGER', 'MECHANIC', 'RECEPTION']::member_role[]);
$$;

create or replace function public.is_garage_admin(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_garage_role(g, array['OWNER', 'ADMIN']::member_role[]);
$$;

-- ---------- Activation RLS sur toutes les tables ----------
alter table profiles enable row level security;
alter table garages enable row level security;
alter table garage_members enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table clients enable row level security;
alter table vehicles enable row level security;
alter table vehicle_intakes enable row level security;
alter table obd_connections enable row level security;
alter table obd_sessions enable row level security;
alter table diagnostics enable row level security;
alter table diagnostic_codes enable row level security;
alter table diagnostic_tests enable row level security;
alter table diagnostic_results enable row level security;
alter table diagnostic_live_data enable row level security;
alter table price_catalog enable row level security;
alter table parts enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table interventions enable row level security;
alter table reviews enable row level security;
alter table photos enable row level security;
alter table audit_logs enable row level security;

-- ---------- Profils ----------
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or exists (select 1 from garage_members a join garage_members b on a.garage_id = b.garage_id where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Garages ----------
create policy garages_select on garages for select using (public.is_garage_member(id) or created_by = auth.uid());
create policy garages_insert on garages for insert to authenticated with check (created_by = auth.uid());
create policy garages_update on garages for update using (public.is_garage_admin(id)) with check (public.is_garage_admin(id));
create policy garages_delete on garages for delete using (public.has_garage_role(id, array['OWNER']::member_role[]));

-- ---------- Membres ----------
create policy members_select on garage_members for select using (public.is_garage_member(garage_id));
create policy members_insert on garage_members for insert with check (
  public.is_garage_admin(garage_id)
  -- création d'un garage : le créateur devient OWNER du garage encore vide
  or (user_id = auth.uid() and role = 'OWNER' and not exists (select 1 from garage_members x where x.garage_id = garage_members.garage_id))
);
create policy members_update on garage_members for update using (public.is_garage_admin(garage_id)) with check (public.is_garage_admin(garage_id));
create policy members_delete on garage_members for delete using (public.is_garage_admin(garage_id));

-- ---------- Équipes ----------
create policy teams_select on teams for select using (public.is_garage_member(garage_id));
create policy teams_insert on teams for insert with check (public.is_garage_admin(garage_id));
create policy teams_update on teams for update using (public.is_garage_admin(garage_id) or (manager_id = auth.uid())) with check (public.is_garage_member(garage_id));
create policy teams_delete on teams for delete using (public.is_garage_admin(garage_id));

create policy team_members_select on team_members for select using (public.is_garage_member(garage_id));
create policy team_members_write on team_members for all
  using (public.is_garage_admin(garage_id) or exists (select 1 from teams t where t.id = team_id and t.manager_id = auth.uid()))
  with check (public.is_garage_admin(garage_id) or exists (select 1 from teams t where t.id = team_id and t.manager_id = auth.uid() and t.garage_id = team_members.garage_id));

-- ---------- Tables métier génériques : lecture membres, écriture rôles actifs, suppression direction ----------
do $$
declare t text;
begin
  foreach t in array array['clients', 'vehicles', 'vehicle_intakes', 'obd_connections', 'obd_sessions', 'diagnostics', 'diagnostic_codes', 'diagnostic_tests', 'diagnostic_results', 'diagnostic_live_data', 'quotes', 'quote_items', 'reviews', 'photos']
  loop
    execute format('create policy %1$s_select on %1$I for select using (public.is_garage_member(garage_id))', t);
    execute format('create policy %1$s_insert on %1$I for insert with check (public.can_write(garage_id))', t);
    execute format('create policy %1$s_update on %1$I for update using (public.can_write(garage_id)) with check (public.can_write(garage_id))', t);
    execute format('create policy %1$s_delete on %1$I for delete using (public.has_garage_role(garage_id, array[''OWNER'',''ADMIN'',''RECEPTION'',''TEAM_MANAGER'',''MECHANIC'']::member_role[]))', t);
  end loop;
end $$;

-- Tarifs et pièces : lecture membres, écriture direction
create policy price_catalog_select on price_catalog for select using (public.is_garage_member(garage_id));
create policy price_catalog_write on price_catalog for all using (public.is_garage_admin(garage_id)) with check (public.is_garage_admin(garage_id));
create policy parts_select on parts for select using (public.is_garage_member(garage_id));
create policy parts_write on parts for all using (public.is_garage_admin(garage_id)) with check (public.is_garage_admin(garage_id));
-- décrément de stock à la clôture d'une intervention
create policy parts_stock_update on parts for update using (public.can_write(garage_id)) with check (public.can_write(garage_id));

-- ---------- Interventions : visibilité par rôle ----------
-- OWNER / ADMIN / RECEPTION / VIEWER : tout le garage ; TEAM_MANAGER : son équipe ; MECHANIC : ses interventions
create policy interventions_select on interventions for select using (
  public.has_garage_role(garage_id, array['OWNER', 'ADMIN', 'RECEPTION', 'VIEWER']::member_role[])
  or mechanic_id = auth.uid()
  or (public.has_garage_role(garage_id, array['TEAM_MANAGER']::member_role[]) and team_id is not null and public.is_team_member(team_id))
);
create policy interventions_insert on interventions for insert with check (public.can_write(garage_id));
create policy interventions_update on interventions for update using (
  public.has_garage_role(garage_id, array['OWNER', 'ADMIN', 'RECEPTION']::member_role[])
  or mechanic_id = auth.uid()
  or (mechanic_id is null and public.can_write(garage_id))
  or (public.has_garage_role(garage_id, array['TEAM_MANAGER']::member_role[]) and team_id is not null and public.is_team_member(team_id))
) with check (public.can_write(garage_id));
create policy interventions_delete on interventions for delete using (public.is_garage_admin(garage_id));

-- ---------- Journal d'audit : ajout seulement, lecture direction ----------
create policy audit_insert on audit_logs for insert with check (public.is_garage_member(garage_id) and user_id = auth.uid());
create policy audit_select on audit_logs for select using (public.is_garage_admin(garage_id));
-- aucune policy update/delete : le journal est immuable pour les utilisateurs

-- ---------- Storage : bucket privé « photos », fichiers rangés sous {garage_id}/... ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_storage_select on storage.objects for select using (bucket_id = 'photos' and public.is_garage_member(((storage.foldername(name))[1])::uuid));
create policy photos_storage_insert on storage.objects for insert with check (bucket_id = 'photos' and public.can_write(((storage.foldername(name))[1])::uuid));
create policy photos_storage_delete on storage.objects for delete using (bucket_id = 'photos' and public.is_garage_admin(((storage.foldername(name))[1])::uuid));
