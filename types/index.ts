// Types métier MECANO AI.
// Les noms de champs sont en snake_case pour correspondre 1:1 aux colonnes PostgreSQL/Supabase.

export type ID = string;
export type ISODate = string;

export const ROLES = ["OWNER", "ADMIN", "TEAM_MANAGER", "MECHANIC", "RECEPTION", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export interface GarageSettings {
  vat_rate: number; // en %, ex. 20
  labor_hourly_rate?: number | null; // tarif horaire défini par le garage (aucune valeur inventée)
  workshop_capacity: number; // nombre de véhicules simultanés
  quote_validity_days: number;
  quote_follow_up_days: number;
  currency: "EUR";
}

export interface Garage {
  id: ID;
  name: string;
  legal_name?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
  siret?: string | null;
  settings: GarageSettings;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface Profile {
  id: ID;
  name: string; // nom de famille
  first_name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  role?: Role | null; // rôle "par défaut" (informatif) ; le rôle effectif est porté par garage_members
  created_at: ISODate;
}

export interface GarageMember {
  id: ID;
  garage_id: ID;
  user_id: ID;
  role: Role;
  team_id?: ID | null; // équipe principale
  permissions: string[]; // permissions additionnelles (extensible)
  created_at: ISODate;
}

export interface Team {
  id: ID;
  garage_id: ID;
  name: string;
  description?: string | null;
  color: string;
  manager_id?: ID | null;
  created_at: ISODate;
}

export interface TeamMember {
  id: ID;
  garage_id: ID;
  team_id: ID;
  user_id: ID;
  created_at: ISODate;
}

export interface Client {
  id: ID;
  garage_id: ID;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export const FUEL_TYPES = ["DIESEL", "ESSENCE", "HYBRIDE", "HYBRIDE_RECHARGEABLE", "ELECTRIQUE", "GPL", "AUTRE"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export interface Vehicle {
  id: ID;
  garage_id: ID;
  client_id?: ID | null;
  registration: string; // immatriculation
  vin?: string | null;
  make: string; // marque
  model: string; // modèle
  version?: string | null;
  year?: number | null;
  engine?: string | null;
  fuel: FuelType;
  mileage?: number | null;
  notes?: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export const DIAGNOSTIC_STATUSES = ["OPEN", "ANALYSIS", "TESTING", "CONCLUDED", "CLOSED"] as const;
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number];

export interface DiagnosticConclusion {
  cause_id?: string | null; // identifiant de cause du moteur de règles
  summary: string;
  confirmed_by_technician: boolean; // une conclusion n'est jamais "certaine" sans validation humaine
  recommended_repair?: string | null;
}

export interface Diagnostic {
  id: ID;
  garage_id: ID;
  vehicle_id: ID;
  client_id?: ID | null;
  user_id: ID;
  team_id?: ID | null;
  status: DiagnosticStatus;
  symptoms: string[];
  complaint?: string | null; // description libre du client
  mileage?: number | null;
  ai_analysis?: unknown | null; // DiagnosisResult sérialisé
  ai_provider?: string | null;
  conclusion?: DiagnosticConclusion | null;
  obd_session_id?: ID | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface DiagnosticCode {
  id: ID;
  garage_id: ID;
  diagnostic_id: ID;
  code: string;
  description?: string | null;
  source: "OBD" | "MANUAL";
  created_at: ISODate;
}

export type TestAnswer = "YES" | "NO" | "UNKNOWN";

export interface DiagnosticTestRecord {
  id: ID;
  garage_id: ID;
  diagnostic_id: ID;
  dtc: string;
  step_id: string;
  title: string;
  question: string;
  answer: TestAnswer;
  interpretation: string;
  notes?: string | null;
  user_id: ID;
  created_at: ISODate;
}

export interface DiagnosticResult {
  id: ID;
  garage_id: ID;
  diagnostic_id: ID;
  label: string; // ex. "Compression cylindre 2"
  value: string; // valeur mesurée par le technicien (jamais générée)
  unit?: string | null;
  notes?: string | null;
  user_id: ID;
  created_at: ISODate;
}

export interface VehicleLiveData {
  rpm?: number;
  speed?: number;
  coolantTemperature?: number;
  batteryVoltage?: number;
  engineLoad?: number;
  throttlePosition?: number;
  intakeAirTemperature?: number;
  shortFuelTrimB1?: number;
  longFuelTrimB1?: number;
}

export interface DiagnosticLiveData {
  id: ID;
  garage_id: ID;
  diagnostic_id: ID;
  obd_session_id?: ID | null;
  data: VehicleLiveData;
  captured_at: ISODate;
}

export interface ObdConnection {
  id: ID;
  garage_id: ID;
  name: string;
  provider: "SIMULATOR" | "BLUETOOTH";
  device_id?: string | null;
  last_used_at?: ISODate | null;
  created_at: ISODate;
}

export interface ObdSession {
  id: ID;
  garage_id: ID;
  vehicle_id?: ID | null;
  user_id: ID;
  team_id?: ID | null;
  diagnostic_id?: ID | null;
  provider: "SIMULATOR" | "BLUETOOTH";
  device_name?: string | null;
  vin?: string | null;
  dtcs: string[];
  live_data: VehicleLiveData[];
  cleared_dtcs: boolean;
  started_at: ISODate;
  ended_at?: ISODate | null;
  duration_seconds?: number | null;
}

export const INTERVENTION_STATUSES = ["WAITING", "IN_PROGRESS", "WAITING_PART", "COMPLETED", "CANCELLED"] as const;
export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];

export interface InterventionPart {
  part_id?: ID | null;
  name: string;
  reference?: string | null;
  quantity: number;
}

export interface Intervention {
  id: ID;
  garage_id: ID;
  vehicle_id: ID;
  client_id?: ID | null;
  team_id?: ID | null;
  mechanic_id?: ID | null;
  title: string;
  description?: string | null;
  status: InterventionStatus;
  scheduled_at?: ISODate | null;
  planned_duration_minutes?: number | null;
  actual_duration_minutes?: number | null;
  started_at?: ISODate | null;
  completed_at?: ISODate | null;
  parts: InterventionPart[];
  diagnostic_id?: ID | null;
  quote_id?: ID | null;
  created_by: ID;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface Part {
  id: ID;
  garage_id: ID;
  reference: string;
  name: string;
  brand?: string | null;
  price?: number | null; // prix HT défini par le garage
  stock: number;
  supplier?: string | null;
  created_at: ISODate;
}

export const CATALOG_CATEGORIES = ["LABOR", "SERVICE"] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export interface PriceCatalogItem {
  id: ID;
  garage_id: ID;
  category: CatalogCategory;
  key: string; // ex. "labor_hour", "diagnostic", "vidange"
  label: string;
  unit_price?: number | null; // HT
  default_hours?: number | null; // temps garage (pas un temps constructeur)
  created_at: ISODate;
}

export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REFUSED", "EXPIRED"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export type QuoteItemKind = "LABOR" | "PART" | "SERVICE";

export interface Quote {
  id: ID;
  garage_id: ID;
  number: string;
  client_id?: ID | null;
  vehicle_id: ID;
  team_id?: ID | null;
  mechanic_id?: ID | null;
  diagnostic_id?: ID | null;
  status: QuoteStatus;
  vat_rate: number;
  notes?: string | null;
  sent_at?: ISODate | null;
  accepted_at?: ISODate | null;
  refused_at?: ISODate | null;
  valid_until?: ISODate | null;
  follow_up_at?: ISODate | null;
  created_by: ID;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface QuoteItem {
  id: ID;
  garage_id: ID;
  quote_id: ID;
  kind: QuoteItemKind;
  label: string;
  reference?: string | null;
  quantity: number;
  unit_price: number | null; // null = "Prix à renseigner"
  position: number;
  created_at: ISODate;
}

export type PhotoEntity = "vehicle" | "diagnostic" | "intervention" | "quote" | "intake";

export interface Photo {
  id: ID;
  garage_id: ID;
  vehicle_id?: ID | null;
  entity_type: PhotoEntity;
  entity_id: ID;
  user_id: ID;
  url: string; // data URL en mode démo, chemin Supabase Storage sinon
  caption?: string | null;
  mime_type: string;
  size_bytes: number;
  created_at: ISODate;
}

export type FuelLevel = "0" | "1/4" | "1/2" | "3/4" | "1";
export type ConditionLevel = "OK" | "A_SURVEILLER" | "DEFAUT";

export interface VehicleIntake {
  id: ID;
  garage_id: ID;
  vehicle_id: ID;
  client_id?: ID | null;
  user_id: ID;
  mileage?: number | null;
  fuel_level: FuelLevel;
  warning_lights: string[];
  bodywork: ConditionLevel;
  tires: ConditionLevel;
  rims: ConditionLevel;
  windshield: ConditionLevel;
  lighting: ConditionLevel;
  observations?: string | null;
  client_signature_name?: string | null;
  client_validated_at?: ISODate | null;
  created_at: ISODate;
}

export interface Review {
  id: ID;
  garage_id: ID;
  intervention_id: ID;
  vehicle_id: ID;
  client_id?: ID | null;
  rating: number;
  comment?: string | null;
  created_at: ISODate;
}

export interface AuditLog {
  id: ID;
  garage_id: ID;
  user_id: ID;
  action: string;
  entity_type: string;
  entity_id?: ID | null;
  details?: Record<string, unknown> | null;
  created_at: ISODate;
}

// Registre des tables — utilisé par le DataStore générique.
export interface Tables {
  profiles: Profile;
  garages: Garage;
  garage_members: GarageMember;
  teams: Team;
  team_members: TeamMember;
  clients: Client;
  vehicles: Vehicle;
  diagnostics: Diagnostic;
  diagnostic_codes: DiagnosticCode;
  diagnostic_tests: DiagnosticTestRecord;
  diagnostic_results: DiagnosticResult;
  diagnostic_live_data: DiagnosticLiveData;
  obd_connections: ObdConnection;
  obd_sessions: ObdSession;
  interventions: Intervention;
  parts: Part;
  price_catalog: PriceCatalogItem;
  quotes: Quote;
  quote_items: QuoteItem;
  photos: Photo;
  vehicle_intakes: VehicleIntake;
  reviews: Review;
  audit_logs: AuditLog;
}

export type TableName = keyof Tables;

/** Tables métier rattachées à un garage (isolation multi-tenant). */
export const TENANT_TABLES = [
  "garage_members",
  "teams",
  "team_members",
  "clients",
  "vehicles",
  "diagnostics",
  "diagnostic_codes",
  "diagnostic_tests",
  "diagnostic_results",
  "diagnostic_live_data",
  "obd_connections",
  "obd_sessions",
  "interventions",
  "parts",
  "price_catalog",
  "quotes",
  "quote_items",
  "photos",
  "vehicle_intakes",
  "reviews",
  "audit_logs",
] as const satisfies readonly TableName[];

export type TenantTable = (typeof TENANT_TABLES)[number];
