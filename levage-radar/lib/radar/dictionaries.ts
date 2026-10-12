/**
 * Dictionnaires métier (FR / EN) — base initiale à enrichir.
 *
 * Les motifs sont des expressions régulières appliquées sur du texte NORMALISÉ
 * (minuscules, sans accents, ponctuation remplacée par des espaces — voir text.ts).
 * Poids : 3 = terme spécifique au domaine, 2 = terme fortement associé, 1 = terme de contexte.
 */

export type DomainKey = "LEVAGE" | "ELECTRICITE";
export type Term = { label: string; re: string; weight: 1 | 2 | 3 };

const S = "s?"; // pluriel facultatif

export const LEVAGE_TERMS: Term[] = [
  // Réglementaire / inspection spécifiques au levage
  { label: "VGP", re: "vgp", weight: 3 },
  { label: "vérification générale périodique", re: `verifications? generales? periodiques?`, weight: 3 },
  { label: "appareils de levage", re: `appareil${S} de levage`, weight: 3 },
  { label: "engins de levage", re: `engin${S} de levage`, weight: 3 },
  { label: "équipements de levage", re: `equipement${S} de levage`, weight: 3 },
  { label: "accessoires de levage", re: `accessoire${S} de levage`, weight: 3 },
  { label: "moyens de levage", re: `moyen${S} de levage`, weight: 3 },
  { label: "matériel de levage", re: `materiel${S} de levage`, weight: 3 },
  { label: "levage", re: "levage", weight: 2 },
  { label: "manutention", re: "manutention", weight: 1 },
  // Familles d'équipements
  { label: "pont roulant", re: `ponts? roulants?`, weight: 3 },
  { label: "pont polaire", re: `ponts? polaires?`, weight: 2 },
  { label: "portique", re: `portiques? (de levage|roulant${S}|de manutention)`, weight: 3 },
  { label: "portique (générique)", re: "portiques?", weight: 1 },
  { label: "grue", re: "grues?", weight: 3 },
  { label: "grue à tour", re: `grues? a tour`, weight: 3 },
  { label: "grue mobile", re: `grues? mobiles?`, weight: 3 },
  { label: "grue auxiliaire", re: `grues? auxiliaires?`, weight: 3 },
  { label: "camion-grue", re: `camions? grues?`, weight: 2 },
  { label: "palan", re: "palans?", weight: 3 },
  { label: "treuil", re: "treuils?", weight: 2 },
  { label: "potence", re: "potences?", weight: 2 },
  { label: "nacelle élévatrice", re: `nacelles?( elevatrices?)?`, weight: 3 },
  { label: "PEMP", re: "pemp", weight: 3 },
  { label: "plate-forme élévatrice", re: `plates? ?formes? elevatrices?`, weight: 3 },
  { label: "chariot élévateur", re: `chariots? elevateurs?`, weight: 3 },
  { label: "chariot automoteur", re: `chariots? automoteurs?`, weight: 2 },
  { label: "chariot télescopique", re: `(chariots? )?telescopiques?`, weight: 2 },
  { label: "gerbeur", re: "gerbeurs?", weight: 2 },
  { label: "transpalette", re: "transpalettes?", weight: 1 },
  { label: "élingue", re: "elingues?", weight: 3 },
  { label: "palonnier", re: "palonniers?", weight: 3 },
  { label: "chaîne de levage", re: `chaines? de levage`, weight: 3 },
  { label: "manille", re: "manilles?", weight: 1 },
  { label: "table élévatrice", re: `tables? elevatrices?`, weight: 3 },
  { label: "hayon élévateur", re: `hayons? elevateurs?`, weight: 2 },
  { label: "pont élévateur", re: `ponts? elevateurs?`, weight: 2 },
  { label: "monte-charge", re: `monte ?charges?`, weight: 2 },
  { label: "parc matériel", re: `parcs? (de )?materiels?`, weight: 1 },
  // Anglais
  { label: "lifting equipment", re: "lifting equipment", weight: 3 },
  { label: "lifting appliances", re: `lifting appliances?`, weight: 3 },
  { label: "lifting gear", re: "lifting gear", weight: 3 },
  { label: "lifting accessories", re: `lifting accessor(y|ies)`, weight: 3 },
  { label: "lifting operations", re: `lifting operations?`, weight: 2 },
  { label: "LOLER", re: "loler", weight: 3 },
  { label: "thorough examination", re: `thorough examinations?`, weight: 3 },
  { label: "overhead crane", re: `overhead cranes?`, weight: 3 },
  { label: "gantry crane", re: `gantry cranes?`, weight: 3 },
  { label: "crane", re: "cranes?", weight: 2 },
  { label: "hoist", re: "hoists?", weight: 3 },
  { label: "winch", re: "winch(es)?", weight: 2 },
  { label: "MEWP", re: `mewps?|mobile elevating work platforms?`, weight: 3 },
  { label: "aerial work platform", re: `aerial work platforms?`, weight: 3 },
  { label: "scissor lift", re: `scissor lifts?`, weight: 3 },
  { label: "forklift", re: `fork ?lifts?( trucks?)?`, weight: 3 },
  { label: "lifting beam", re: `lifting beams?`, weight: 3 },
  { label: "sling", re: "slings?", weight: 2 },
];

export const ELECTRICITE_TERMS: Term[] = [
  { label: "installations électriques", re: `installations? electriques?`, weight: 3 },
  { label: "vérification électrique", re: `verifications? (periodiques? |initiales? |reglementaires? )?(des |de l |d )?(installations? )?electriques?`, weight: 3 },
  { label: "contrôle électrique", re: `controles? (periodiques? |reglementaires? )?(des |de l |d )?(installations? )?electriques?`, weight: 3 },
  { label: "inspection électrique", re: `inspections? (des |de l )?(installations? )?electriques?`, weight: 3 },
  { label: "électricité", re: "electricite", weight: 2 },
  { label: "électrique", re: `electriques?`, weight: 1 },
  { label: "basse tension", re: "basse tension", weight: 2 },
  { label: "haute tension", re: "haute tension", weight: 2 },
  { label: "HTA / HTB", re: "hta|htb", weight: 1 },
  { label: "tableau électrique", re: `tableaux? electriques?`, weight: 3 },
  { label: "TGBT", re: "tgbt", weight: 3 },
  { label: "armoire électrique", re: `armoires? electriques?`, weight: 2 },
  { label: "poste de transformation", re: `postes? (de transformation|hta|haute tension)`, weight: 2 },
  { label: "courants forts", re: `courants? forts?`, weight: 2 },
  { label: "thermographie", re: `thermographies?( infrarouges?)?`, weight: 2 },
  { label: "Q18 / Q19", re: "q18|q19", weight: 2 },
  { label: "Consuel", re: "consuel", weight: 2 },
  { label: "NF C 15-100 / 18-510", re: `nf ?c ?15 ?100|nf ?c ?18 ?510|nfc ?15 ?100|nfc ?18 ?510`, weight: 2 },
  { label: "éclairage de sécurité", re: `eclairages? de securite`, weight: 2 },
  { label: "paratonnerre / foudre", re: `paratonnerres?|protection foudre|parafoudres?`, weight: 1 },
  { label: "groupe électrogène", re: `groupes? electrogenes?`, weight: 1 },
  // Anglais
  { label: "electrical installation", re: `electrical installations?`, weight: 3 },
  { label: "electrical inspection", re: `(periodic )?electrical inspections?`, weight: 3 },
  { label: "electrical safety inspection", re: `electrical safety (inspections?|testing|checks?)`, weight: 3 },
  { label: "electrical compliance testing", re: `electrical compliance( testing)?`, weight: 3 },
  { label: "electrical testing", re: `electrical (testing|tests?)`, weight: 3 },
  { label: "EICR", re: "eicr", weight: 3 },
  { label: "fixed wire testing", re: `fixed wire testing`, weight: 3 },
  { label: "PAT testing", re: `pat testing|portable appliance testing`, weight: 2 },
  { label: "low voltage", re: "low voltage", weight: 2 },
  { label: "switchboard", re: `switchboards?`, weight: 2 },
  { label: "infrared thermography", re: `infrared thermography|thermographic surveys?`, weight: 2 },
  { label: "electrical", re: "electrical", weight: 1 },
];

/** Indices d'une mission d'inspection / vérification (le cœur de métier). */
export const INSPECTION_SIGNALS: Term[] = [
  { label: "vérification", re: `verifications?`, weight: 2 },
  { label: "contrôle réglementaire", re: `controles? reglementaires?`, weight: 3 },
  { label: "contrôle périodique", re: `controles? periodiques?`, weight: 3 },
  { label: "vérifications réglementaires", re: `verifications? reglementaires?`, weight: 3 },
  { label: "vérifications périodiques", re: `verifications? periodiques?`, weight: 3 },
  { label: "vérification initiale", re: `verifications? initiales?`, weight: 3 },
  { label: "contrôle technique", re: `controles? techniques?`, weight: 2 },
  { label: "contrôle", re: `controles?`, weight: 1 },
  { label: "inspection", re: `inspections?`, weight: 2 },
  { label: "visite périodique", re: `visites? periodiques?`, weight: 2 },
  { label: "examen d'adéquation / de mise en service", re: `examens? (d adequation|de mise en service|approfondis?)`, weight: 3 },
  { label: "organisme agréé / accrédité", re: `organismes? (agrees?|accredites?|de controle|notifies?)`, weight: 3 },
  { label: "bureau de contrôle", re: `bureaux? de controle`, weight: 3 },
  { label: "audit", re: `audits?`, weight: 1 },
  { label: "examination (EN)", re: `examinations?`, weight: 2 },
  { label: "testing (EN)", re: `testing|statutory`, weight: 2 },
  { label: "compliance (EN)", re: `compliance`, weight: 1 },
];

/** Indices d'un marché de travaux (≠ vérification). */
export const WORKS_SIGNALS: Term[] = [
  { label: "travaux", re: "travaux", weight: 3 },
  { label: "fourniture et pose", re: `fournitures? et (pose|installation)`, weight: 3 },
  { label: "lot électricité / CFO-CFA", re: `cfo|cfa|courants? faibles?|electricite (cfo|cfa|courants)`, weight: 2 },
  { label: "rénovation / réhabilitation", re: `renovations?|rehabilitations?|refections?`, weight: 2 },
  { label: "construction", re: `constructions?`, weight: 2 },
  { label: "remplacement", re: `remplacements?`, weight: 1 },
  { label: "mise en conformité (travaux)", re: `mises? en conformite`, weight: 1 },
  { label: "works (EN)", re: `works|refurbishment|supply and install(ation)?`, weight: 2 },
];

export const MAINTENANCE_SIGNALS: Term[] = [
  { label: "maintenance", re: `maintenances?`, weight: 2 },
  { label: "entretien", re: `entretiens?`, weight: 2 },
  { label: "dépannage", re: `depannages?`, weight: 1 },
  { label: "réparation", re: `reparations?`, weight: 1 },
  { label: "maintenance (EN)", re: `servicing|repairs?`, weight: 1 },
];

export const SUPPLY_SIGNALS: Term[] = [
  { label: "fourniture", re: `fournitures?`, weight: 2 },
  { label: "acquisition / achat", re: `acquisitions?|achats?`, weight: 2 },
  { label: "location", re: `locations?`, weight: 1 },
  { label: "supply (EN)", re: `supply|purchase|delivery|rental|leasing`, weight: 2 },
];

/** Marchés multiservices / multitechniques susceptibles de contenir un volet levage ou électricité. */
export const MULTISERVICE_SIGNALS: Term[] = [
  { label: "contrôles réglementaires", re: `controles? reglementaires?|verifications? reglementaires?`, weight: 3 },
  { label: "vérifications périodiques", re: `verifications? periodiques?`, weight: 3 },
  { label: "maintenance multitechnique", re: `multi ?techniques?`, weight: 3 },
  { label: "multiservices", re: `multi ?services?`, weight: 2 },
  { label: "facility management", re: `facility management|facilities management|gestion technique (du|des) (patrimoine|batiments?)`, weight: 2 },
  { label: "contrôle technique de construction", re: `controle technique (de construction|des constructions)`, weight: 1 },
  { label: "multisites", re: `multi ?sites?`, weight: 1 },
  { label: "statutory inspections (EN)", re: `statutory (inspections?|compliance)`, weight: 3 },
];

/** Appels à fournisseurs, référencements, AMI. */
export const SUPPLIER_CALL_SIGNALS: Term[] = [
  { label: "appel à manifestation d'intérêt", re: `appels? a manifestation d interets?|\\bami\\b`, weight: 3 },
  { label: "référencement de prestataires", re: `referencements? (de |des )?(prestataires?|fournisseurs?)`, weight: 3 },
  { label: "appel à fournisseurs", re: `appels? (a|aux) (fournisseurs?|prestataires?)`, weight: 3 },
  { label: "sourcing", re: `sourcing|request for information|\\brfi\\b|expression of interest`, weight: 2 },
];

/**
 * Codes CPV (vocabulaire commun des marchés publics). Correspondance par préfixe significatif.
 * domain : orientation métier ; serviceType : nature de la prestation.
 */
export type CpvRule = { code: string; label: string; domain: DomainKey | "LES_DEUX" | "AUCUN"; serviceType: ServiceType; weight: number };
export type ServiceType = "INSPECTION" | "MAINTENANCE" | "TRAVAUX" | "FOURNITURE" | "MULTISERVICE" | "AUTRE";

export const CPV_RULES: CpvRule[] = [
  { code: "71631100", label: "Services d'inspection de machines", domain: "LEVAGE", serviceType: "INSPECTION", weight: 3 },
  { code: "71631300", label: "Services d'inspection technique de bâtiments", domain: "LES_DEUX", serviceType: "INSPECTION", weight: 2 },
  { code: "71631000", label: "Services d'inspection technique", domain: "LES_DEUX", serviceType: "INSPECTION", weight: 2 },
  { code: "71632000", label: "Services d'essais techniques", domain: "LES_DEUX", serviceType: "INSPECTION", weight: 2 },
  { code: "71630000", label: "Services d'inspection et d'essais techniques", domain: "LES_DEUX", serviceType: "INSPECTION", weight: 2 },
  { code: "71356100", label: "Services de contrôle technique", domain: "LES_DEUX", serviceType: "INSPECTION", weight: 2 },
  { code: "71700000", label: "Services de surveillance et de contrôle", domain: "AUCUN", serviceType: "INSPECTION", weight: 1 },
  { code: "71314100", label: "Services électriques (ingénierie)", domain: "ELECTRICITE", serviceType: "AUTRE", weight: 2 },
  { code: "50530000", label: "Services de réparation et d'entretien de machines", domain: "LEVAGE", serviceType: "MAINTENANCE", weight: 1 },
  { code: "50711000", label: "Réparation et entretien d'équipements électriques de bâtiments", domain: "ELECTRICITE", serviceType: "MAINTENANCE", weight: 2 },
  { code: "50532000", label: "Réparation et entretien de machines et appareils électriques", domain: "ELECTRICITE", serviceType: "MAINTENANCE", weight: 2 },
  { code: "50700000", label: "Réparation et entretien d'installations de bâtiments", domain: "AUCUN", serviceType: "MULTISERVICE", weight: 1 },
  { code: "79993100", label: "Services de gestion d'installations (facility management)", domain: "AUCUN", serviceType: "MULTISERVICE", weight: 1 },
  { code: "42410000", label: "Appareils de levage et de manutention", domain: "LEVAGE", serviceType: "FOURNITURE", weight: 3 },
  { code: "42414000", label: "Grues, portiques, chariots cavaliers…", domain: "LEVAGE", serviceType: "FOURNITURE", weight: 3 },
  { code: "42415000", label: "Chariots élévateurs, chariots de manutention", domain: "LEVAGE", serviceType: "FOURNITURE", weight: 3 },
  { code: "42419000", label: "Pièces pour appareils de levage et de manutention", domain: "LEVAGE", serviceType: "FOURNITURE", weight: 2 },
  { code: "34142000", label: "Camions-grues et camions à plate-forme élévatrice", domain: "LEVAGE", serviceType: "FOURNITURE", weight: 2 },
  { code: "45310000", label: "Travaux d'installation électrique", domain: "ELECTRICITE", serviceType: "TRAVAUX", weight: 2 },
  { code: "45311000", label: "Travaux de câblage et d'installations électriques", domain: "ELECTRICITE", serviceType: "TRAVAUX", weight: 2 },
  { code: "45317000", label: "Autres travaux d'installation électrique", domain: "ELECTRICITE", serviceType: "TRAVAUX", weight: 2 },
  { code: "31000000", label: "Machines, appareils et fournitures électriques", domain: "ELECTRICITE", serviceType: "FOURNITURE", weight: 1 },
];

/** Termes envoyés aux API de recherche (connecteurs) : volontairement larges, la qualification fait le tri. */
export const SEARCH_QUERIES: { domain: DomainKey | "MULTI"; fr: string[]; en: string[] }[] = [
  {
    domain: "LEVAGE",
    fr: [
      "appareils de levage",
      "équipements de levage",
      "accessoires de levage",
      "vérification générale périodique",
      "VGP",
      "pont roulant",
      "ponts roulants",
      "grue",
      "palan",
      "nacelle élévatrice",
      "PEMP",
      "chariots élévateurs",
      "élingues",
      "table élévatrice",
    ],
    en: ["lifting equipment", "overhead crane", "LOLER", "thorough examination", "mobile elevating work platform", "forklift inspection"],
  },
  {
    domain: "ELECTRICITE",
    fr: [
      "vérification des installations électriques",
      "vérifications électriques",
      "contrôle des installations électriques",
      "installations électriques vérification périodique",
      "thermographie infrarouge",
      "tableaux électriques contrôle",
    ],
    en: ["electrical installation inspection", "periodic electrical inspection", "electrical safety inspection", "electrical compliance testing", "EICR"],
  },
  {
    domain: "MULTI",
    fr: ["contrôles réglementaires", "vérifications réglementaires", "vérifications périodiques réglementaires", "maintenance multitechnique contrôles"],
    en: ["statutory inspections"],
  },
];
