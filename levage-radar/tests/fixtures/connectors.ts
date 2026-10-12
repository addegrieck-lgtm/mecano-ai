/**
 * FIXTURES DE FORMAT — données FICTIVES reproduisant la structure documentée des API
 * (BOAMP Opendatasoft v2.1, TED Search API v3). Elles servent à tester le code de transformation
 * hors réseau ; elles ne représentent aucun avis réel.
 */
export const BOAMP_RECORD = {
  idweb: "26-999001",
  id: "26-999001",
  objet: "Vérifications générales périodiques des appareils de levage et accessoires",
  nomacheteur: "COMMUNE FICTIVE DE TESTVILLE",
  dateparution: "2026-10-08",
  datelimitereponse: "2026-11-11T12:00:00+01:00",
  code_departement: ["69"],
  nature: "APPEL_OFFRE",
  nature_libelle: "Avis de marché",
  nature_categorise_libelle: "Avis de marché",
  type_marche: ["SERVICES"],
  procedure_libelle: "Procédure adaptée",
  descripteur_libelle: ["Contrôle technique", "Levage"],
  url_avis: "https://www.boamp.fr/pages/avis/?q=idweb:26-999001",
  donnees: JSON.stringify({
    OBJET: {
      OBJET_COMPLET: "Le présent marché a pour objet les vérifications générales périodiques des ponts roulants, palans, potences et accessoires de levage des services techniques.",
      CPV: { PRINCIPAL: "71631100-1" },
      VALEUR_ESTIMEE: "45000",
      DUREE_MOIS: "36",
      LOTS: {
        LOT: [
          { NUM: "1", INTITULE: "Ponts roulants et palans", CPV: { PRINCIPAL: "71631100" } },
          { NUM: "2", INTITULE: "Accessoires de levage", DESCRIPTION: "Élingues, chaînes, palonniers" },
        ],
      },
    },
    IDENTITE: { DENOMINATION: "Commune fictive", CP: "69003", VILLE: "Lyon", SIRET: "00000000000000" },
  }),
};

export const BOAMP_AWARD_RECORD = {
  idweb: "26-999777",
  objet: "Vérifications générales périodiques des appareils de levage et accessoires",
  nomacheteur: "Commune fictive de Testville",
  dateparution: "2026-12-20",
  code_departement: "69",
  nature_categorise_libelle: "Résultat de marché",
  titulaire: ["Société fictive de contrôle"],
  donnees: JSON.stringify({ ANNONCE_ANTERIEUR: { REFERENCE: "26-999001" } }),
};

export const TED_NOTICE = {
  "publication-number": "654321-2026",
  "notice-title": { fra: "France – Services d'inspection technique – Vérification des installations électriques des lycées", eng: "France – Technical inspection services – Electrical installation inspection" },
  "notice-type": "cn-standard",
  "buyer-name": { fra: ["Région fictive"] },
  "buyer-country": ["FRA"],
  "classification-cpv": ["71631000", "71631300"],
  "publication-date": "2026-10-09+02:00",
  deadline: ["2026-11-20T16:00:00+01:00"],
  "total-value": ["120000"],
  "total-value-cur": ["EUR"],
  links: { html: { FRA: "https://ted.europa.eu/fr/notice/-/detail/654321-2026" } },
};
