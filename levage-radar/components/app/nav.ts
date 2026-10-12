import type { Permission } from "@/lib/auth/permissions";

export type NavItem = { href: string; label: string; icon: string; perms: Permission[] };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "Radar commercial",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: "LayoutDashboard", perms: ["opps.read"] },
      { href: "/radar", label: "Opportunités", icon: "Radar", perms: ["opps.read"] },
      { href: "/buyers", label: "Acheteurs", icon: "Building2", perms: ["opps.read"] },
      { href: "/tasks", label: "Tâches & rappels", icon: "ListChecks", perms: ["opps.track"] },
      { href: "/alerts", label: "Alertes & recherches", icon: "BellRing", perms: ["opps.track"] },
      { href: "/reports/daily", label: "Rapport quotidien", icon: "Newspaper", perms: ["opps.read"] },
      { href: "/assistant", label: "Assistant", icon: "MessageSquareText", perms: ["assistant.use"] },
      { href: "/sources", label: "État des connecteurs", icon: "PlugZap", perms: ["opps.read"] },
    ],
  },
  {
    title: "Rapports d'inspection",
    items: [
      { href: "/missions/levage", label: "Rapports levage", icon: "Construction", perms: ["reports.lift.write", "reports.lift.read_all", "reports.lift.manage_all"] },
      { href: "/missions/electricite", label: "Rapports électricité", icon: "Zap", perms: ["reports.elec.write", "reports.elec.read_all", "reports.elec.manage_all"] },
      { href: "/clients", label: "Clients & sites", icon: "MapPin", perms: ["clients.read"] },
      { href: "/templates", label: "Modèles de mission", icon: "FileCog", perms: ["templates.manage", "templates.validate", "reports.lift.write", "reports.elec.write", "reports.lift.read_all", "reports.elec.read_all"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/exports", label: "Exports & documents", icon: "FileDown", perms: ["opps.export", "reports.export"] },
      { href: "/audit", label: "Historique des actions", icon: "History", perms: ["audit.read"] },
      { href: "/admin/users", label: "Utilisateurs & droits", icon: "Users", perms: ["users.manage"] },
      { href: "/settings", label: "Paramètres", icon: "Settings", perms: [] },
    ],
  },
];
