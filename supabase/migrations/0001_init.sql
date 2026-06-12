-- ============================================================
-- CardHub Index — initial schema
-- Fantasy TCG market: 8-hour trade cycles, queued orders,
-- blended prices, leagues, seasons, leaderboards.
-- ============================================================

-- ------------------------------------------------------------
-- CATALOG
-- ------------------------------------------------------------
create table public.games (
  category_id   int primary key,           -- TCGAPIs/TCGPlayer categoryId
  slug          text not null unique,      -- 'pokemon', 'one-piece'
  name          text not null,
  display_name  text not null,
  active        boolean not null default true
);

create table public.sets (
  group_id      int primary key,           -- TCGAPIs groupId
  category_id   int not null references public.games(category_id),
  name          text not null,
  abbreviation  text,
  published_on  date,
  slug          text not null,
  unique (category_id, slug)
);
create index sets_category_idx on public.sets(category_id);

create table public.cards (
  product_id    bigint primary key,        -- TCGPlayer productId
  group_id      int not null references public.sets(group_id),
  category_id   int not null references public.games(category_id),
  name          text not null,
  clean_name    text,
  number        text,
  rarity        text,
  image_url     text,
  slug          text not null,
  cardmarket_id bigint,                    -- bridge to Cardmarket idProduct when known
  unique (category_id, slug)
);
create index cards_group_idx on public.cards(group_id);
create index cards_name_trgm on public.cards using gin (to_tsvector('simple', name));

-- One tradeable instrument per (card, variant). Variant examples:
-- 'Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition Holofoil'.
create table public.assets (
  id               bigint generated always as identity primary key,
  product_id       bigint not null references public.cards(product_id),
  variant          text not null default 'Normal',
  tradeable        boolean not null default true,
  -- denormalized latest pricing for fast market pages
  price            numeric(14,2),
  prev_price       numeric(14,2),          -- price at previous cycle
  change_pct       numeric(10,4),          -- vs previous cycle
  change_7d_pct    numeric(10,4),
  change_30d_pct   numeric(10,4),
  tcgplayer_price  numeric(14,2),
  cardmarket_eur   numeric(14,2),
  price_source     text,                   -- 'blend' | 'tcgplayer' | 'cardmarket'
  price_updated_at timestamptz,
  unique (product_id, variant)
);
create index assets_product_idx on public.assets(product_id);
create index assets_price_idx on public.assets(price desc nulls last) where tradeable;
create index assets_change_idx on public.assets(change_pct desc nulls last) where tradeable;

-- ------------------------------------------------------------
-- PRICE HISTORY (partitioned by month — "sharding" for the
-- high-volume timestamped rows; old partitions can be detached)
-- ------------------------------------------------------------
create table public.price_snapshots (
  asset_id     bigint not null,
  cycle_id     bigint not null,
  price        numeric(14,2) not null,
  tcgplayer    numeric(14,2),
  cardmarket   numeric(14,2),              -- already converted to USD
  captured_at  timestamptz not null default now(),
  primary key (asset_id, captured_at)
) partition by range (captured_at);

create index price_snapshots_cycle_idx on public.price_snapshots(cycle_id);

-- Create a monthly partition on demand (called by the sync job).
create or replace function public.ensure_snapshot_partition(p_ts timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_ts)::date;
  v_end   date := (date_trunc('month', p_ts) + interval '1 month')::date;
  v_name  text := 'price_snapshots_' || to_char(v_start, 'YYYY_MM');
begin
  if not exists (select 1 from pg_class where relname = v_name) then
    execute format(
      'create table public.%I partition of public.price_snapshots for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
  end if;
end $$;

select public.ensure_snapshot_partition(now());
select public.ensure_snapshot_partition(now() + interval '1 month');

-- ------------------------------------------------------------
-- TRADE CYCLES (8h: executions 06:00 / 14:00 / 22:00 Sydney)
-- ------------------------------------------------------------
create table public.trade_cycles (
  id           bigint generated always as identity primary key,
  opens_at     timestamptz not null,
  locks_at     timestamptz not null,       -- orders freeze here; price sync runs
  executes_at  timestamptz not null,       -- orders fill at the freshly synced price
  status       text not null default 'scheduled'
               check (status in ('scheduled','open','locked','executing','executed','failed')),
  prices_synced_at timestamptz,
  executed_at  timestamptz,
  filled_count int not null default 0,
  rejected_count int not null default 0
);
create unique index trade_cycles_executes_idx on public.trade_cycles(executes_at);

-- Generate the next N cycles if missing. Anchors: 06/14/22 Australia/Sydney,
-- lockout = 30 min before execution.
create or replace function public.ensure_cycles(p_days int default 3)
returns void language plpgsql security definer set search_path = public as $$
declare
  d date;
  h int;
  v_exec timestamptz;
  v_prev timestamptz;
begin
  for d in select generate_series(
      (now() at time zone 'Australia/Sydney')::date - 1,
      (now() at time zone 'Australia/Sydney')::date + p_days, '1 day'
    )::date
  loop
    foreach h in array array[6, 14, 22] loop
      v_exec := (d::text || ' ' || lpad(h::text,2,'0') || ':00:00')::timestamp
                at time zone 'Australia/Sydney';
      v_prev := v_exec - interval '8 hours';
      if v_exec > now() and not exists (
        select 1 from trade_cycles where executes_at = v_exec
      ) then
        insert into trade_cycles (opens_at, locks_at, executes_at, status)
        values (v_prev, v_exec - interval '30 minutes', v_exec,
                case when now() >= v_prev then 'open' else 'scheduled' end);
      end if;
    end loop;
  end loop;
end $$;

-- The cycle currently accepting orders (open, not yet locked).
create or replace function public.current_open_cycle()
returns public.trade_cycles language sql stable security definer
set search_path = public as $$
  select * from trade_cycles
  where status in ('scheduled','open') and now() >= opens_at and now() < locks_at
  order by executes_at limit 1;
$$;

-- ------------------------------------------------------------
-- SEASONS, LEAGUES, MEMBERSHIP
-- ------------------------------------------------------------
create table public.seasons (
  id        int generated always as identity primary key,
  name      text not null,
  starts_at timestamptz not null,
  ends_at   timestamptz,
  status    text not null default 'sandbox' check (status in ('sandbox','active','ended'))
);
insert into public.seasons (name, starts_at, status)
values ('Pre-Season Sandbox', now(), 'sandbox');

create table public.leagues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  is_public     boolean not null default false,
  invite_code   text unique,
  owner_id      uuid,                      -- references auth.users
  season_id     int references public.seasons(id),
  starting_cash numeric(14,2) not null default 10000,
  max_position_pct numeric(5,2) not null default 25,
  is_global     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- the one global league everyone auto-joins
insert into public.leagues (id, name, is_public, is_global, season_id, invite_code)
values ('00000000-0000-0000-0000-000000000001', 'Global League', true, true, 1, null);

create table public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user_idx on public.league_members(user_id);

-- ------------------------------------------------------------
-- PROFILES, PORTFOLIOS, HOLDINGS, ORDERS
-- ------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key,           -- = auth.users.id
  username     text not null unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text,
  avatar_url   text,
  country      text,
  created_at   timestamptz not null default now()
);

create table public.portfolios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  league_id  uuid not null references public.leagues(id) on delete cascade,
  cash       numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, league_id)
);
create index portfolios_league_idx on public.portfolios(league_id);

create table public.holdings (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  asset_id     bigint not null references public.assets(id),
  qty          int not null check (qty >= 0),
  avg_cost     numeric(14,2) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (portfolio_id, asset_id)
);
create index holdings_asset_idx on public.holdings(asset_id);

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  user_id       uuid not null,
  league_id     uuid not null references public.leagues(id),
  asset_id      bigint not null references public.assets(id),
  cycle_id      bigint not null references public.trade_cycles(id),
  side          text not null check (side in ('buy','sell')),
  qty           int not null check (qty > 0),
  status        text not null default 'pending'
                check (status in ('pending','filled','cancelled','rejected')),
  est_price     numeric(14,2),             -- price shown when the order was placed
  executed_price numeric(14,2),
  executed_value numeric(14,2),
  reject_reason text,
  created_at    timestamptz not null default now(),
  executed_at   timestamptz
);
create index orders_cycle_idx on public.orders(cycle_id, status);
create index orders_portfolio_idx on public.orders(portfolio_id, created_at desc);
create index orders_asset_idx on public.orders(asset_id);

-- per-cycle portfolio value history (graphs + leaderboard deltas)
create table public.portfolio_history (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  cycle_id     bigint not null references public.trade_cycles(id),
  value        numeric(14,2) not null,
  cash         numeric(14,2) not null,
  captured_at  timestamptz not null default now(),
  primary key (portfolio_id, cycle_id)
);

-- ------------------------------------------------------------
-- NEW USER BOOTSTRAP: profile + global league + portfolio
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    'player_' || substr(replace(new.id::text, '-', ''), 1, 8)
  );
  insert into public.profiles (user_id, username, display_name)
  values (new.id, v_username, coalesce(new.raw_user_meta_data ->> 'display_name', v_username))
  on conflict (user_id) do nothing;

  insert into public.league_members (league_id, user_id)
  values ('00000000-0000-0000-0000-000000000001', new.id)
  on conflict do nothing;

  insert into public.portfolios (user_id, league_id, cash)
  values (new.id, '00000000-0000-0000-0000-000000000001', 10000)
  on conflict do nothing;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
