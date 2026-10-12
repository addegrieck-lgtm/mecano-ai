import { createBoampConnector, BOAMP_INFO } from "./boamp";
import { createTedConnector, TED_INFO } from "./ted";
import type { Connector, ConnectorInfo } from "./types";

/**
 * Sources NON intégrées : listées explicitement (jamais présentées comme actives).
 * Chacune nécessite l'examen de ses conditions d'accès et de réutilisation avant tout développement.
 */
export const PLANNED_SOURCES: ConnectorInfo[] = [
  {
    id: "decp",
    name: "DECP — Données essentielles de la commande publique (data.gouv.fr)",
    status: "planned",
    geography: "France",
    dataTypes: ["Marchés attribués (titulaire, montant, durée)"],
    access: "Jeux de données ouverts (data.gouv.fr)",
    method: "À définir : import des fichiers consolidés",
    frequency: "À définir",
    licence: "Licence Ouverte / Etalab 2.0 (à confirmer par jeu de données)",
    officialUrl: "https://www.data.gouv.fr/",
    coverageLimits: ["Données a posteriori : utiles pour les contrats attribués et les renouvellements, pas pour les consultations ouvertes."],
    plannedNotes: "Prochaine source recommandée pour la veille des contrats attribués et des échéances (montants et durées publiés).",
  },
  {
    id: "place",
    name: "PLACE — Plateforme des achats de l'État",
    status: "planned",
    geography: "France (État et établissements publics)",
    dataTypes: ["Consultations de l'État"],
    access: "Consultation publique du site ; pas d'API publique de recherche identifiée à ce jour",
    method: "Non implémenté",
    frequency: "—",
    licence: "Conditions de réutilisation à vérifier",
    officialUrl: "https://www.marches-publics.gouv.fr/",
    coverageLimits: ["Une partie des consultations PLACE est également publiée au BOAMP / TED (déjà couverts)."],
    plannedNotes: "Ne pas automatiser la collecte sans accord ou API officielle (pas de contournement des conditions d'utilisation).",
  },
  {
    id: "buyer-profiles",
    name: "Profils d'acheteurs (Maximilien, AWS-Achat, Achatpublic, e-marchespublics…)",
    status: "planned",
    geography: "France",
    dataTypes: ["Consultations, notamment MAPA"],
    access: "Variable selon la plateforme (comptes, conditions d'utilisation)",
    method: "Non implémenté",
    frequency: "—",
    licence: "À vérifier plateforme par plateforme",
    officialUrl: "https://www.marches-publics.info/",
    coverageLimits: ["Principale source des petits marchés (MAPA) non publiés au BOAMP."],
    plannedNotes: "Évaluer les flux RSS / API officiels proposés par chaque plateforme.",
  },
  {
    id: "private-portals",
    name: "Portails d'achats privés et annonces d'investissements industriels",
    status: "planned",
    geography: "France / Europe",
    dataTypes: ["Appels à fournisseurs", "Projets industriels (extensions, nouvelles usines)"],
    access: "Pages publiques, souvent soumises à conditions ; certaines nécessitent un compte (signalé, jamais contourné)",
    method: "Non implémenté",
    frequency: "—",
    licence: "À vérifier site par site",
    officialUrl: "",
    coverageLimits: ["Aucune donnée privée n'est collectée actuellement."],
    plannedNotes: "En attendant, les signaux commerciaux peuvent être saisis via les notes et tâches des acheteurs.",
  },
];

export function implementedConnectors(): Connector[] {
  return [createBoampConnector(), createTedConnector()];
}

export const IMPLEMENTED_INFOS: ConnectorInfo[] = [BOAMP_INFO, TED_INFO];

export function connectorInfo(id: string): ConnectorInfo | undefined {
  return [...IMPLEMENTED_INFOS, ...PLANNED_SOURCES].find((c) => c.id === id) ?? (id === "demo" ? DEMO_INFO : undefined);
}

export const DEMO_INFO: ConnectorInfo = {
  id: "demo",
  name: "Données de démonstration (fictives)",
  status: "implemented",
  geography: "—",
  dataTypes: ["Exemples fictifs pour la découverte de l'interface"],
  access: "Local",
  method: "Jeu de données fictif généré par npm run db:seed-demo",
  frequency: "—",
  licence: "—",
  officialUrl: "",
  coverageLimits: ["Données FICTIVES, jamais mélangées aux données réelles."],
};
