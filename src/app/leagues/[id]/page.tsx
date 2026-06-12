import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import Leaderboard from "@/components/Leaderboard";
import JoinPublicButton from "@/components/JoinPublicButton";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!league) notFound();

  let isMember = false;
  if (user) {
    const { data } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    isMember = !!data;
  }

  const { data: rows } = await supabase
    .from("v_leaderboard")
    .select("*")
    .eq("league_id", id)
    .order("rank")
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl font-black">{league.name}</h1>
          <p className="text-sm font-bold text-slate-400">
            ${Number(league.starting_cash).toLocaleString()} starting cash · max{" "}
            {Number(league.max_position_pct)}% per card
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isMember && league.invite_code && (
            <span className="chip bg-blue-50 text-blue-700">
              Invite code: <span className="ml-1 tracking-widest">{league.invite_code}</span>
            </span>
          )}
          {!isMember && user && league.is_public && (
            <JoinPublicButton leagueId={league.id} />
          )}
        </div>
      </div>
      <Leaderboard rows={rows ?? []} highlightUserId={user?.id} />
    </div>
  );
}
