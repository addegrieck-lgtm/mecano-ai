import type { Snapshot } from "@/lib/data/store";
import { evaluate, getRule, outcomeFor } from "@/lib/diagnostics/engine";
import type {
  Client,
  Diagnostic,
  DiagnosticCode,
  DiagnosticTestRecord,
  Garage,
  GarageMember,
  Intervention,
  Part,
  PriceCatalogItem,
  Profile,
  Quote,
  QuoteItem,
  Review,
  Role,
  Team,
  TeamMember,
  Vehicle,
  VehicleIntake,
  AuditLog,
  TestAnswer,
} from "@/types";

/**
 * Données de DÉMONSTRATION — fictives.
 * Les tarifs du catalogue sont des tarifs « garage » d'exemple, modifiables dans Paramètres.
 * Les références pièces sont préfixées DEMO- (aucune référence fabricant réelle).
 * Les dates sont calculées par rapport au jour courant pour que le planning soit toujours vivant.
 */

export const DEMO_DEFAULT_USER = "u-paul";
export const DEMO_DEFAULT_GARAGE = "g-dupont";

export function buildDemoSnapshot(now = new Date()): Snapshot {
  const day = (offset: number, h = 9, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const created = day(-200);

  // ---------------- Garages ----------------
  const garages: Garage[] = [
    {
      id: "g-dupont",
      name: "Garage Dupont",
      legal_name: "SARL Garage Dupont",
      address: "12 rue des Artisans",
      postal_code: "69003",
      city: "Lyon",
      phone: "04 78 00 00 01",
      email: "contact@garage-dupont.demo",
      logo: null,
      siret: null,
      settings: { vat_rate: 20, labor_hourly_rate: 68, workshop_capacity: 8, quote_validity_days: 30, quote_follow_up_days: 3, currency: "EUR" },
      created_at: created,
      updated_at: created,
    },
    {
      id: "g-martin",
      name: "Garage Martin",
      legal_name: "Martin Auto Services",
      address: "4 avenue de la Gare",
      postal_code: "38000",
      city: "Grenoble",
      phone: "04 76 00 00 02",
      email: "atelier@garage-martin.demo",
      logo: null,
      siret: null,
      settings: { vat_rate: 20, labor_hourly_rate: 62, workshop_capacity: 5, quote_validity_days: 30, quote_follow_up_days: 5, currency: "EUR" },
      created_at: created,
      updated_at: created,
    },
  ];

  // ---------------- Utilisateurs ----------------
  const people: [string, string, string, string][] = [
    ["u-paul", "Paul", "Dupont", "paul.dupont"],
    ["u-sophie", "Sophie", "Lambert", "sophie.lambert"],
    ["u-thomas", "Thomas", "Girard", "thomas.girard"],
    ["u-julien", "Julien", "Moreau", "julien.moreau"],
    ["u-lucas", "Lucas", "Petit", "lucas.petit"],
    ["u-karim", "Karim", "Benali", "karim.benali"],
    ["u-nina", "Nina", "Roux", "nina.roux"],
    ["u-emma", "Emma", "Leroy", "emma.leroy"],
    ["u-marc", "Marc", "Faure", "marc.faure"],
    ["u-claire", "Claire", "Martin", "claire.martin"],
    ["u-hugo", "Hugo", "Blanc", "hugo.blanc"],
    ["u-lea", "Léa", "Fontaine", "lea.fontaine"],
    ["u-alex", "Alex", "Mercier", "alex.mercier"],
  ];
  const profiles: Profile[] = people.map(([id, first_name, name, mail]) => ({ id, first_name, name, email: `${mail}@mecano.demo`, phone: null, avatar: null, role: null, created_at: created }));

  const teams: Team[] = [
    { id: "t-dup-meca", garage_id: "g-dupont", name: "Équipe mécanique", description: "Entretien, freinage, distribution, réparations", color: "#f97316", manager_id: "u-thomas", created_at: created },
    { id: "t-dup-diag", garage_id: "g-dupont", name: "Équipe diagnostic", description: "Diagnostic électronique et OBD", color: "#38bdf8", manager_id: "u-karim", created_at: created },
    { id: "t-dup-recep", garage_id: "g-dupont", name: "Équipe réception", description: "Accueil clients, devis, restitution", color: "#a3a3a3", manager_id: null, created_at: created },
    { id: "t-mar-meca", garage_id: "g-martin", name: "Équipe mécanique", description: null, color: "#f97316", manager_id: null, created_at: created },
    { id: "t-mar-carro", garage_id: "g-martin", name: "Équipe carrosserie", description: "Carrosserie et peinture", color: "#a78bfa", manager_id: "u-lea", created_at: created },
  ];

  const memberships: [string, string, Role, string | null][] = [
    ["g-dupont", "u-paul", "OWNER", null],
    ["g-dupont", "u-sophie", "ADMIN", null],
    ["g-dupont", "u-thomas", "TEAM_MANAGER", "t-dup-meca"],
    ["g-dupont", "u-julien", "MECHANIC", "t-dup-meca"],
    ["g-dupont", "u-lucas", "MECHANIC", "t-dup-meca"],
    ["g-dupont", "u-karim", "TEAM_MANAGER", "t-dup-diag"],
    ["g-dupont", "u-nina", "MECHANIC", "t-dup-diag"],
    ["g-dupont", "u-emma", "RECEPTION", "t-dup-recep"],
    ["g-dupont", "u-marc", "VIEWER", null],
    ["g-dupont", "u-alex", "MECHANIC", "t-dup-diag"],
    ["g-martin", "u-claire", "OWNER", null],
    ["g-martin", "u-hugo", "MECHANIC", "t-mar-meca"],
    ["g-martin", "u-lea", "TEAM_MANAGER", "t-mar-carro"],
    ["g-martin", "u-alex", "ADMIN", null],
  ];
  const garage_members: GarageMember[] = memberships.map(([garage_id, user_id, role, team_id]) => ({ id: `m-${garage_id}-${user_id}`, garage_id, user_id, role, team_id, permissions: [], created_at: created }));
  const team_members: TeamMember[] = memberships
    .filter(([, , , t]) => t)
    .map(([garage_id, user_id, , team_id]) => ({ id: `tm-${team_id}-${user_id}`, garage_id, team_id: team_id!, user_id, created_at: created }));

  // ---------------- Clients & véhicules ----------------
  const c = (id: string, garage_id: string, first_name: string, last_name: string, phone: string, email: string | null, address: string | null, notes: string | null = null): Client => ({
    id,
    garage_id,
    first_name,
    last_name,
    phone,
    email,
    address,
    notes,
    created_at: created,
    updated_at: created,
  });
  const clients: Client[] = [
    c("c-jean", "g-dupont", "Jean", "Dupont", "06 12 34 56 78", "jean.dupont@exemple.demo", "5 place Bellecour, 69002 Lyon", "Client fidèle — préfère être appelé le matin."),
    c("c-marie", "g-dupont", "Marie", "Lefèvre", "06 22 33 44 55", "marie.lefevre@exemple.demo", "18 cours Lafayette, 69003 Lyon"),
    c("c-ahmed", "g-dupont", "Ahmed", "Haddad", "07 11 22 33 44", "ahmed.haddad@exemple.demo", null),
    c("c-claire-b", "g-dupont", "Claire", "Bernard", "06 55 66 77 88", null, "2 rue Garibaldi, 69006 Lyon"),
    c("c-lucie", "g-dupont", "Lucie", "Garnier", "06 99 88 77 66", "lucie.garnier@exemple.demo", null, "Flotte entreprise (2 véhicules)."),
    c("c-paulette", "g-martin", "Paulette", "Rivière", "06 10 20 30 40", null, "Grenoble"),
    c("c-yann", "g-martin", "Yann", "Morel", "06 50 60 70 80", "yann.morel@exemple.demo", null),
  ];

  const v = (
    id: string,
    garage_id: string,
    client_id: string,
    registration: string,
    vin: string | null,
    make: string,
    model: string,
    version: string,
    year: number,
    engine: string,
    fuel: Vehicle["fuel"],
    mileage: number,
  ): Vehicle => ({ id, garage_id, client_id, registration, vin, make, model, version, year, engine, fuel, mileage, notes: null, created_at: created, updated_at: created });
  const vehicles: Vehicle[] = [
    v("v-308", "g-dupont", "c-jean", "FG-308-JD", "VF3LBBHZHJS145230", "Peugeot", "308", "II Allure", 2018, "1.6 BlueHDi 120", "DIESEL", 145230),
    v("v-clio", "g-dupont", "c-marie", "EK-921-ML", "VF15RBJ0D61234567", "Renault", "Clio", "IV Intens", 2016, "0.9 TCe 90", "ESSENCE", 98450),
    v("v-golf", "g-dupont", "c-ahmed", "EZ-714-AH", "WVWZZZAUZHW098765", "Volkswagen", "Golf", "7 Carat", 2017, "1.4 TSI 125", "ESSENCE", 121900),
    v("v-c5", "g-dupont", "c-claire-b", "FR-552-CB", "VR7ACYHZKML112233", "Citroën", "C5 Aircross", "Shine", 2020, "1.5 BlueHDi 130", "DIESEL", 76300),
    v("v-yaris", "g-dupont", "c-lucie", "GA-118-LG", null, "Toyota", "Yaris", "IV Hybride", 2021, "1.5 Hybrid 116", "HYBRIDE", 54210),
    v("v-zoe", "g-dupont", "c-lucie", "GB-433-LG", null, "Renault", "Zoé", "R110", 2020, "Électrique 52 kWh", "ELECTRIQUE", 61800),
    v("v-mar-208", "g-martin", "c-paulette", "DK-208-PR", null, "Peugeot", "208", "Active", 2015, "1.2 PureTech 82", "ESSENCE", 112000),
    v("v-mar-megane", "g-martin", "c-yann", "FH-640-YM", null, "Renault", "Mégane", "IV", 2019, "1.5 dCi 115", "DIESEL", 88000),
  ];

  // ---------------- Catalogue & pièces ----------------
  const cat = (garage_id: string, category: PriceCatalogItem["category"], key: string, label: string, unit_price: number | null, default_hours: number | null = null): PriceCatalogItem => ({
    id: `pc-${garage_id}-${key}`,
    garage_id,
    category,
    key,
    label,
    unit_price,
    default_hours,
    created_at: created,
  });
  const price_catalog: PriceCatalogItem[] = [
    cat("g-dupont", "LABOR", "labor_hour", "Main-d'œuvre (taux horaire)", 68),
    cat("g-dupont", "SERVICE", "diagnostic", "Diagnostic électronique", 59),
    cat("g-dupont", "SERVICE", "vidange", "Vidange + filtre à huile", 89),
    cat("g-dupont", "SERVICE", "freinage_av", "Plaquettes de frein avant (pose)", 79),
    cat("g-dupont", "SERVICE", "revision", "Révision (hors pièces)", 99),
    cat("g-dupont", "SERVICE", "distribution", "Kit de distribution (pose)", null),
    cat("g-dupont", "LABOR", "remplacement_bobine", "Remplacement bobine d'allumage", null, 0.5),
    cat("g-dupont", "LABOR", "remplacement_bougies", "Remplacement bougies", null, 0.8),
    cat("g-dupont", "LABOR", "vanne_egr", "Dépose / repose vanne EGR", null, 2),
    cat("g-dupont", "LABOR", "remplacement_sonde_lambda", "Remplacement sonde lambda", null, 0.6),
    cat("g-dupont", "LABOR", "remplacement_catalyseur", "Remplacement catalyseur", null, 1.5),
    cat("g-dupont", "LABOR", "recherche_fuite_admission", "Recherche de fuite (admission / suralimentation)", null, 1),
    cat("g-dupont", "LABOR", "remplacement_debitmetre", "Remplacement débitmètre", null, 0.5),
    cat("g-dupont", "LABOR", "reparation_faisceau", "Contrôle / réparation faisceau", null, 1),
    cat("g-martin", "LABOR", "labor_hour", "Main-d'œuvre (taux horaire)", 62),
    cat("g-martin", "SERVICE", "diagnostic", "Diagnostic", 49),
    cat("g-martin", "SERVICE", "vidange", "Vidange", null),
  ];
  const part = (garage_id: string, reference: string, name: string, price: number | null, stock: number): Part => ({
    id: `p-${garage_id}-${reference}`,
    garage_id,
    reference,
    name,
    brand: "Démo",
    price,
    stock,
    supplier: "Stock atelier",
    created_at: created,
  });
  const parts: Part[] = [
    part("g-dupont", "DEMO-BOB-001", "Bobine d'allumage", 62, 4),
    part("g-dupont", "DEMO-BOU-001", "Bougie d'allumage", 12.5, 16),
    part("g-dupont", "DEMO-EGR-001", "Vanne EGR", 245, 1),
    part("g-dupont", "DEMO-EGR-002", "Joint de vanne EGR", 8, 6),
    part("g-dupont", "DEMO-LAM-001", "Sonde lambda amont", 95, 2),
    part("g-dupont", "DEMO-LAM-002", "Sonde lambda aval", 89, 1),
    part("g-dupont", "DEMO-FAI-001", "Filtre à air", 18, 8),
    part("g-dupont", "DEMO-PLA-001", "Plaquettes de frein avant", 45, 5),
    part("g-dupont", "DEMO-FHU-001", "Filtre à huile", 9, 12),
    part("g-martin", "DEMO-M-BOB", "Bobine d'allumage", 58, 2),
  ];

  // ---------------- Historique : diagnostics, tests, devis, interventions ----------------
  const diagnostics: Diagnostic[] = [];
  const diagnostic_codes: DiagnosticCode[] = [];
  const diagnostic_tests: DiagnosticTestRecord[] = [];
  const quotes: Quote[] = [];
  const quote_items: QuoteItem[] = [];
  const interventions: Intervention[] = [];
  const reviews: Review[] = [];
  const vehicle_intakes: VehicleIntake[] = [];
  const audit_logs: AuditLog[] = [];

  function addDiagnostic(opts: {
    id: string;
    vehicle: Vehicle;
    user: string;
    team: string;
    at: string;
    codes: string[];
    symptoms: string[];
    answers: [string, string, TestAnswer][];
    conclude?: { cause: string; confirmed: boolean; repair: string };
  }) {
    const answers = opts.answers.map(([dtc, stepId, answer]) => ({ dtc, stepId, answer }));
    diagnostics.push({
      id: opts.id,
      garage_id: opts.vehicle.garage_id,
      vehicle_id: opts.vehicle.id,
      client_id: opts.vehicle.client_id,
      user_id: opts.user,
      team_id: opts.team,
      status: opts.conclude ? "CONCLUDED" : "TESTING",
      symptoms: opts.symptoms,
      complaint: null,
      mileage: opts.vehicle.mileage,
      ai_analysis: null,
      ai_provider: null,
      conclusion: opts.conclude
        ? {
            cause_id: opts.conclude.cause,
            summary: evaluate(opts.codes, answers).suggestedConclusion.text,
            confirmed_by_technician: opts.conclude.confirmed,
            recommended_repair: opts.conclude.repair,
          }
        : null,
      obd_session_id: null,
      created_at: opts.at,
      updated_at: opts.at,
    });
    for (const code of opts.codes) {
      diagnostic_codes.push({ id: `dc-${opts.id}-${code}`, garage_id: opts.vehicle.garage_id, diagnostic_id: opts.id, code, description: getRule(code)?.title ?? null, source: "OBD", created_at: opts.at });
    }
    opts.answers.forEach(([dtc, stepId, answer], k) => {
      const test = getRule(dtc)!.tests.find((t) => t.id === stepId)!;
      diagnostic_tests.push({
        id: `dt-${opts.id}-${k}`,
        garage_id: opts.vehicle.garage_id,
        diagnostic_id: opts.id,
        dtc,
        step_id: stepId,
        title: test.title,
        question: test.question,
        answer,
        interpretation: outcomeFor(test, answer).interpretation,
        notes: null,
        user_id: opts.user,
        created_at: new Date(new Date(opts.at).getTime() + (k + 1) * 15 * 60000).toISOString(),
      });
    });
  }

  function addQuote(opts: {
    id: string;
    number: string;
    vehicle: Vehicle;
    team: string;
    mechanic: string | null;
    diagnostic?: string;
    at: string;
    status: Quote["status"];
    items: [QuoteItem["kind"], string, number, number | null, string?][];
    decidedAt?: string;
  }) {
    quotes.push({
      id: opts.id,
      garage_id: opts.vehicle.garage_id,
      number: opts.number,
      client_id: opts.vehicle.client_id,
      vehicle_id: opts.vehicle.id,
      team_id: opts.team,
      mechanic_id: opts.mechanic,
      diagnostic_id: opts.diagnostic ?? null,
      status: opts.status,
      vat_rate: 20,
      notes: null,
      sent_at: opts.status !== "DRAFT" ? opts.at : null,
      accepted_at: opts.status === "ACCEPTED" ? (opts.decidedAt ?? opts.at) : null,
      refused_at: opts.status === "REFUSED" ? (opts.decidedAt ?? opts.at) : null,
      valid_until: opts.status === "SENT" ? new Date(new Date(opts.at).getTime() + 30 * 86400000).toISOString() : null,
      follow_up_at: opts.status === "SENT" ? new Date(new Date(opts.at).getTime() + 3 * 86400000).toISOString() : null,
      created_by: "u-emma",
      created_at: opts.at,
      updated_at: opts.at,
    });
    opts.items.forEach(([kind, label, quantity, unit_price, reference], k) =>
      quote_items.push({ id: `qi-${opts.id}-${k}`, garage_id: opts.vehicle.garage_id, quote_id: opts.id, kind, label, reference: reference ?? null, quantity, unit_price, position: k, created_at: opts.at }),
    );
  }

  function addIntervention(opts: {
    id: string;
    vehicle: Vehicle;
    team: string | null;
    mechanic: string | null;
    title: string;
    status: Intervention["status"];
    scheduled: string;
    planned: number;
    actual?: number;
    quote?: string;
    diagnostic?: string;
    parts?: Intervention["parts"];
  }) {
    const started = opts.status !== "WAITING" && opts.status !== "CANCELLED" ? opts.scheduled : null;
    const completed = opts.status === "COMPLETED" ? new Date(new Date(opts.scheduled).getTime() + (opts.actual ?? opts.planned) * 60000).toISOString() : null;
    interventions.push({
      id: opts.id,
      garage_id: opts.vehicle.garage_id,
      vehicle_id: opts.vehicle.id,
      client_id: opts.vehicle.client_id,
      team_id: opts.team,
      mechanic_id: opts.mechanic,
      title: opts.title,
      description: null,
      status: opts.status,
      scheduled_at: opts.scheduled,
      planned_duration_minutes: opts.planned,
      actual_duration_minutes: opts.status === "COMPLETED" ? (opts.actual ?? opts.planned) : null,
      started_at: started,
      completed_at: completed,
      parts: opts.parts ?? [],
      diagnostic_id: opts.diagnostic ?? null,
      quote_id: opts.quote ?? null,
      created_by: "u-emma",
      created_at: opts.scheduled,
      updated_at: completed ?? opts.scheduled,
    });
  }

  const V = Object.fromEntries(vehicles.map((x) => [x.id, x]));

  // Clio — raté cylindre 3, bobine (dossier complet et clôturé)
  vehicle_intakes.push({
    id: "in-clio-1",
    garage_id: "g-dupont",
    vehicle_id: "v-clio",
    client_id: "c-marie",
    user_id: "u-emma",
    mileage: 97980,
    fuel_level: "1/2",
    warning_lights: ["Voyant moteur"],
    bodywork: "OK",
    tires: "A_SURVEILLER",
    rims: "OK",
    windshield: "OK",
    lighting: "OK",
    observations: "Cliente signale des à-coups à froid.",
    client_signature_name: "Marie Lefèvre",
    client_validated_at: day(-45, 8, 30),
    created_at: day(-45, 8, 20),
  });
  addDiagnostic({
    id: "d-clio-1",
    vehicle: V["v-clio"],
    user: "u-nina",
    team: "t-dup-diag",
    at: day(-45, 9),
    codes: ["P0303"],
    symptoms: ["Moteur qui broute", "Voyant moteur allumé"],
    answers: [["P0303", "swap_coil", "YES"]],
    conclude: { cause: "ignition_coil", confirmed: true, repair: "Remplacement bobine d'allumage cylindre 3" },
  });
  addQuote({
    id: "q-clio-1",
    number: `D-${now.getFullYear()}-0001`,
    vehicle: V["v-clio"],
    team: "t-dup-meca",
    mechanic: "u-julien",
    diagnostic: "d-clio-1",
    at: day(-45, 11),
    status: "ACCEPTED",
    decidedAt: day(-45, 14),
    items: [
      ["SERVICE", "Diagnostic électronique", 1, 59],
      ["LABOR", "Main-d'œuvre — Remplacement bobine d'allumage", 0.5, 68],
      ["PART", "Bobine d'allumage (Démo)", 1, 62, "DEMO-BOB-001"],
    ],
  });
  addIntervention({
    id: "i-clio-1",
    vehicle: V["v-clio"],
    team: "t-dup-meca",
    mechanic: "u-julien",
    title: "Remplacement bobine d'allumage cylindre 3",
    status: "COMPLETED",
    scheduled: day(-44, 9),
    planned: 30,
    actual: 35,
    quote: "q-clio-1",
    diagnostic: "d-clio-1",
    parts: [{ part_id: "p-g-dupont-DEMO-BOB-001", name: "Bobine d'allumage (Démo)", reference: "DEMO-BOB-001", quantity: 1 }],
  });
  reviews.push({ id: "r-clio-1", garage_id: "g-dupont", intervention_id: "i-clio-1", vehicle_id: "v-clio", client_id: "c-marie", rating: 5, comment: "Diagnostic clair, travail rapide.", created_at: day(-43, 18) });

  // 308 — EGR (devis envoyé, relance à prévoir)
  addDiagnostic({
    id: "d-308-1",
    vehicle: V["v-308"],
    user: "u-karim",
    team: "t-dup-diag",
    at: day(-8, 10),
    codes: ["P0401"],
    symptoms: ["Perte de puissance", "Voyant moteur allumé"],
    answers: [
      ["P0401", "egr_actuation", "NO"],
      ["P0401", "egr_power", "NO"],
    ],
    conclude: { cause: "egr_valve", confirmed: false, repair: "Remplacement vanne EGR" },
  });
  addQuote({
    id: "q-308-1",
    number: `D-${now.getFullYear()}-0002`,
    vehicle: V["v-308"],
    team: "t-dup-meca",
    mechanic: "u-thomas",
    diagnostic: "d-308-1",
    at: day(-6, 11),
    status: "SENT",
    items: [
      ["SERVICE", "Diagnostic électronique", 1, 59],
      ["LABOR", "Main-d'œuvre — Dépose / repose vanne EGR", 2, 68],
      ["PART", "Vanne EGR (Démo)", 1, 245, "DEMO-EGR-001"],
      ["PART", "Joint de vanne EGR (Démo)", 1, 8, "DEMO-EGR-002"],
    ],
  });

  // Historique d'activité sur 5 mois (statistiques)
  const history: [string, string, string, string, number, number][] = [
    // vehicle, team, mechanic, title, daysAgo, labor hours
    ["v-golf", "t-dup-meca", "u-lucas", "Révision + vidange", 150, 1.5],
    ["v-c5", "t-dup-meca", "u-julien", "Plaquettes de frein avant", 128, 1],
    ["v-308", "t-dup-meca", "u-thomas", "Remplacement filtre à air", 110, 0.5],
    ["v-yaris", "t-dup-diag", "u-nina", "Diagnostic voyant hybride (non HT)", 96, 1],
    ["v-clio", "t-dup-meca", "u-lucas", "Vidange", 80, 1],
    ["v-golf", "t-dup-diag", "u-karim", "Diagnostic trou à l'accélération", 66, 1.5],
    ["v-c5", "t-dup-meca", "u-thomas", "Remplacement sonde lambda aval", 52, 0.6],
    ["v-zoe", "t-dup-meca", "u-julien", "Freinage avant", 37, 1],
    ["v-308", "t-dup-meca", "u-lucas", "Révision", 24, 1.5],
    ["v-yaris", "t-dup-meca", "u-julien", "Vidange + filtre à air", 12, 1],
  ];
  history.forEach(([vid, team, mech, title, ago, hours], k) => {
    const qid = `q-h-${k}`;
    addQuote({
      id: qid,
      number: `D-${now.getFullYear() - (ago > 270 ? 1 : 0)}-H${String(k + 1).padStart(3, "0")}`,
      vehicle: V[vid],
      team,
      mechanic: mech,
      at: day(-ago - 1, 10),
      status: "ACCEPTED",
      decidedAt: day(-ago - 1, 15),
      items: [
        ["LABOR", `Main-d'œuvre — ${title}`, hours, 68],
        ["PART", "Pièces / consommables (Démo)", 1, 40 + ((k * 37) % 120)],
      ],
    });
    addIntervention({ id: `i-h-${k}`, vehicle: V[vid], team, mechanic: mech, title, status: "COMPLETED", scheduled: day(-ago, 9), planned: hours * 60, actual: Math.round(hours * 60 * (0.9 + (k % 3) * 0.1)), quote: qid });
  });
  addQuote({
    id: "q-refused-1",
    number: `D-${now.getFullYear()}-0003`,
    vehicle: V["v-c5"],
    team: "t-dup-meca",
    mechanic: null,
    at: day(-30, 10),
    status: "REFUSED",
    decidedAt: day(-27, 10),
    items: [["SERVICE", "Kit de distribution (pose)", 1, 590]],
  });
  addQuote({
    id: "q-draft-1",
    number: `D-${now.getFullYear()}-0004`,
    vehicle: V["v-golf"],
    team: "t-dup-meca",
    mechanic: "u-lucas",
    at: day(-1, 16),
    status: "DRAFT",
    items: [
      ["SERVICE", "Révision (hors pièces)", 1, 99],
      ["PART", "Filtre à huile (Démo)", 1, 9, "DEMO-FHU-001"],
      ["PART", "Huile moteur", 4.5, null],
    ],
  });

  // Planning du jour
  addIntervention({ id: "i-today-1", vehicle: V["v-308"], team: "t-dup-meca", mechanic: "u-thomas", title: "Diagnostic perte de puissance", status: "IN_PROGRESS", scheduled: day(0, 8), planned: 90 });
  addIntervention({ id: "i-today-2", vehicle: V["v-c5"], team: "t-dup-diag", mechanic: "u-nina", title: "Diagnostic voyant moteur", status: "WAITING", scheduled: day(0, 9, 30), planned: 60 });
  addIntervention({ id: "i-today-3", vehicle: V["v-clio"], team: "t-dup-meca", mechanic: "u-julien", title: "Freinage avant", status: "WAITING", scheduled: day(0, 10, 30), planned: 60 });
  addIntervention({ id: "i-today-4", vehicle: V["v-golf"], team: "t-dup-meca", mechanic: "u-lucas", title: "Révision", status: "WAITING", scheduled: day(0, 14), planned: 90 });
  addIntervention({ id: "i-today-5", vehicle: V["v-golf"], team: "t-dup-diag", mechanic: "u-karim", title: "Diagnostic ratés moteur (OBD)", status: "WAITING", scheduled: day(0, 15, 30), planned: 60 });
  addIntervention({ id: "i-wait-part", vehicle: V["v-yaris"], team: "t-dup-meca", mechanic: "u-lucas", title: "Remplacement sonde lambda amont", status: "WAITING_PART", scheduled: day(-1, 14), planned: 45 });
  addIntervention({ id: "i-tomorrow-1", vehicle: V["v-zoe"], team: "t-dup-meca", mechanic: "u-julien", title: "Contrôle trains roulants", status: "WAITING", scheduled: day(1, 9), planned: 60 });

  vehicle_intakes.push({
    id: "in-308-today",
    garage_id: "g-dupont",
    vehicle_id: "v-308",
    client_id: "c-jean",
    user_id: "u-emma",
    mileage: 145230,
    fuel_level: "1/4",
    warning_lights: ["Voyant moteur", "Voyant préchauffage"],
    bodywork: "A_SURVEILLER",
    tires: "OK",
    rims: "OK",
    windshield: "OK",
    lighting: "OK",
    observations: "Rayure pare-choc arrière droit (existante).",
    client_signature_name: "Jean Dupont",
    client_validated_at: day(0, 7, 55),
    created_at: day(0, 7, 50),
  });

  // Garage Martin — quelques données (isolation multi-tenant)
  addQuote({ id: "q-mar-1", number: `D-${now.getFullYear()}-0001`, vehicle: V["v-mar-208"], team: "t-mar-meca", mechanic: "u-hugo", at: day(-10, 9), status: "ACCEPTED", decidedAt: day(-9, 9), items: [["SERVICE", "Diagnostic", 1, 49]] });
  addIntervention({ id: "i-mar-1", vehicle: V["v-mar-208"], team: "t-mar-meca", mechanic: "u-hugo", title: "Remplacement bobine", status: "WAITING", scheduled: day(0, 9), planned: 45, quote: "q-mar-1" });
  addIntervention({ id: "i-mar-2", vehicle: V["v-mar-megane"], team: "t-mar-carro", mechanic: "u-lea", title: "Reprise pare-choc avant", status: "IN_PROGRESS", scheduled: day(0, 8, 30), planned: 180 });

  audit_logs.push(
    { id: "a-1", garage_id: "g-dupont", user_id: "u-paul", action: "garage.create", entity_type: "garage", entity_id: "g-dupont", details: null, created_at: created },
    { id: "a-2", garage_id: "g-martin", user_id: "u-claire", action: "garage.create", entity_type: "garage", entity_id: "g-martin", details: null, created_at: created },
  );

  return {
    profiles,
    garages,
    garage_members,
    teams,
    team_members,
    clients,
    vehicles,
    diagnostics,
    diagnostic_codes,
    diagnostic_tests,
    diagnostic_results: [],
    diagnostic_live_data: [],
    obd_connections: [],
    obd_sessions: [],
    interventions,
    parts,
    price_catalog,
    quotes,
    quote_items,
    photos: [],
    vehicle_intakes,
    reviews,
    audit_logs,
  };
}
