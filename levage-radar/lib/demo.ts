/**
 * Données de démonstration : autorisées uniquement si ENABLE_DEMO_DATA=true, et JAMAIS affichées
 * en même temps que les données réelles (l'utilisateur bascule explicitement d'un espace à l'autre).
 */
export const demoEnabled = () => process.env.ENABLE_DEMO_DATA === "true";
export const DEMO_COOKIE = "lr_demo_view";
