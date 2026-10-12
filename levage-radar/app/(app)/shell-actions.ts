"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { DEMO_COOKIE, demoEnabled } from "@/lib/demo";
import { getCtx } from "@/lib/auth/server";

export async function toggleDemoAction() {
  if (!demoEnabled() || !(await getCtx())) return;
  const jar = await cookies();
  const on = jar.get(DEMO_COOKIE)?.value === "1";
  if (on) jar.delete(DEMO_COOKIE);
  else jar.set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  refresh();
}

export async function setThemeAction(fd: FormData) {
  const theme = fd.get("theme") === "dark" ? "dark" : "light";
  (await cookies()).set("lr_theme", theme, { sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  refresh();
}
