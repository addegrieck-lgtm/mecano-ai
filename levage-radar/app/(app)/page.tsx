import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";

export default async function Home() {
  const ctx = await requireCtx();
  if (ctx.perms.has("opps.read")) redirect("/dashboard");
  if (ctx.perms.has("reports.lift.write") || ctx.perms.has("reports.lift.read_all")) redirect("/missions/levage");
  if (ctx.perms.has("reports.elec.write") || ctx.perms.has("reports.elec.read_all")) redirect("/missions/electricite");
  redirect("/settings");
}
