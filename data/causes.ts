import type { CauseDefinition } from "@/lib/diagnostics/types";

/**
 * Causes possibles (base de démonstration).
 * Les réparations associées sont génériques : aucune référence pièce, aucun prix,
 * aucun temps constructeur n'est inventé. Les prix proviennent exclusivement
 * du catalogue du garage (price_catalog / parts).
 */
export const CAUSES: Record<string, CauseDefinition> = {
  ignition_coil: {
    id: "ignition_coil",
    label: "Bobine d'allumage défectueuse",
    system: "Allumage",
    repair: { label: "Remplacement bobine d'allumage", catalogKey: "remplacement_bobine", parts: ["Bobine d'allumage"] },
  },
  spark_plug: {
    id: "spark_plug",
    label: "Bougie d'allumage usée ou défectueuse",
    system: "Allumage",
    repair: { label: "Remplacement des bougies d'allumage", catalogKey: "remplacement_bougies", parts: ["Bougie d'allumage"] },
  },
  injector: {
    id: "injector",
    label: "Injecteur défectueux (débit, fuite ou commande)",
    system: "Injection",
    repair: { label: "Contrôle / remplacement injecteur", catalogKey: "remplacement_injecteur", parts: ["Injecteur"] },
  },
  vacuum_leak: {
    id: "vacuum_leak",
    label: "Prise d'air à l'admission",
    system: "Admission",
    repair: { label: "Recherche et réparation de prise d'air", catalogKey: "recherche_fuite_admission", parts: ["Durite / joint d'admission (selon constat)"] },
  },
  fuel_pressure: {
    id: "fuel_pressure",
    label: "Pression carburant insuffisante ou instable",
    system: "Alimentation carburant",
    repair: { label: "Contrôle circuit d'alimentation carburant", catalogKey: "diagnostic_alimentation", parts: ["Filtre à carburant (selon constat)"] },
  },
  fuel_pressure_high: {
    id: "fuel_pressure_high",
    label: "Pression carburant excessive / régulation défaillante",
    system: "Alimentation carburant",
    repair: { label: "Contrôle régulation pression carburant", catalogKey: "diagnostic_alimentation" },
  },
  low_compression: {
    id: "low_compression",
    label: "Défaut mécanique (compression insuffisante)",
    system: "Moteur",
    repair: { label: "Diagnostic mécanique approfondi (compression / étanchéité)", catalogKey: "diagnostic_mecanique" },
  },
  ignition_wiring: {
    id: "ignition_wiring",
    label: "Faisceau / connecteur (allumage ou injection)",
    system: "Électricité",
    repair: { label: "Réparation faisceau / connecteur", catalogKey: "reparation_faisceau" },
  },
  egr_valve: {
    id: "egr_valve",
    label: "Vanne EGR grippée ou défectueuse",
    system: "Dépollution",
    repair: { label: "Nettoyage ou remplacement vanne EGR", catalogKey: "vanne_egr", parts: ["Vanne EGR", "Joint de vanne EGR"] },
  },
  egr_passages: {
    id: "egr_passages",
    label: "Conduits EGR encrassés / obstrués",
    system: "Dépollution",
    repair: { label: "Décalaminage des conduits EGR", catalogKey: "vanne_egr" },
  },
  egr_control: {
    id: "egr_control",
    label: "Commande EGR (électrovanne, dépression, capteur de position)",
    system: "Dépollution",
    repair: { label: "Contrôle commande EGR", catalogKey: "reparation_faisceau" },
  },
  catalyst: {
    id: "catalyst",
    label: "Catalyseur à efficacité réduite",
    system: "Échappement",
    repair: { label: "Remplacement du catalyseur", catalogKey: "remplacement_catalyseur", parts: ["Catalyseur", "Joints d'échappement"] },
  },
  o2_downstream: {
    id: "o2_downstream",
    label: "Sonde lambda aval défectueuse",
    system: "Échappement",
    repair: { label: "Remplacement sonde lambda aval", catalogKey: "remplacement_sonde_lambda", parts: ["Sonde lambda aval"] },
  },
  o2_upstream: {
    id: "o2_upstream",
    label: "Sonde lambda amont défectueuse",
    system: "Échappement",
    repair: { label: "Remplacement sonde lambda amont", catalogKey: "remplacement_sonde_lambda", parts: ["Sonde lambda amont"] },
  },
  o2_heater: {
    id: "o2_heater",
    label: "Chauffage de sonde lambda défectueux",
    system: "Échappement",
    repair: { label: "Remplacement sonde lambda (élément chauffant)", catalogKey: "remplacement_sonde_lambda", parts: ["Sonde lambda amont"] },
  },
  o2_wiring: {
    id: "o2_wiring",
    label: "Faisceau / connecteur de sonde lambda",
    system: "Électricité",
    repair: { label: "Réparation faisceau sonde lambda", catalogKey: "reparation_faisceau" },
  },
  fuse_relay: {
    id: "fuse_relay",
    label: "Fusible / relais d'alimentation",
    system: "Électricité",
    repair: { label: "Remplacement fusible / relais (après recherche de cause)", catalogKey: "reparation_faisceau", parts: ["Fusible / relais"] },
  },
  exhaust_leak: {
    id: "exhaust_leak",
    label: "Fuite d'échappement",
    system: "Échappement",
    repair: { label: "Réparation fuite d'échappement", catalogKey: "reparation_echappement", parts: ["Joint d'échappement"] },
  },
  maf_sensor: {
    id: "maf_sensor",
    label: "Débitmètre d'air (MAF) encrassé ou défectueux",
    system: "Admission",
    repair: { label: "Contrôle / remplacement débitmètre d'air", catalogKey: "remplacement_debitmetre", parts: ["Débitmètre d'air"] },
  },
  air_filter: {
    id: "air_filter",
    label: "Filtre à air colmaté / admission obstruée",
    system: "Admission",
    repair: { label: "Remplacement filtre à air", catalogKey: "remplacement_filtre_air", parts: ["Filtre à air"] },
  },
  intake_leak_after_maf: {
    id: "intake_leak_after_maf",
    label: "Fuite d'air entre débitmètre et papillon / turbo",
    system: "Admission",
    repair: { label: "Réparation fuite circuit d'air", catalogKey: "recherche_fuite_admission", parts: ["Durite d'admission (selon constat)"] },
  },
  iat_sensor: {
    id: "iat_sensor",
    label: "Sonde de température d'air d'admission défectueuse",
    system: "Admission",
    repair: { label: "Remplacement sonde de température d'air", catalogKey: "remplacement_capteur", parts: ["Sonde de température d'air"] },
  },
  sensor_wiring: {
    id: "sensor_wiring",
    label: "Faisceau / connecteur de capteur (coupure, oxydation)",
    system: "Électricité",
    repair: { label: "Réparation faisceau / connecteur", catalogKey: "reparation_faisceau" },
  },
  coolant_sensor: {
    id: "coolant_sensor",
    label: "Sonde de température moteur incohérente",
    system: "Refroidissement",
    repair: { label: "Remplacement sonde de température moteur", catalogKey: "remplacement_capteur", parts: ["Sonde de température moteur"] },
  },
  boost_leak: {
    id: "boost_leak",
    label: "Fuite sur le circuit de suralimentation (durites, échangeur)",
    system: "Suralimentation",
    repair: { label: "Réparation fuite de suralimentation", catalogKey: "recherche_fuite_admission", parts: ["Durite de turbo (selon constat)"] },
  },
  turbo_actuator: {
    id: "turbo_actuator",
    label: "Actionneur turbo / géométrie variable / wastegate grippé",
    system: "Suralimentation",
    repair: { label: "Contrôle / remplacement actionneur de turbo", catalogKey: "turbo" },
  },
  boost_sensor: {
    id: "boost_sensor",
    label: "Capteur de pression de suralimentation incohérent",
    system: "Suralimentation",
    repair: { label: "Remplacement capteur de pression", catalogKey: "remplacement_capteur", parts: ["Capteur de pression de suralimentation"] },
  },
  turbocharger: {
    id: "turbocharger",
    label: "Turbocompresseur défectueux",
    system: "Suralimentation",
    repair: { label: "Remplacement turbocompresseur", catalogKey: "turbo", parts: ["Turbocompresseur", "Kit de joints turbo"] },
  },
};

export function causeLabel(id: string | null | undefined): string {
  if (!id) return "Cause non déterminée";
  return CAUSES[id]?.label ?? id;
}
