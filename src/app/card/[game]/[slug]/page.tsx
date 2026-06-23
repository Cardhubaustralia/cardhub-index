import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import RangeChart from "@/components/RangeChart";
import TradePanel, { LeagueCtx } from "@/components/TradePanel";
import OrderFlow from "@/components/OrderFlow";
import WatchButton from "@/components/WatchButton";
import { usd, pct, pctClass, sanePct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string; slug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { game, slug } = await params;
  const { v } = await searchParams;
  const supabase = await serverClient();

  const { data: gameRow } = await supabase
    .from("games").select("category_id, display_name").eq("slug", game).maybeSingle();
  if (!gameRow) notFound();

  const { data: card } = await supabase
    .from("cards")
    .select("product_id, name, number, rarity, image_url, slug, sets(name, slug), games(display_name, slug)")
    .eq("category_id", gameRow.category_id)
    .eq("slug", slug)
    .maybeSingle();
  if (!card) notFound();

  const { data: assets } = await supabase
    .from("assets")
    .select("*")
    .eq("product_id", card.product_id)
    .order("price", { ascending: false, nullsFirst: false });
  if (!assets?.length) notFound();

  const active =
    assets.find((a) => a.variant === v) ??
    assets.find((a) => a.price != null) ??
    assets[0];

  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data: snaps } = await supabase
    .from("price_snapshots")
    .select("price, captured_at")
    .eq("asset_id", active.id)
    .gte("captured_at", since)
    .order("captured_at");

  const chartData = (snaps ?? []).map((s) => ({
    t: s.captured_at as string,
    price: Number(s.price),
  }));
  // always end the series on the current cycle price
  if (active.price != null) {
    const today = new Date().toISOString().slice(0, 10);
    const last = chartData[chartData.length - 1];
    if (!last || last.t.slice(0, 10) !== today) {
      chartData.push({ t: new Date().toISOString(), price: Number(active.price) });
    } else {
      last.price = Number(active.price);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let leagues: LeagueCtx[] = [];
  if (user) {
    const [{ data: ports }, { data: lb }, { data: pend }] = await Promise.all([
      supabase
        .from("portfolios")
        .select("id, cash, league_id, leagues(id, name, max_position_pct)")
        .eq("user_id", user.id),
      supabase.rpc("leaderboard").eq("user_id", user.id),
      supabase
        .from("orders")
        .select("id, side, qty, est_price, league_id")
        .eq("user_id", user.id).eq("asset_id", active.id).eq("status", "pending"),
    ]);
    const portIds = (ports ?? []).map((p) => p.id);
    const [{ data: holds }, { data: elig }] = await Promise.all([
      portIds.length
        ? supabase.from("holdings")
            .select("portfolio_id, qty, avg_cost").in("portfolio_id", portIds).eq("asset_id", active.id)
        : Promise.resolve({ data: [] as { portfolio_id: string; qty: number; avg_cost: number }[] }),
      supabase.rpc("eligible_leagues_for_asset", { p_asset_id: active.id }),
    ]);
    const eligibleIds = new Set((elig ?? []).map((r: { league_id: string }) => r.league_id));
    const holdByPort = new Map((holds ?? []).map((h) => [h.portfolio_id, h]));
    const valueByLeague = new Map(
      ((lb ?? []) as { league_id: string; value: number }[]).map((r) => [r.league_id, Number(r.value)])
    );

    leagues = (ports ?? []).map((p) => {
      const l = p.leagues as unknown as { id: string; name: string; max_position_pct: number };
      const h = holdByPort.get(p.id) as { qty: number; avg_cost: number } | undefined;
      return {
        id: p.league_id,
        name: l?.name ?? "League",
        cash: Number(p.cash),
        maxPct: Number(l?.max_position_pct ?? 25),
        value: valueByLeague.get(p.league_id) ?? Number(p.cash),
        holdingQty: h?.qty ?? 0,
        holdingAvg: Number(h?.avg_cost ?? 0),
        eligible: eligibleIds.has(p.league_id),
        pending: (pend ?? [])
          .filter((o) => o.league_id === p.league_id)
          .map((o) => ({ id: o.id, side: o.side, qty: o.qty, est_price: o.est_price })),
      };
    });
  }

  const { data: cycle } = await supabase.rpc("current_open_cycle").maybeSingle();
  const tradingOpen = !!cycle;

  let watching = false;
  if (user) {
    const { data: w } = await supabase
      .from("watchlist").select("asset_id").eq("user_id", user.id).eq("asset_id", active.id).maybeSingle();
    watching = !!w;
  }

  const set = card.sets as unknown as { name: string; slug: string };

  const stat = (label: string, value: string, cls = "") => (
    <div className="panel px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-black ${cls}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <p className="text-sm font-bold text-slate-400">
        <Link href="/market" className="hover:underline">Market</Link>
        {" / "}
        <Link href={`/market?game=${game}`} className="hover:underline">
          {gameRow.display_name}
        </Link>
        {" / "}
        <span className="text-slate-600">{card.name}</span>
      </p>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <div className="panel overflow-hidden p-3">
            <div className="relative mx-auto aspect-[5/7] w-full max-w-[240px]">
              {card.image_url ? (
                <Image
                  src={card.image_url}
                  alt={card.name}
                  fill
                  sizes="240px"
                  className="rounded-xl object-contain"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-xl bg-slate-100 font-bold text-slate-400">
                  No image
                </div>
              )}
            </div>
          </div>
          <TradePanel
            assetId={active.id}
            price={active.price == null ? null : Number(active.price)}
            leagues={leagues}
            signedIn={!!user}
            tradingOpen={tradingOpen}
          />
          <OrderFlow assetId={active.id} />
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-black leading-tight">
                {card.name}
                {card.number ? (
                  <span className="text-slate-400"> · #{card.number}</span>
                ) : null}
              </h1>
              <WatchButton assetId={active.id} initialWatching={watching} signedIn={!!user} />
            </div>
            <p className="font-bold text-slate-500">
              {set?.name}
              {card.rarity ? ` · ${card.rarity}` : ""} · {active.variant}
            </p>
          </div>

          <div className="flex items-end gap-4">
            <p className="text-4xl font-black">{usd(active.price)}</p>
            <p className={`pb-1 text-lg font-extrabold ${pctClass(active.change_pct)}`}>
              {pct(active.change_pct)} this cycle
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat("Prev cycle", usd(active.prev_price))}
            {stat("7d change", pct(sanePct(active.change_7d_pct)), pctClass(sanePct(active.change_7d_pct)))}
            {stat("30d change", pct(sanePct(active.change_30d_pct)), pctClass(sanePct(active.change_30d_pct)))}
            {stat("Source", active.price_source === "blend" ? "TCGP + CM blend" : "TCGPlayer")}
          </div>

          <section className="panel p-5">
            <RangeChart data={chartData} />
          </section>

          {assets.length > 1 && (
            <section className="panel overflow-hidden">
              <h2 className="px-5 pt-4 font-black">Variants ({assets.length})</h2>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2">Printing</th>
                    <th className="px-5 py-2 text-right">Price</th>
                    <th className="px-5 py-2 text-right">Change</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr
                      key={a.id}
                      className={
                        "border-t border-slate-100 font-bold " +
                        (a.id === active.id ? "bg-blue-50/60" : "")
                      }
                    >
                      <td className="px-5 py-3">{a.variant}</td>
                      <td className="px-5 py-3 text-right font-black">{usd(a.price)}</td>
                      <td className={`px-5 py-3 text-right ${pctClass(a.change_pct)}`}>
                        {pct(a.change_pct)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {a.id !== active.id && (
                          <Link
                            href={`/card/${game}/${slug}?v=${encodeURIComponent(a.variant)}`}
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
