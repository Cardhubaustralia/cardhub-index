"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";

export default function JoinPublicButton({ leagueId }: { leagueId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn-primary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const supabase = browserClient();
          await supabase.rpc("join_public_league", { p_league_id: leagueId });
          router.refresh();
        })
      }
    >
      Join league
    </button>
  );
}
