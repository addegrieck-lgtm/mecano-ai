import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LEVAGE RADAR", template: "%s — LEVAGE RADAR" },
  description: "Veille commerciale et préparation des rapports d'inspection levage & électricité.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1a449a", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("lr_theme")?.value;
  return (
    <html lang="fr" className={theme === "dark" ? "dark" : undefined}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
