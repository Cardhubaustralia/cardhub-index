import { serverClient } from "@/lib/supabase/server";
import { usd, pct, pctClass } from "@/lib/format";
import Sparkline from "@/components/Sparkline";

interface StatRow {
  category_id: number;
  slug: string;
  display_name: string;
  index_value: number | null;
  card_count: number | null;
  index_7d: number | null;
  index_30d: number | null;
  index_90d: number | null;
}

const change = (now: number | null, then: number | null) =>
  now != null && then != null && then > 0 ? ((now - then) / then) * 100 : null;

export default async function MarketOverview() {
  const supabase = await serverClient();
  const { data: stats } = await supabase
    .from("v_market_stats")
    .select("*")
    .order("index_value", { ascending: false, nullsFirst: false });

  const rows = (stats ?? []) as StatRow[];
  if (!rows.length || rows.every((r) => r.index_value == null)) return null;

  const series = await Promise.all(
    rows.map(async (r) => {
      const { data } = await supabase.rpc("market_index_series", {
        p_category: r.category_id,
        p_limit: 40,
      });
      return (data ?? [])
        .map((d: { index_value: number }) => Number(d.index_value))
        .reverse();
    })
  );

  const total = rows.reduce((s, r) => s + Number(r.index_value ?? 0), 0);
  const totalCards = rows.reduce((s, r) => s + Number(r.card_count ?? 0), 0);
  const total7d = rows.reduce((s, r) => s + Number(r.index_7d ?? r.index_value ?? 0), 0);
  const overall7d = change(total, total7d);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-black">Live market overview</h2>
        <p className="text-sm font-bold text-slate-400">
          Total market value across every tradeable card.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Market value index</p>
          <p className="text-xl font-black">{usd(total)}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">7d trend</p>
          <p className={`text-xl font-black ${pctClass(overall7d)}`}>{pct(overall7d)}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Indexed cards</p>
          <p className="text-xl font-black">{totalCards.toLocaleString()}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Games tracked</p>
          <p className="text-xl font-black">{rows.length}</p>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">TCG</th>
              <th className="px-3 py-3 text-right">Market index</th>
              <th className="px-3 py-3 text-right">7d</th>
              <th className="px-3 py-3 text-right hidden sm:table-cell">30d</th>
              <th className="px-3 py-3 text-right hidden sm:table-cell">90d</th>
              <th className="px-3 py-3 text-right">Cards</th>
              <th className="px-5 py-3 text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c7 = change(r.index_value, r.index_7d);
              const c30 = change(r.index_value, r.index_30d);
              const c90 = change(r.index_value, r.index_90d);
              return (
                <tr key={r.category_id} className="border-t border-slate-100 font-bold">
                  <td className="px-5 py-3">{r.display_name}</td>
                  <td className="px-3 py-3 text-right font-black">{usd(r.index_value)}</td>
                  <td className={`px-3 py-3 text-right ${pctClass(c7)}`}>{pct(c7)}</td>
                  <td className={`px-3 py-3 text-right hidden sm:table-cell ${pctClass(c30)}`}>{pct(c30)}</td>
                  <td className={`px-3 py-3 text-right hidden sm:table-cell ${pctClass(c90)}`}>{pct(c90)}</td>
                  <td className="px-3 py-3 text-right text-slate-500">
                    {Number(r.card_count ?? 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <Sparkline data={series[i]} up={(c7 ?? 0) >= 0} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
