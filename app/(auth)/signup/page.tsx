import { AuthForm } from "@/components/auth/auth-form";
import { isDemoMode } from "@/lib/config";

export default function Page() {
  return <AuthForm kind="signup" demo={isDemoMode()} />;
}
