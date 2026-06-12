import { serverClient } from "@/lib/supabase/server";
import Leaderboard from "@/components/Leaderboard";

export const revalidate = 120;
const GLOBAL_LEAGUE = "00000000-0000-0000-0000-000000000001";

export default async function LeaderboardPage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from("v_leaderboard")
    .select("*")
    .eq("league_id", GLOBAL_LEAGUE)
    .order("rank")
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Global leaderboard</h1>
        <p className="font-bold text-slate-400">
          Every player, ranked by portfolio value at current prices.
        </p>
      </div>
      <Leaderboard rows={rows ?? []} highlightUserId={user?.id} />
    </div>
  );
}
