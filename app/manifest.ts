import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MECANO AI — Copilote du garage",
    short_name: "MECANO AI",
    description: "Diagnostic OBD, IA locale, devis, interventions et organisation des équipes du garage.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1b1d22",
    theme_color: "#1b1d22",
    lang: "fr",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nouveau diagnostic", url: "/diagnostics/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Planning", url: "/planning", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Boîtier OBD", url: "/obd", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
