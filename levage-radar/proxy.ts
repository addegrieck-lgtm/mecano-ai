import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirection optimiste vers la connexion si aucun cookie de session n'est présent.
 * La vérification réelle (session valide, permissions) est faite côté serveur dans chaque page, action et route.
 */
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/setup", "/api/cron", "/api/health", "/manifest.webmanifest", "/sw.js", "/offline.html", "/icon.svg"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!request.cookies.has("lr_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
