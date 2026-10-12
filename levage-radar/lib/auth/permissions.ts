/**
 * Rôles et permissions. Les valeurs par défaut sont définies ici ; chaque organisation peut
 * les surcharger (organizations.settings.rolePermissions) et accorder des permissions
 * supplémentaires à un utilisateur (users.extra_permissions).
 * Les contrôles sont TOUJOURS effectués côté serveur (services), jamais uniquement dans l'interface.
 */

export const PERMISSIONS = {
  "opps.read": "Consulter le radar commercial",
  "opps.track": "Suivre les opportunités (statut, favoris, notes, tâches, alertes)",
  "opps.export": "Exporter les opportunités",
  "sources.run": "Lancer / relancer une collecte",
  "assistant.use": "Utiliser l'assistant commercial",
  "clients.read": "Consulter clients et sites",
  "clients.write": "Créer / modifier clients et sites",
  "reports.lift.write": "Créer et éditer ses dossiers levage",
  "reports.lift.read_all": "Consulter tous les dossiers levage",
  "reports.lift.manage_all": "Modifier tous les dossiers levage",
  "reports.elec.write": "Créer et éditer ses dossiers électricité",
  "reports.elec.read_all": "Consulter tous les dossiers électricité",
  "reports.elec.manage_all": "Modifier tous les dossiers électricité",
  "reports.export": "Exporter les brouillons de rapports",
  "templates.manage": "Créer / modifier les modèles de mission",
  "templates.validate": "Valider une version de modèle (responsable technique)",
  "users.manage": "Gérer les utilisateurs et les rôles",
  "settings.manage": "Gérer les paramètres de l'organisation",
  "audit.read": "Consulter l'historique des actions",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLES = {
  ADMIN: "Administrateur",
  BUSINESS: "Chargé d'affaires",
  INSPECTOR_LIFT: "Inspecteur levage",
  INSPECTOR_ELEC: "Inspecteur électricité",
  TECH_MANAGER: "Responsable technique",
  READER: "Lecteur autorisé",
} as const;

export type Role = keyof typeof ROLES;
export const ALL_ROLES = Object.keys(ROLES) as Role[];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  BUSINESS: ["opps.read", "opps.track", "opps.export", "sources.run", "assistant.use", "clients.read", "clients.write"],
  INSPECTOR_LIFT: ["clients.read", "clients.write", "reports.lift.write", "reports.export"],
  INSPECTOR_ELEC: ["clients.read", "clients.write", "reports.elec.write", "reports.export"],
  TECH_MANAGER: [
    "clients.read",
    "clients.write",
    "reports.lift.write",
    "reports.lift.read_all",
    "reports.lift.manage_all",
    "reports.elec.write",
    "reports.elec.read_all",
    "reports.elec.manage_all",
    "reports.export",
    "templates.manage",
    "templates.validate",
    "audit.read",
  ],
  READER: ["opps.read", "clients.read", "reports.lift.read_all", "reports.elec.read_all"],
};

export function isRole(value: string): value is Role {
  return (ALL_ROLES as string[]).includes(value);
}

export function resolvePermissions(
  role: string,
  extra: string[] = [],
  orgOverrides?: Record<string, string[]>,
): Set<Permission> {
  const base: string[] =
    orgOverrides && isRole(role) && Array.isArray(orgOverrides[role])
      ? orgOverrides[role]
      : isRole(role)
        ? DEFAULT_ROLE_PERMISSIONS[role]
        : [];
  const set = new Set<Permission>();
  for (const p of [...base, ...extra]) if (p in PERMISSIONS) set.add(p as Permission);
  // L'administrateur conserve toujours la gestion des utilisateurs (évite un verrouillage de l'organisation).
  if (role === "ADMIN") {
    set.add("users.manage");
    set.add("settings.manage");
  }
  return set;
}

export type Domain = "LEVAGE" | "ELECTRICITE";

export function reportPerms(domain: Domain) {
  const k = domain === "LEVAGE" ? "lift" : "elec";
  return {
    write: `reports.${k}.write` as Permission,
    readAll: `reports.${k}.read_all` as Permission,
    manageAll: `reports.${k}.manage_all` as Permission,
  };
}
