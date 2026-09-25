import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { AppProvider } from "@/components/app/context";
import { createClient } from "@/lib/supabase/server";
import type { DashboardStats, Inbox, Profile, Startup } from "@/lib/types";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: startup }, { data: inbox }, { data: stats }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single<Profile>(),
    supabase.from("startups").select("*").eq("owner_id", auth.user.id).single<Startup>(),
    supabase.from("inboxes").select("*").eq("owner_id", auth.user.id).eq("status", "active").maybeSingle<Inbox>(),
    // Rendered with the page so the Home checklist and numbers never jump on load.
    supabase.rpc("dashboard_stats").single<DashboardStats>(),
  ]);

  if (!profile || !startup || !startup.onboarding_completed_at) redirect("/onboarding");

  return (
    <AppProvider initial={{ profile, startup, inbox: inbox ?? null, signedUpAt: auth.user.created_at, stats: stats ?? null }}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
