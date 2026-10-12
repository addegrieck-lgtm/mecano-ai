import type { TemplateDefinition } from "./template-schema";

/**
 * MODÈLES D'EXEMPLE — proposés en BROUILLON. Ils doivent être relus, adaptés et VALIDÉS par un responsable
 * technique habilité avant toute utilisation (une mission ne peut être créée qu'à partir d'une version validée).
 * Ils ne contiennent volontairement aucune référence réglementaire, aucun critère de conformité ni aucune valeur limite.
 */

const NOTICE =
  "Document de travail préparatoire à la rédaction du rapport dans l'outil officiel. Il ne constitue ni un rapport officiel, ni une attestation de conformité. Toute conclusion technique relève de l'inspecteur habilité.";

export const LEVAGE_EXAMPLE: TemplateDefinition = {
  domain: "LEVAGE",
  headerFields: [
    {
      key: "type_mission",
      label: "Type de mission",
      type: "select",
      required: true,
      options: ["Vérification générale périodique", "Examen d'adéquation / mise en service", "Vérification de remise en service", "Autre (préciser)"],
    },
    { key: "type_mission_autre", label: "Préciser le type de mission", type: "text", required: true, showIf: { field: "type_mission", equals: "Autre (préciser)" } },
    { key: "contact_site", label: "Contact sur site", type: "text" },
    { key: "contact_tel", label: "Téléphone du contact", type: "text", export: false },
    { key: "documents_disponibles", label: "Documents présentés", type: "multiselect", options: ["Registre de sécurité", "Rapport précédent", "Notices constructeur", "Carnet de maintenance", "Autre"] },
  ],
  itemTypes: [
    {
      key: "appareil",
      label: "Appareil de levage",
      pluralLabel: "Appareils de levage",
      labelField: "designation",
      fields: [
        {
          key: "famille",
          label: "Famille",
          type: "select",
          required: true,
          options: ["Pont roulant", "Portique", "Palan", "Potence", "Treuil", "Grue mobile", "Grue à tour", "Grue auxiliaire", "Nacelle / PEMP", "Chariot élévateur", "Table élévatrice", "Autre"],
        },
        { key: "designation", label: "Désignation", type: "text", required: true },
        { key: "marque", label: "Marque", type: "text" },
        { key: "modele", label: "Modèle", type: "text" },
        { key: "numero_serie", label: "Numéro de série", type: "text" },
        { key: "repere", label: "Identifiant / repère", type: "text" },
        { key: "capacite_nominale", label: "Capacité nominale", type: "number", unit: "kg", min: 0, help: "Valeur relevée sur la plaque ou le document du constructeur." },
        { key: "localisation", label: "Localisation", type: "text" },
        { key: "infos_techniques", label: "Informations techniques utiles", type: "textarea" },
      ],
    },
    {
      key: "accessoire",
      label: "Accessoire de levage",
      pluralLabel: "Accessoires de levage",
      labelField: "identification",
      fields: [
        { key: "type_accessoire", label: "Type", type: "select", required: true, options: ["Élingue chaîne", "Élingue câble", "Élingue textile", "Manille", "Palonnier", "Crochet", "Pince / griffe", "Autre"] },
        { key: "identification", label: "Identification / repère", type: "text", required: true },
        { key: "cmu", label: "Charge maximale d'utilisation marquée", type: "number", unit: "kg", min: 0 },
        { key: "quantite", label: "Quantité", type: "number", min: 1 },
        { key: "localisation", label: "Localisation", type: "text" },
      ],
    },
  ],
  measurementTypes: [
    { key: "charge_essai", label: "Charge d'essai utilisée (si un essai a été réalisé)", units: ["kg", "t"], appliesTo: ["appareil"] },
  ],
  observationPriorities: [
    { key: "p1", label: "Priorité interne 1" },
    { key: "p2", label: "Priorité interne 2" },
    { key: "p3", label: "Priorité interne 3" },
  ],
  treatmentStatuses: [
    { key: "a_traiter", label: "À traiter" },
    { key: "a_verifier", label: "À vérifier" },
    { key: "traitee", label: "Traitée" },
  ],
  requiredAttachments: [{ key: "plaque", label: "Photo de la plaque constructeur", itemType: "appareil", kind: "photo" }],
  checklist: [
    "Tous les équipements prévus à l'ordre de mission ont été vus ou leur absence est notée",
    "Les observations ont été relues par l'inspecteur",
    "Les informations à compléter ont été identifiées",
  ],
  exportOptions: { includePhotos: true, includeMeasurements: true },
  notice: NOTICE,
};

export const ELECTRICITE_EXAMPLE: TemplateDefinition = {
  domain: "ELECTRICITE",
  headerFields: [
    {
      key: "type_mission",
      label: "Type de mission",
      type: "select",
      required: true,
      options: ["Vérification périodique", "Vérification initiale", "Inspection de bâtiment", "Inspection de site industriel", "Intervention sur chantier", "Autre (préciser)"],
    },
    { key: "type_mission_autre", label: "Préciser le type de mission", type: "text", required: true, showIf: { field: "type_mission", equals: "Autre (préciser)" } },
    { key: "nature_site", label: "Nature du bâtiment ou du site", type: "select", required: true, options: ["Tertiaire", "Industriel", "Établissement recevant du public", "Habitat collectif", "Chantier", "Autre"] },
    { key: "description_installation", label: "Description de l'installation", type: "textarea" },
    { key: "zones_concernees", label: "Zones concernées", type: "textarea" },
    { key: "schema_liaison_terre", label: "Schéma de liaison à la terre (si connu)", type: "select", options: ["TT", "TN-C", "TN-S", "TN-C-S", "IT", "Non déterminé"] },
    { key: "puissance", label: "Puissance (si connue)", type: "number", unit: "kVA", min: 0 },
    { key: "documents_disponibles", label: "Documents présentés", type: "multiselect", options: ["Schémas électriques", "Rapport précédent", "Registre", "Notes de calcul", "Autre"] },
  ],
  itemTypes: [
    {
      key: "zone",
      label: "Zone / local",
      pluralLabel: "Zones et locaux",
      labelField: "nom",
      fields: [
        { key: "nom", label: "Nom de la zone / du local", type: "text", required: true },
        { key: "usage", label: "Usage", type: "text" },
        { key: "conditions", label: "Conditions particulières (humidité, poussières…)", type: "textarea" },
      ],
    },
    {
      key: "tableau",
      label: "Tableau électrique",
      pluralLabel: "Tableaux électriques",
      labelField: "repere",
      fields: [
        { key: "repere", label: "Repère", type: "text", required: true },
        { key: "type_tableau", label: "Type", type: "select", options: ["TGBT", "Tableau divisionnaire", "Armoire", "Coffret", "Autre"] },
        { key: "localisation", label: "Localisation", type: "text" },
        { key: "infos", label: "Informations techniques utiles", type: "textarea" },
      ],
    },
    {
      key: "circuit",
      label: "Circuit",
      pluralLabel: "Circuits",
      parentTypes: ["tableau"],
      labelField: "repere",
      fields: [
        { key: "repere", label: "Repère", type: "text", required: true },
        { key: "designation", label: "Désignation", type: "text" },
        { key: "protection", label: "Dispositif de protection (relevé)", type: "text" },
        { key: "calibre", label: "Calibre relevé", type: "number", unit: "A", min: 0 },
      ],
    },
    {
      key: "equipement",
      label: "Équipement",
      pluralLabel: "Équipements",
      labelField: "designation",
      fields: [
        { key: "designation", label: "Désignation", type: "text", required: true },
        { key: "localisation", label: "Localisation", type: "text" },
        { key: "infos", label: "Informations utiles", type: "textarea" },
      ],
    },
  ],
  measurementTypes: [
    { key: "resistance_terre", label: "Résistance de prise de terre", units: ["Ω"], appliesTo: ["tableau", "zone"] },
    { key: "continuite", label: "Continuité des conducteurs de protection", units: ["Ω"], appliesTo: ["circuit", "equipement", "tableau"] },
    { key: "isolement", label: "Résistance d'isolement", units: ["MΩ"], appliesTo: ["circuit", "tableau"] },
    { key: "ddr_courant", label: "Dispositif différentiel — courant de déclenchement mesuré", units: ["mA"], appliesTo: ["circuit", "tableau"] },
    { key: "ddr_temps", label: "Dispositif différentiel — temps de déclenchement mesuré", units: ["ms"], appliesTo: ["circuit", "tableau"] },
    { key: "impedance_boucle", label: "Impédance de boucle", units: ["Ω"], appliesTo: ["circuit"] },
    { key: "tension", label: "Tension", units: ["V"], appliesTo: ["tableau", "circuit", "equipement"] },
  ],
  observationPriorities: [
    { key: "p1", label: "Priorité interne 1" },
    { key: "p2", label: "Priorité interne 2" },
    { key: "p3", label: "Priorité interne 3" },
  ],
  treatmentStatuses: [
    { key: "a_traiter", label: "À traiter" },
    { key: "a_verifier", label: "À vérifier" },
    { key: "traitee", label: "Traitée" },
  ],
  requiredAttachments: [],
  checklist: [
    "Les zones prévues ont été parcourues ou leur exclusion est notée",
    "Les mesures saisies correspondent à des mesures réellement effectuées",
    "Les éléments non contrôlés sont identifiés",
  ],
  exportOptions: { includePhotos: true, includeMeasurements: true },
  notice: NOTICE,
};
