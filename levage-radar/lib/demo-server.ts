import "server-only";
import { cookies } from "next/headers";
import { DEMO_COOKIE, demoEnabled } from "./demo";

export async function isDemoView(): Promise<boolean> {
  return demoEnabled() && (await cookies()).get(DEMO_COOKIE)?.value === "1";
}
