import {
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  Car,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Plug,
  Settings,
  Stethoscope,
  UserCog,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Atelier",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/diagnostics", label: "Diagnostics", icon: Stethoscope, permission: "diagnostics:read" },
      { href: "/assistant", label: "Assistant IA", icon: Bot },
      { href: "/obd", label: "Boîtier OBD", icon: Plug, permission: "obd:use" },
      { href: "/planning", label: "Planning", icon: CalendarDays, permission: "planning:read" },
      { href: "/interventions", label: "Interventions", icon: Wrench, permission: "interventions:read" },
    ],
  },
  {
    title: "Clientèle",
    items: [
      { href: "/vehicles", label: "Véhicules", icon: Car, permission: "vehicles:read" },
      { href: "/vehicle-intake", label: "Réception véhicule", icon: ClipboardCheck, permission: "intake:write" },
      { href: "/clients", label: "Clients", icon: Users, permission: "clients:read" },
      { href: "/quotes", label: "Devis", icon: FileText, permission: "quotes:read" },
    ],
  },
  {
    title: "Garage",
    items: [
      { href: "/teams", label: "Équipes", icon: UsersRound },
      { href: "/members", label: "Membres", icon: UserCog },
      { href: "/stats", label: "Statistiques", icon: BarChart3, permission: "stats:view" },
      { href: "/garage", label: "Garage", icon: Building2 },
      { href: "/settings", label: "Paramètres", icon: Settings },
    ],
  },
];
