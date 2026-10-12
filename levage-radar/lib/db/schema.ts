/**
 * LEVAGE RADAR — schéma PostgreSQL (Drizzle ORM).
 *
 * Organisation :
 *  - Socle : organisations, utilisateurs, sessions, audit.
 *  - Commercial (données publiques, partagées entre organisations) : sources, synchronisations,
 *    avis officiels bruts, opportunités normalisées, lots, historique, acheteurs.
 *  - Commercial (suivi propre à chaque organisation) : suivi, notes, tâches, alertes, recherches, rapports quotidiens.
 *  - Rapports : clients, sites, modèles versionnés, missions, éléments, relevés, observations, pièces jointes.
 *
 * Toute table « métier » d'une organisation porte org_id ; les services filtrent systématiquement dessus.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

// ---------------------------------------------------------------------------
// Socle
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Paramètres : surcharges de permissions, IA externe autorisée, statuts, préférences de veille. */
  settings: jsonb("settings").$type<OrgSettings>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type OrgSettings = {
  rolePermissions?: Record<string, string[]>;
  allowExternalAi?: boolean;
  missionStatusLabels?: Record<string, string>;
  retentionDays?: { audit?: number; archivedMissions?: number };
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    extraPermissions: text("extra_permissions").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    previousLoginAt: ts("previous_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`), index("users_org_idx").on(t.orgId)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 du jeton : le jeton en clair n'est jamais stocké. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_attempts_key_idx").on(t.key, t.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_entity_idx").on(t.orgId, t.entityType, t.entityId),
    index("audit_org_date_idx").on(t.orgId, t.createdAt),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  homeDepartment: text("home_department"),
  radiusKm: integer("radius_km"),
  preferredDepartments: text("preferred_departments").array().notNull().default(sql`'{}'::text[]`),
  domains: text("domains").array().notNull().default(sql`'{LEVAGE,ELECTRICITE}'::text[]`),
  digestFrequency: text("digest_frequency").notNull().default("daily"), // daily | weekly | off
  emailEnabled: boolean("email_enabled").notNull().default(false),
  /** Date de référence « depuis ma dernière visite » du radar. */
  lastSeenOpportunitiesAt: ts("last_seen_opportunities_at"),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Commercial — données publiques collectées (partagées)
// ---------------------------------------------------------------------------

export const sources = pgTable("sources", {
  /** Identifiant stable du connecteur (ex. « boamp », « ted »). Métadonnées descriptives : lib/connectors. */
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: ts("last_run_at"),
  lastSuccessAt: ts("last_success_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastItemCount: integer("last_item_count"),
  /** Curseur incrémental (ex. dernière date de publication traitée). */
  cursor: jsonb("cursor").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    trigger: text("trigger").notNull(), // cron | manual | retry | cli
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull(), // running | success | partial | failed
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    fetched: integer("fetched").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    unchanged: integer("unchanged").notNull().default(0),
    merged: integer("merged").notNull().default(0),
    irrelevant: integer("irrelevant").notNull().default(0),
    errors: jsonb("errors").$type<string[]>().notNull().default([]),
  },
  (t) => [index("sync_runs_source_idx").on(t.sourceId, t.startedAt)],
);

export const buyers = pgTable(
  "buyers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    kind: text("kind").notNull().default("unknown"), // public | private | unknown
    orgType: text("org_type"), // collectivité, hôpital, État, entreprise…
    sector: text("sector"),
    country: text("country"),
    department: text("department"),
    city: text("city"),
    nationalId: text("national_id"), // SIRET ou identifiant officiel publié
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("buyers_norm_uq").on(t.normalizedName, t.isDemo)],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    description: text("description"),
    buyerId: uuid("buyer_id").references(() => buyers.id, { onDelete: "set null" }),
    buyerName: text("buyer_name"),
    country: text("country"),
    region: text("region"),
    department: text("department"),
    city: text("city"),
    address: text("address"),
    /** LEVAGE | ELECTRICITE | MIXTE | AUCUN */
    domain: text("domain").notNull(),
    /** Voir lib/radar/categories.ts */
    category: text("category").notNull(),
    /** INSPECTION | MAINTENANCE | TRAVAUX | FOURNITURE | MULTISERVICE | AUTRE */
    serviceType: text("service_type").notNull(),
    isPublic: boolean("is_public").notNull().default(true),
    publishedAt: date("published_at", { mode: "string" }),
    deadlineAt: ts("deadline_at"),
    sourceUpdatedAt: ts("source_updated_at"),
    awardedAt: date("awarded_at", { mode: "string" }),
    /** Montant tel que publié par la source (jamais calculé). */
    publishedAmount: numeric("published_amount"),
    amountCurrency: text("amount_currency"),
    durationText: text("duration_text"),
    selectionCriteria: text("selection_criteria"),
    procedureType: text("procedure_type"),
    noticeType: text("notice_type"),
    cpvCodes: text("cpv_codes").array().notNull().default(sql`'{}'::text[]`),
    reference: text("reference"),
    officialUrl: text("official_url"),
    primarySourceId: text("primary_source_id").references(() => sources.id),
    collectedAt: ts("collected_at").notNull().defaultNow(),
    /** high | medium | low : qualité des données de la source (structurée, complète…). */
    reliability: text("reliability").notNull(),
    relevanceReason: text("relevance_reason").notNull(),
    classification: jsonb("classification").$type<ClassificationDetails>().notNull(),
    baseScore: integer("base_score").notNull(),
    scoreFactors: jsonb("score_factors").$type<ScoreFactor[]>().notNull().default([]),
    /** Données de démonstration : jamais mélangées aux données réelles (filtrées partout). */
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("opp_published_idx").on(t.publishedAt),
    index("opp_deadline_idx").on(t.deadlineAt),
    index("opp_domain_cat_idx").on(t.domain, t.category),
    index("opp_buyer_idx").on(t.buyerId),
    index("opp_dept_idx").on(t.department),
    index("opp_norm_title_idx").on(t.normalizedTitle),
    index("opp_fts_idx").using(
      "gin",
      sql`to_tsvector('french', coalesce(${t.title}, '') || ' ' || coalesce(${t.description}, '') || ' ' || coalesce(${t.buyerName}, ''))`,
    ),
  ],
);

export type ClassificationDetails = {
  levageScore: number;
  electriciteScore: number;
  matchedTerms: { term: string; domain: "LEVAGE" | "ELECTRICITE"; weight: number; field: string }[];
  matchedCpv: { code: string; label: string; domain: string; serviceType: string }[];
  inspectionSignals: string[];
  worksSignals: string[];
  multiservice: boolean;
  explanation: string[];
};

export type ScoreFactor = { label: string; points: number; kind: "base" | "personal" };

/** Avis officiels bruts : un par (source, référence). Plusieurs avis peuvent alimenter une opportunité. */
export const notices = pgTable(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    sourceRef: text("source_ref").notNull(),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    url: text("url"),
    title: text("title").notNull(),
    noticeType: text("notice_type"),
    publishedAt: date("published_at", { mode: "string" }),
    /** Références croisées publiées par la source (ex. numéro TED cité par un avis BOAMP). */
    crossRefs: text("cross_refs").array().notNull().default(sql`'{}'::text[]`),
    contentHash: text("content_hash").notNull(),
    raw: jsonb("raw").$type<unknown>(),
    licence: text("licence"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    uniqueIndex("notices_source_ref_uq").on(t.sourceId, t.sourceRef),
    index("notices_opp_idx").on(t.opportunityId),
  ],
);

export const lots = pgTable(
  "lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    lotNumber: text("lot_number"),
    title: text("title").notNull(),
    description: text("description"),
    cpvCodes: text("cpv_codes").array().notNull().default(sql`'{}'::text[]`),
    domain: text("domain").notNull(),
    relevant: boolean("relevant").notNull().default(false),
  },
  (t) => [index("lots_opp_idx").on(t.opportunityId)],
);

export const opportunityHistory = pgTable(
  "opportunity_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // created | updated | merged
    sourceId: text("source_id"),
    noticeRef: text("notice_ref"),
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("opp_hist_idx").on(t.opportunityId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Commercial — suivi propre à chaque organisation
// ---------------------------------------------------------------------------

export const opportunityTracking = pgTable(
  "opportunity_tracking",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    /** NOUVEAU | EN_ANALYSE | EN_PREPARATION | TRANSMIS_MANUELLEMENT | NON_PERTINENT | ARCHIVE */
    status: text("status").notNull().default("NOUVEAU"),
    favorite: boolean("favorite").notNull().default(false),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dismissReason: text("dismiss_reason"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.opportunityId] }), index("tracking_status_idx").on(t.orgId, t.status)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // opportunity | buyer
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("notes_entity_idx").on(t.orgId, t.entityType, t.entityId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id").references(() => buyers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: ts("due_at"),
    remindAt: ts("remind_at"),
    reminderSentAt: ts("reminder_sent_at"),
    doneAt: ts("done_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_org_idx").on(t.orgId, t.doneAt, t.dueAt), index("tasks_opp_idx").on(t.opportunityId)],
);

export const watchAlerts = pgTable(
  "watch_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** buyer | keyword | department | family */
    kind: text("kind").notNull(),
    criteria: jsonb("criteria").$type<{ buyerId?: string; keyword?: string; department?: string; family?: string; domain?: string }>().notNull(),
    active: boolean("active").notNull().default(true),
    lastCheckedAt: ts("last_checked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("alerts_org_idx").on(t.orgId, t.userId)],
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: text("query").notNull(), // chaîne de paramètres d'URL
    createdAt: createdAt(),
  },
  (t) => [index("saved_searches_user_idx").on(t.userId)],
);

export const dailyReports = pgTable(
  "daily_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reportDate: date("report_date", { mode: "string" }).notNull(),
    /** ok | degraded (au moins une source en échec) | failed (aucune source n'a fonctionné) */
    status: text("status").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    generatedAt: ts("generated_at").notNull().defaultNow(),
    emailedAt: ts("emailed_at"),
    emailError: text("email_error"),
  },
  (t) => [uniqueIndex("daily_reports_uq").on(t.orgId, t.reportDate)],
);

// ---------------------------------------------------------------------------
// Rapports d'inspection (levage & électricité)
// ---------------------------------------------------------------------------

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nationalId: text("national_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_org_idx").on(t.orgId)],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    postalCode: text("postal_code"),
    city: text("city"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sites_client_idx").on(t.orgId, t.clientId)],
);

export const missionTemplates = pgTable(
  "mission_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(), // LEVAGE | ELECTRICITE
    name: text("name").notNull(),
    description: text("description"),
    archived: boolean("archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("templates_org_idx").on(t.orgId, t.domain)],
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => missionTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** Définition validée par Zod : lib/reports/template-schema.ts */
    definition: jsonb("definition").$type<unknown>().notNull(),
    /** draft | validated | retired. Seule une version validée permet de créer une mission. */
    status: text("status").notNull().default("draft"),
    changeNote: text("change_note"),
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    validatedAt: ts("validated_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("template_versions_uq").on(t.templateId, t.version)],
);

export const missions = pgTable(
  "missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    templateVersionId: uuid("template_version_id")
      .notNull()
      .references(() => templateVersions.id),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    internalRef: text("internal_ref"),
    address: text("address"),
    scheduledAt: ts("scheduled_at"),
    inspectorId: uuid("inspector_id").references(() => users.id, { onDelete: "set null" }),
    /** BROUILLON | EN_SAISIE | A_COMPLETER | PRET_RELECTURE | PRET_OUTIL_OFFICIEL | ARCHIVE */
    status: text("status").notNull().default("BROUILLON"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    pendingFields: text("pending_fields").array().notNull().default(sql`'{}'::text[]`),
    generalNotes: text("general_notes"),
    /** Version optimiste : toute écriture doit fournir la version lue (anti-écrasement silencieux). */
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("missions_org_idx").on(t.orgId, t.domain, t.status), index("missions_inspector_idx").on(t.inspectorId)],
);

export const missionItems = pgTable(
  "mission_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    /** Clé du type d'élément dans le modèle (équipement de levage, tableau, circuit, zone…). */
    itemType: text("item_type").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    pendingFields: text("pending_fields").array().notNull().default(sql`'{}'::text[]`),
    remainingChecks: text("remaining_checks"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("items_mission_idx").on(t.missionId, t.position)],
);

export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => missionItems.id, { onDelete: "cascade" }),
    measurementType: text("measurement_type").notNull(),
    label: text("label").notNull(),
    /** Valeur saisie telle quelle par l'inspecteur (jamais générée). */
    value: numeric("value").notNull(),
    unit: text("unit").notNull(),
    measuredAt: ts("measured_at").notNull(),
    instrument: text("instrument"),
    context: text("context"),
    origin: text("origin").notNull().default("saisie"), // saisie | import
    enteredBy: uuid("entered_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("measurements_mission_idx").on(t.missionId, t.itemId)],
);

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => missionItems.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // observation | anomalie
    description: text("description").notNull(),
    location: text("location"),
    measurementId: uuid("measurement_id").references(() => measurements.id, { onDelete: "set null" }),
    /** Priorité INTERNE configurable par le modèle — n'est pas un niveau réglementaire. */
    internalPriority: text("internal_priority"),
    technicalReference: text("technical_reference"),
    referenceVerified: boolean("reference_verified").notNull().default(false),
    inspectorComment: text("inspector_comment"),
    treatmentStatus: text("treatment_status").notNull().default("a_traiter"),
    needsVerification: boolean("needs_verification").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("observations_mission_idx").on(t.missionId, t.itemId)],
);

export const fileBlobs = pgTable("file_blobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => missionItems.id, { onDelete: "set null" }),
    observationId: uuid("observation_id").references(() => observations.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // photo | document
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    blobId: uuid("blob_id").references(() => fileBlobs.id, { onDelete: "set null" }),
    caption: text("caption"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("attachments_mission_idx").on(t.missionId)],
);

/** Versions figées d'un dossier (enregistrement d'une version / export). */
export const missionSnapshots = pgTable(
  "mission_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    missionVersion: integer("mission_version").notNull(),
    label: text("label").notNull(),
    snapshot: jsonb("snapshot").$type<unknown>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("snapshots_mission_idx").on(t.missionId, t.createdAt)],
);

export const exportsLog = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // opportunities_csv | opportunity_pdf | mission_pdf | mission_json | …
    entityId: text("entity_id"),
    filename: text("filename").notNull(),
    rowCount: integer("row_count"),
    createdAt: createdAt(),
  },
  (t) => [index("exports_org_idx").on(t.orgId, t.createdAt)],
);
