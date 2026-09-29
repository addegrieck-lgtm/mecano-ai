/**
 * Connecteurs futurs — INTERFACES UNIQUEMENT (non implémentées dans le MVP 0 €).
 * Chaque intégration pourra être ajoutée sans modifier le cœur métier.
 * Déjà implémentés ailleurs : AIProvider (lib/ai), OBDProvider (lib/obd), VoiceInputProvider (lib/voice).
 */

// ---------- Fournisseurs de pièces (Phase 5) ----------
export interface PartSearchQuery {
  vin?: string;
  make?: string;
  model?: string;
  engine?: string;
  keyword: string;
}
export interface SupplierPart {
  supplierId: string;
  reference: string;
  name: string;
  brand?: string;
  priceHT?: number; // prix réel du fournisseur, jamais estimé
  availability: "IN_STOCK" | "ON_ORDER" | "UNAVAILABLE" | "UNKNOWN";
  deliveryEta?: string;
  compatible?: boolean | null; // null = compatibilité non confirmée
}
export interface PartsProvider {
  readonly name: string;
  search(query: PartSearchQuery): Promise<SupplierPart[]>;
  checkAvailability(reference: string): Promise<SupplierPart | null>;
  order(lines: { reference: string; quantity: number }[], garageRef: string): Promise<{ orderId: string }>;
}

// ---------- Données véhicule (décodage VIN, plaques) ----------
export interface VehicleIdentity {
  vin?: string;
  registration?: string;
  make?: string;
  model?: string;
  version?: string;
  engine?: string;
  year?: number;
  fuel?: string;
}
export interface VehicleDataProvider {
  readonly name: string;
  decodeVin(vin: string): Promise<VehicleIdentity | null>;
  lookupRegistration(registration: string): Promise<VehicleIdentity | null>;
}

// ---------- Données techniques licenciées (Phase 4) ----------
/** Uniquement des sources légalement accessibles / sous licence. Aucun scraping. */
export interface TechnicalDataProvider {
  readonly name: string;
  readonly license: string;
  getProcedure(vehicle: VehicleIdentity, operation: string): Promise<{ steps: string[]; source: string } | null>;
  getTorqueSpecs(vehicle: VehicleIdentity, component: string): Promise<{ value: number; unit: string; source: string }[] | null>;
  getLaborTime(vehicle: VehicleIdentity, operation: string): Promise<{ hours: number; source: string } | null>;
}

// ---------- Messagerie (relances devis, notifications) ----------
export type MessageChannel = "EMAIL" | "SMS" | "WHATSAPP";
export interface MessagingProvider {
  readonly name: string;
  readonly channels: MessageChannel[];
  send(message: { channel: MessageChannel; to: string; subject?: string; body: string; garageId: string }): Promise<{ id: string }>;
}

// ---------- Paiement / abonnement SaaS (Phase 3 — Stripe non connecté) ----------
export interface PaymentProvider {
  readonly name: string;
  createCheckout(params: { garageId: string; planId: string; successUrl: string; cancelUrl: string }): Promise<{ url: string }>;
  getSubscription(garageId: string): Promise<{ planId: string; status: "active" | "past_due" | "canceled" | "trialing" } | null>;
  cancelSubscription(garageId: string): Promise<void>;
}

// ---------- Comptabilité / facturation ----------
export interface AccountingProvider {
  readonly name: string;
  exportInvoice(invoice: { number: string; date: string; clientName: string; totalHT: number; vat: number; totalTTC: number; lines: { label: string; quantity: number; unitPriceHT: number }[] }): Promise<{ externalId: string }>;
}

// ---------- Avis clients (Google, etc.) ----------
export interface ReviewProvider {
  readonly name: string;
  /** Renvoie un lien d'avis à proposer au client — aucune publication automatique. */
  getReviewLink(garageId: string): Promise<string | null>;
}
