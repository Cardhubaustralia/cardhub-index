import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, country")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-black">Settings</h1>
      <SettingsForm
        email={user.email ?? ""}
        username={profile?.username ?? ""}
        displayName={profile?.display_name ?? ""}
        country={profile?.country ?? ""}
      />
    </div>
  );
}
