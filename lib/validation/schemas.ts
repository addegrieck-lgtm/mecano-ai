import { z } from "zod";
import { CATALOG_CATEGORIES, FUEL_TYPES, INTERVENTION_STATUSES, QUOTE_STATUSES, ROLES } from "@/types";

const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Email invalide");

const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[+\d][\d\s.-]{5,}$/.test(v), "Téléphone invalide");

const optionalNumber = (min = 0, max = 10_000_000) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)) ? null : Number(v)),
    z.number().min(min).max(max).nullable(),
  );

export const garageSchema = z.object({
  name: z.string().trim().min(2, "Nom requis").max(120),
  legal_name: optionalText(160),
  address: optionalText(200),
  postal_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4,5}$/.test(v), "Code postal invalide"),
  city: optionalText(100),
  phone: optionalPhone,
  email: optionalEmail,
  siret: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\s/g, "") : null))
    .refine((v) => v === null || /^\d{14}$/.test(v), "SIRET : 14 chiffres"),
  logo: optionalText(2_000_000),
});

export const garageSettingsSchema = z.object({
  vat_rate: z.coerce.number().min(0).max(100),
  labor_hourly_rate: optionalNumber(0, 10_000),
  workshop_capacity: z.coerce.number().int().min(1).max(500),
  quote_validity_days: z.coerce.number().int().min(1).max(365),
  quote_follow_up_days: z.coerce.number().int().min(1).max(90),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2, "Nom requis").max(80),
  description: optionalText(300),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide"),
  manager_id: z.string().optional().nullable().transform((v) => v || null),
});

export const memberSchema = z.object({
  first_name: z.string().trim().min(1, "Prénom requis").max(80),
  name: z.string().trim().min(1, "Nom requis").max(80),
  email: z.email("Email invalide").trim().max(200),
  phone: optionalPhone,
  role: z.enum(ROLES),
  team_id: z.string().optional().nullable().transform((v) => v || null),
});

export const clientSchema = z.object({
  first_name: z.string().trim().min(1, "Prénom requis").max(80),
  last_name: z.string().trim().min(1, "Nom requis").max(80),
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(250),
  notes: optionalText(2000),
});

export const vehicleSchema = z.object({
  client_id: z.string().optional().nullable().transform((v) => v || null),
  registration: z
    .string()
    .trim()
    .min(2, "Immatriculation requise")
    .max(20)
    .transform((v) => v.toUpperCase()),
  vin: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v === null || /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v), "VIN invalide (11 à 17 caractères, sans I/O/Q)"),
  make: z.string().trim().min(1, "Marque requise").max(60),
  model: z.string().trim().min(1, "Modèle requis").max(60),
  version: optionalText(80),
  year: optionalNumber(1900, 2100),
  engine: optionalText(80),
  fuel: z.enum(FUEL_TYPES),
  mileage: optionalNumber(0, 3_000_000),
  notes: optionalText(2000),
});

export const dtcSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[PCBU][0-3][0-9A-F]{3}$/, "Code défaut invalide (ex. P0302)");

export const diagnosticCreateSchema = z.object({
  vehicle_id: z.string().min(1, "Véhicule requis"),
  team_id: z.string().optional().nullable().transform((v) => v || null),
  symptoms: z.array(z.string().trim().min(1).max(200)).max(30),
  complaint: optionalText(2000),
  mileage: optionalNumber(0, 3_000_000),
  codes: z.array(dtcSchema).max(30),
  obd_session_id: z.string().optional().nullable().transform((v) => v || null),
});

export const diagnosticResultSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(120),
  unit: optionalText(20),
  notes: optionalText(500),
});

export const quoteItemSchema = z.object({
  kind: z.enum(["LABOR", "PART", "SERVICE"]),
  label: z.string().trim().min(1, "Libellé requis").max(200),
  reference: optionalText(80),
  quantity: z.coerce.number().positive("Quantité > 0").max(10_000),
  unit_price: optionalNumber(0, 1_000_000),
});

export const quoteCreateSchema = z.object({
  vehicle_id: z.string().min(1, "Véhicule requis"),
  client_id: z.string().optional().nullable().transform((v) => v || null),
  team_id: z.string().optional().nullable().transform((v) => v || null),
  mechanic_id: z.string().optional().nullable().transform((v) => v || null),
  diagnostic_id: z.string().optional().nullable().transform((v) => v || null),
  notes: optionalText(2000),
  items: z.array(quoteItemSchema).max(100),
});

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);

export const interventionSchema = z.object({
  vehicle_id: z.string().min(1, "Véhicule requis"),
  title: z.string().trim().min(2, "Titre requis").max(150),
  description: optionalText(3000),
  team_id: z.string().optional().nullable().transform((v) => v || null),
  mechanic_id: z.string().optional().nullable().transform((v) => v || null),
  scheduled_at: z.string().optional().nullable().transform((v) => v || null),
  planned_duration_minutes: optionalNumber(0, 100_000),
  diagnostic_id: z.string().optional().nullable().transform((v) => v || null),
  quote_id: z.string().optional().nullable().transform((v) => v || null),
  status: z.enum(INTERVENTION_STATUSES).optional(),
});

export const catalogItemSchema = z.object({
  category: z.enum(CATALOG_CATEGORIES),
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .transform((v) => v.toLowerCase().replace(/[^a-z0-9_]+/g, "_")),
  label: z.string().trim().min(1, "Libellé requis").max(120),
  unit_price: optionalNumber(0, 1_000_000),
  default_hours: optionalNumber(0, 1000),
});

export const partSchema = z.object({
  reference: z.string().trim().min(1, "Référence requise").max(80),
  name: z.string().trim().min(1, "Nom requis").max(150),
  brand: optionalText(80),
  price: optionalNumber(0, 1_000_000),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  supplier: optionalText(120),
});

const condition = z.enum(["OK", "A_SURVEILLER", "DEFAUT"]);
export const intakeSchema = z.object({
  vehicle_id: z.string().min(1, "Véhicule requis"),
  mileage: optionalNumber(0, 3_000_000),
  fuel_level: z.enum(["0", "1/4", "1/2", "3/4", "1"]),
  warning_lights: z.array(z.string().max(60)).max(30),
  bodywork: condition,
  tires: condition,
  rims: condition,
  windshield: condition,
  lighting: condition,
  observations: optionalText(3000),
  client_signature_name: optionalText(120),
  client_validated: z.boolean(),
});

export const reviewSchema = z.object({
  intervention_id: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalText(2000),
});

/** Upload : liste blanche MIME + taille max. Les images sont ré-encodées côté client (supprime EXIF / contenu actif). */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_STORED_PHOTO_BYTES = 2 * 1024 * 1024;

export const photoSchema = z.object({
  entity_type: z.enum(["vehicle", "diagnostic", "intervention", "quote", "intake"]),
  entity_id: z.string().min(1),
  vehicle_id: z.string().optional().nullable().transform((v) => v || null),
  caption: optionalText(200),
  mime_type: z.enum(["image/jpeg", "image/webp", "image/png"]),
  size_bytes: z.number().int().positive().max(MAX_STORED_PHOTO_BYTES, "Image trop lourde après compression"),
  url: z
    .string()
    .refine((v) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^https:\/\//.test(v), "Format d'image non autorisé"),
});

export type ClientInput = z.input<typeof clientSchema>;
export type VehicleInput = z.input<typeof vehicleSchema>;
export type TeamInput = z.input<typeof teamSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type QuoteItemInput = z.input<typeof quoteItemSchema>;
export type InterventionInput = z.input<typeof interventionSchema>;
export type IntakeInput = z.input<typeof intakeSchema>;

/** Transforme une erreur Zod en dictionnaire { champ: message } pour les formulaires. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export class ValidationError extends Error {
  constructor(public fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Données invalides");
    this.name = "ValidationError";
  }
}

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(fieldErrors(r.error));
  return r.data;
}
