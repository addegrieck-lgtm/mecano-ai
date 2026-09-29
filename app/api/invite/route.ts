import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { ROLES } from "@/types";

const body = z.object({
  garage_id: z.string().uuid(),
  email: z.email().max(200),
  first_name: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  role: z.enum(ROLES),
  team_id: z.string().uuid().nullable().optional(),
});

/**
 * Invitation d'un membre (production, DEMO_MODE=false).
 * La clé service_role n'existe QUE côté serveur. Le demandeur est authentifié par son JWT et
 * doit être OWNER ou ADMIN du garage ciblé (protection inter-garages / IDOR).
 */
export async function POST(request: Request) {
  if (isDemoMode()) return Response.json({ error: "Indisponible en mode démo" }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return Response.json({ error: "Supabase non configuré" }, { status: 500 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Entrée invalide" }, { status: 400 });
  const input = parsed.data;

  const userClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: caller, error: authError } = await userClient.auth.getUser(token);
  if (authError || !caller.user) return Response.json({ error: "Session invalide" }, { status: 401 });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: membership } = await admin.from("garage_members").select("role").eq("garage_id", input.garage_id).eq("user_id", caller.user.id).maybeSingle();
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) return Response.json({ error: "Action non autorisée" }, { status: 403 });
  if (input.role === "OWNER" && membership.role !== "OWNER") return Response.json({ error: "Seul le patron peut nommer un patron" }, { status: 403 });
  if (input.team_id) {
    const { data: team } = await admin.from("teams").select("id").eq("id", input.team_id).eq("garage_id", input.garage_id).maybeSingle();
    if (!team) return Response.json({ error: "Équipe inconnue" }, { status: 400 });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, { data: { first_name: input.first_name, name: input.name } });
  if (inviteError || !invited.user) return Response.json({ error: inviteError?.message ?? "Invitation impossible" }, { status: 400 });

  const userId = invited.user.id;
  const { error: memberError } = await admin.from("garage_members").insert({ garage_id: input.garage_id, user_id: userId, role: input.role, team_id: input.team_id ?? null, permissions: [] });
  if (memberError) return Response.json({ error: memberError.message }, { status: 400 });
  if (input.team_id) await admin.from("team_members").insert({ garage_id: input.garage_id, team_id: input.team_id, user_id: userId });
  await admin.from("audit_logs").insert({ garage_id: input.garage_id, user_id: caller.user.id, action: "member.add", entity_type: "garage_member", details: { email: input.email, role: input.role, invited: true } });
  return Response.json({ ok: true });
}
