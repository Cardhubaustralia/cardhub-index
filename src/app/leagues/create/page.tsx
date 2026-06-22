import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import CreateGameForm, { SetLite } from "@/components/CreateGameForm";

export const dynamic = "force-dynamic";

export default async function CreateGamePage() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/leagues/create");

  const { data: prof } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  const role = prof?.role ?? "user";
  if (role !== "lead" && role !== "admin") {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
        <h1 className="text-2xl font-black">Creating games is limited</h1>
        <p className="font-bold text-slate-500">
          Only league leads and admins can create games. Ask an admin to upgrade your role,
          or join an existing game.
        </p>
        <Link href="/leagues" className="btn-primary inline-flex">Browse games</Link>
      </div>
    );
  }

  const { data: setData } = await supabase
    .from("v_sets").select("slug, name, group_id, game_slug").order("name");
  const sets = (setData ?? []) as SetLite[];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Create a game</h1>
        <Link href="/leagues" className="btn-ghost text-sm">← Games</Link>
      </div>
      <CreateGameForm sets={sets} />
    </div>
  );
}
