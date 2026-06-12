import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import CountdownBar from "@/components/CountdownBar";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "CardHub Index — Fantasy TCG Market",
  description:
    "Trade Pokémon and One Piece cards with virtual cash. Lock in your trades, beat the market, top the leaderboard.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .single();
    username = data?.username ?? null;
  }

  const { data: cycle } = await supabase
    .rpc("current_open_cycle")
    .maybeSingle();
  let nextCycle = cycle as {
    id: number;
    locks_at: string;
    executes_at: string;
  } | null;
  if (!nextCycle) {
    const { data } = await supabase
      .from("trade_cycles")
      .select("id, locks_at, executes_at")
      .in("status", ["scheduled", "open", "locked"])
      .order("executes_at")
      .limit(1)
      .maybeSingle();
    nextCycle = data;
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans min-h-screen antialiased">
        <Navbar username={username} />
        {nextCycle && (
          <CountdownBar
            locksAt={nextCycle.locks_at}
            executesAt={nextCycle.executes_at}
          />
        )}
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}
