-- =====================================================================
-- MECANO AI — schéma initial (PostgreSQL / Supabase)
-- Colonnes identiques aux types TypeScript (types/index.ts).
-- Toutes les tables métier portent garage_id (isolation multi-tenant).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Types ----------
create type member_role as enum ('OWNER', 'ADMIN', 'TEAM_MANAGER', 'MECHANIC', 'RECEPTION', 'VIEWER');
create type fuel_type as enum ('DIESEL', 'ESSENCE', 'HYBRIDE', 'HYBRIDE_RECHARGEABLE', 'ELECTRIQUE', 'GPL', 'AUTRE');
create type diagnostic_status as enum ('OPEN', 'ANALYSIS', 'TESTING', 'CONCLUDED', 'CLOSED');
create type intervention_status as enum ('WAITING', 'IN_PROGRESS', 'WAITING_PART', 'COMPLETED', 'CANCELLED');
create type quote_status as enum ('DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'EXPIRED');
create type quote_item_kind as enum ('LABOR', 'PART', 'SERVICE');
create type obd_provider as enum ('SIMULATOR', 'BLUETOOTH');
create type test_answer as enum ('YES', 'NO', 'UNKNOWN');
create type condition_level as enum ('OK', 'A_SURVEILLER', 'DEFAUT');

-- ---------- Utilisateurs & organisation ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  first_name text not null default '',
  email text not null,
  phone text,
  avatar text,
  role member_role,
  created_at timestamptz not null default now()
);

create table garages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  legal_name text,
  address text,
  postal_code text,
  city text,
  phone text,
  email text,
  logo text,
  siret text check (siret is null or siret ~ '^[0-9]{14}$'),
  created_by uuid default auth.uid(), -- permet au créateur de relire le garage avant l'ajout de son adhésion OWNER
  settings jsonb not null default '{"vat_rate":20,"labor_hourly_rate":null,"workshop_capacity":6,"quote_validity_days":30,"quote_follow_up_days":3,"currency":"EUR"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#f97316',
  manager_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table garage_members (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role member_role not null,
  team_id uuid references teams (id) on delete set null,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (garage_id, user_id)
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ---------- Clients & véhicules ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  registration text not null,
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{11,17}$'),
  make text not null,
  model text not null,
  version text,
  year int check (year is null or year between 1900 and 2100),
  engine text,
  fuel fuel_type not null,
  mileage int check (mileage is null or mileage >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (garage_id, registration)
);

create table vehicle_intakes (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  user_id uuid not null references profiles (id),
  mileage int,
  fuel_level text not null,
  warning_lights text[] not null default '{}',
  bodywork condition_level not null,
  tires condition_level not null,
  rims condition_level not null,
  windshield condition_level not null,
  lighting condition_level not null,
  observations text,
  client_signature_name text,
  client_validated_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- OBD ----------
create table obd_connections (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  name text not null,
  provider obd_provider not null,
  device_id text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Diagnostics ----------
create table diagnostics (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  vehicle_id uuid not null references vehicles (id) on delete restrict,
  client_id uuid references clients (id) on delete set null,
  user_id uuid not null references profiles (id),
  team_id uuid references teams (id) on delete set null,
  status diagnostic_status not null default 'OPEN',
  symptoms text[] not null default '{}',
  complaint text,
  mileage int,
  ai_analysis jsonb,
  ai_provider text,
  conclusion jsonb, -- { cause_id, summary, confirmed_by_technician, recommended_repair }
  obd_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table obd_sessions (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  vehicle_id uuid references vehicles (id) on delete set null,
  user_id uuid not null references profiles (id),
  team_id uuid references teams (id) on delete set null,
  diagnostic_id uuid references diagnostics (id) on delete set null,
  provider obd_provider not null,
  device_name text,
  vin text,
  dtcs text[] not null default '{}',
  live_data jsonb not null default '[]',
  cleared_dtcs boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int
);

alter table diagnostics add constraint diagnostics_obd_session_fk foreign key (obd_session_id) references obd_sessions (id) on delete set null;

create table diagnostic_codes (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  diagnostic_id uuid not null references diagnostics (id) on delete cascade,
  code text not null check (code ~ '^[PCBU][0-3][0-9A-F]{3}$'),
  description text,
  source text not null check (source in ('OBD', 'MANUAL')),
  created_at timestamptz not null default now(),
  unique (diagnostic_id, code)
);

create table diagnostic_tests (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  diagnostic_id uuid not null references diagnostics (id) on delete cascade,
  dtc text not null,
  step_id text not null,
  title text not null,
  question text not null,
  answer test_answer not null,
  interpretation text not null,
  notes text,
  user_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table diagnostic_results (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  diagnostic_id uuid not null references diagnostics (id) on delete cascade,
  label text not null,
  value text not null,
  unit text,
  notes text,
  user_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table diagnostic_live_data (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  diagnostic_id uuid not null references diagnostics (id) on delete cascade,
  obd_session_id uuid references obd_sessions (id) on delete set null,
  data jsonb not null,
  captured_at timestamptz not null default now()
);

-- ---------- Tarifs, pièces, devis ----------
create table price_catalog (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  category text not null check (category in ('LABOR', 'SERVICE')),
  key text not null,
  label text not null,
  unit_price numeric(12, 2) check (unit_price is null or unit_price >= 0),
  default_hours numeric(8, 2),
  created_at timestamptz not null default now(),
  unique (garage_id, key)
);

create table parts (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  reference text not null,
  name text not null,
  brand text,
  price numeric(12, 2) check (price is null or price >= 0),
  stock int not null default 0 check (stock >= 0),
  supplier text,
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  number text not null,
  client_id uuid references clients (id) on delete set null,
  vehicle_id uuid not null references vehicles (id) on delete restrict,
  team_id uuid references teams (id) on delete set null,
  mechanic_id uuid references profiles (id) on delete set null,
  diagnostic_id uuid references diagnostics (id) on delete set null,
  status quote_status not null default 'DRAFT',
  vat_rate numeric(5, 2) not null default 20,
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  refused_at timestamptz,
  valid_until timestamptz,
  follow_up_at timestamptz,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (garage_id, number)
);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  quote_id uuid not null references quotes (id) on delete cascade,
  kind quote_item_kind not null,
  label text not null,
  reference text,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price numeric(12, 2), -- NULL = « Prix à renseigner »
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Interventions ----------
create table interventions (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  vehicle_id uuid not null references vehicles (id) on delete restrict,
  client_id uuid references clients (id) on delete set null,
  team_id uuid references teams (id) on delete set null,
  mechanic_id uuid references profiles (id) on delete set null,
  title text not null,
  description text,
  status intervention_status not null default 'WAITING',
  scheduled_at timestamptz,
  planned_duration_minutes int,
  actual_duration_minutes int,
  started_at timestamptz,
  completed_at timestamptz,
  parts jsonb not null default '[]',
  diagnostic_id uuid references diagnostics (id) on delete set null,
  quote_id uuid references quotes (id) on delete set null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  intervention_id uuid not null unique references interventions (id) on delete cascade,
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ---------- Photos (Supabase Storage : bucket privé « photos », chemin {garage_id}/...) ----------
create table photos (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  vehicle_id uuid references vehicles (id) on delete cascade,
  entity_type text not null check (entity_type in ('vehicle', 'diagnostic', 'intervention', 'quote', 'intake')),
  entity_id uuid not null,
  user_id uuid not null references profiles (id),
  url text not null,
  caption text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 2097152),
  created_at timestamptz not null default now()
);

-- ---------- Journal d'audit (append-only) ----------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages (id) on delete cascade,
  user_id uuid not null references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Index ----------
create index on garage_members (user_id);
create index on team_members (garage_id, user_id);
create index on clients (garage_id);
create index on vehicles (garage_id, vin);
create index on diagnostics (garage_id, vehicle_id);
create index on diagnostic_codes (garage_id, diagnostic_id);
create index on diagnostic_tests (garage_id, diagnostic_id);
create index on obd_sessions (garage_id, vehicle_id);
create index on interventions (garage_id, scheduled_at);
create index on interventions (garage_id, mechanic_id);
create index on quotes (garage_id, status);
create index on quote_items (garage_id, quote_id);
create index on photos (garage_id, vehicle_id);
create index on audit_logs (garage_id, created_at desc);

-- ---------- Profil créé automatiquement à l'inscription ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'first_name', ''), coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
