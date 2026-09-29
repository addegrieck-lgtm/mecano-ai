import { AppProvider } from "@/components/app/app-provider";
import { AppShell } from "@/components/app/app-shell";
import { isDemoMode } from "@/lib/config";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider mode={isDemoMode() ? "demo" : "supabase"}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
