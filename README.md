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

### 5. Production cron

Deployed on Vercel, `vercel.json` schedules:

- `/api/cron/tick` every minute — opens/locks/executes cycles, runs the price sync at each lockout
- `/api/cron/sync-catalog` daily — picks up new sets

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set in project env vars. Any other scheduler (GitHub Actions, a VPS crontab running `npm run cycle:tick`) works the same way.

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
