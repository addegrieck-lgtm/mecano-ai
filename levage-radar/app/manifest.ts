import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LEVAGE RADAR",
    short_name: "Levage Radar",
    description: "Veille commerciale et préparation des rapports d'inspection levage & électricité",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1a449a",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
