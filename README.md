# CardHub Index

Fantasy TCG market for Pokémon and One Piece. Everyone starts with $10,000 of virtual cash and trades real cards at real market prices. Prices update three times a day (6am / 2pm / 10pm Sydney); orders queue during the open window, lock 30 minutes before each update, then execute at the fresh price.

## Stack

Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS) · Tailwind v4 · Recharts · TCGAPIs price data (TCGPlayer + Cardmarket blend).

## Setup

### 1. Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — already set
- `SUPABASE_SECRET_KEY` — Supabase Dashboard → Settings → API → **secret key** (`sb_secret_...`). Server-only; powers the sync jobs and cycle execution.
- `TCGAPIS_API_KEY` — already set (server-only, never shipped to the browser)
- `CRON_SECRET` — any long random string

### 2. Database

Run the four migrations **in order** in the Supabase SQL Editor (Dashboard → SQL Editor → paste & run):

1. `supabase/migrations/0001_init.sql` — catalog, partitioned price history, cycles, leagues, profiles, portfolios
2. `supabase/migrations/0002_trading.sql` — place/cancel order, atomic `execute_cycle`, league functions
3. `supabase/migrations/0003_rls_views.sql` — RLS policies, leaderboard/movers/market views
4. `supabase/migrations/0004_sync_fns.sql` — bulk price upsert + sync helpers
5. `supabase/migrations/0005_market_index.sql` — market index history + dashboard stats
6. `supabase/migrations/0006_realized_pnl.sql` — realized P&L on sells (account history)

(Or use the Supabase CLI: `supabase db push`.)

### 3. First data load

```bash
npm install
npm run sync:catalog   # all Pokémon + One Piece sets & cards (~15-30 min first run)
npm run cycle:tick     # creates upcoming trade cycles
npm run sync:prices    # full price snapshot from the whole-game CSVs
```

### 4. Run

```bash
npm run dev
```

### 5. Scheduling (reliable, all in Supabase)

**Execution** runs in-database via **pg_cron** calling `run_tick()` every minute
(migration `0019`) — state transitions + trade execution, pure SQL, no external
dependency. Execution is decoupled from the price sync (migration `0018`), so
trades always fill on time at the most recent prices even if a sync is late.

**Price sync** runs as a chunked **Supabase Edge Function** (`sync-prices`),
pinged every minute by pg_cron via pg_net (migration `0020`). Each invocation
prices ~2,500 cards and advances a cursor until the cycle is fully synced.

Deploy the Edge Function (needs the Supabase CLI — `npx supabase`):

```bash
npx supabase login
npx supabase link --project-ref lqwmsrwoyoalcuzxkzsu
npx supabase secrets set TCGAPIS_API_KEY=<key> CRON_SECRET=<random-string>
npx supabase functions deploy sync-prices --no-verify-jwt
```

Then run migrations `0018`–`0020`, and set the shared secret so pg_cron can call
the function (must equal the `CRON_SECRET` above):

```sql
update public.app_config set value = '<same-random-string>' where key = 'cron_secret';
```

`edge_url` is pre-filled for this project. **Everything scheduled runs in
Supabase — there is no GitHub Actions / Vercel cron.**

What runs where:

- **Execution** (`run_tick`) — pg_cron, every minute, pure SQL.
- **Price sync** (`sync-prices` Edge Function) — pg_cron pings it every minute;
  it chunk-syncs prices at each lockout.
- **Daily notifications** (`notify_daily`) — pg_cron daily.
- **Retention** (`archive_old_snapshots`) — pg_cron weekly.
- **Catalog sync (new sets/cards)** — **manual**: run `npm run sync:catalog`
  when a new set releases (they're infrequent). Can be promoted to an Edge
  Function later if you want it automatic.

### Health check

```bash
npx tsx scripts/status.ts
```

Shows cycle state, priced-asset counts, order tallies, player counts, and value-history coverage — the fastest way to confirm the cron is advancing cycles.

## How a trade cycle works

```
open (7.5h) ──→ locked (30min) ──→ executing ──→ executed
  place/cancel     price sync        all pending      window
  orders           runs (CSV +       orders fill      reopens
                   CM blend)         atomically
```

- `execute_cycle()` runs as **one Postgres transaction** — any failure rolls the whole batch back and the cycle is marked `failed`, safe to retry. Orders fill in placement order.
- Hard checks at execution: cash, holdings, and the 25% max-position rule (configurable per league).
- `price_snapshots` is **partitioned by month** so the high-volume timestamp data stays fast; partitions are created automatically by the sync.

## Price blend

- TCGPlayer market price (USD) for the full catalog, via one whole-game CSV per cycle.
- Cardmarket (EUR → USD at the ECB daily rate) is blended 50/50 for the ~500 most actively traded cards (per-product API calls don't scale to the full catalog). Falls back to single-source automatically.
- Each printing (Normal / Holofoil / 1st Edition…) trades as its own asset.

## Notes & known gaps

- `cards.cardmarket_id` is not populated yet — the Cardmarket blend stays dormant until a bridging sync is added (Cardmarket singles expose the matching TCGPlayer productId).
- The prices CSV column names are resolved tolerantly (`productId`/`subTypeName`/`marketPrice` and common variants). If the first `npm run sync:prices` reports 0 assets, check the CSV header and adjust `COL` in `src/lib/tcgapis.ts`.
- Seasons exist in the schema (pre-season sandbox seeded); season rollover/reset is a future job.
- The TCGAPIs key in this repo's `.env.local` must stay server-side. Rotate it if it ever leaks.
