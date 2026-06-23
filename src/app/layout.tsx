import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import CountdownBar from "@/components/CountdownBar";
import OnboardingModal from "@/components/OnboardingModal";
import MobileNav from "@/components/MobileNav";
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
  let needsOnboarding = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username, onboarded")
      .eq("user_id", user.id)
      .single();
    username = data?.username ?? null;
    needsOnboarding = data ? !data.onboarded : false;
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

  // how many trades the whole field has locked in for this lockout
  let pendingCount = 0;
  if (nextCycle) {
    const { data: pc } = await supabase.rpc("pending_cycle_orders");
    pendingCount = typeof pc === "number" ? pc : 0;
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* load the font without blocking first paint (swaps in when ready) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
          media="print"
          // eslint-disable-next-line react/no-unknown-property
          {...{ onLoad: "this.media='all'" } as Record<string, string>}
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
          />
        </noscript>
      </head>
      <body className="font-sans min-h-screen antialiased">
        <Navbar username={username} />
        {nextCycle && (
          <CountdownBar
            locksAt={nextCycle.locks_at}
            executesAt={nextCycle.executes_at}
            pendingCount={pendingCount}
          />
        )}
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pb-16">{children}</main>
        <MobileNav signedIn={!!user} />
        {needsOnboarding && <OnboardingModal />}
      </body>
    </html>
  );
}
