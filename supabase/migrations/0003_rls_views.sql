-- ============================================================
-- CardHub Index — RLS policies, leaderboard + market stat views
-- ============================================================

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.games            enable row level security;
alter table public.sets             enable row level security;
alter table public.cards            enable row level security;
alter table public.assets           enable row level security;
alter table public.price_snapshots  enable row level security;
alter table public.trade_cycles     enable row level security;
alter table public.seasons          enable row level security;
alter table public.leagues          enable row level security;
alter table public.league_members   enable row level security;
alter table public.profiles         enable row level security;
alter table public.portfolios       enable row level security;
alter table public.holdings         enable row level security;
alter table public.orders           enable row level security;
alter table public.portfolio_history enable row level security;

-- market data: world-readable
create policy "read games"   on public.games   for select using (true);
create policy "read sets"    on public.sets    for select using (true);
create policy "read cards"   on public.cards   for select using (true);
create policy "read assets"  on public.assets  for select using (true);
create policy "read prices"  on public.price_snapshots for select using (true);
create policy "read cycles"  on public.trade_cycles for select using (true);
create policy "read seasons" on public.seasons for select using (true);

-- profiles: anyone can read, you can update your own
create policy "read profiles"  on public.profiles for select using (true);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- security-definer helpers avoid RLS policy recursion
-- (leagues policy <-> league_members policy would otherwise loop)
create or replace function public.is_league_member(p_league uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members
                 where league_id = p_league and user_id = p_user);
$$;

create or replace function public.is_public_league(p_league uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from leagues where id = p_league and is_public);
$$;

-- leagues: public ones visible to all; private ones to members only
create policy "read leagues" on public.leagues for select using (
  is_public
  or owner_id = auth.uid()
  or public.is_league_member(id, auth.uid())
);

-- league members: visible to fellow members (needed for league pages)
create policy "read league members" on public.league_members for select using (
  public.is_league_member(league_id, auth.uid())
  or public.is_public_league(league_id)
);

-- portfolios/holdings/orders: owner-only reads. All writes go through
-- security-definer functions (place_order etc.) or the service key.
create policy "read own portfolios" on public.portfolios
  for select using (auth.uid() = user_id);
create policy "read own holdings" on public.holdings
  for select using (exists (
    select 1 from public.portfolios p
    where p.id = holdings.portfolio_id and p.user_id = auth.uid()));
create policy "read own orders" on public.orders
  for select using (auth.uid() = user_id);
create policy "read own history" on public.portfolio_history
  for select using (exists (
    select 1 from public.portfolios p
    where p.id = portfolio_history.portfolio_id and p.user_id = auth.uid()));

-- ------------------------------------------------------------
-- VIEWS (owner privileges intentionally expose aggregate data
-- like leaderboards without opening raw portfolio tables)
-- ------------------------------------------------------------

-- live leaderboard: rank within each league by portfolio value at current prices
create or replace view public.v_leaderboard as
select
  p.league_id,
  p.user_id,
  pr.username,
  pr.display_name,
  pr.avatar_url,
  p.cash + coalesce(sum(h.qty * a.price), 0) as value,
  p.cash,
  coalesce(sum(h.qty * a.price), 0) as holdings_value,
  l.starting_cash,
  (p.cash + coalesce(sum(h.qty * a.price), 0)) - l.starting_cash as profit,
  rank() over (
    partition by p.league_id
    order by p.cash + coalesce(sum(h.qty * a.price), 0) desc
  ) as rank
from public.portfolios p
join public.profiles pr on pr.user_id = p.user_id
join public.leagues l on l.id = p.league_id
left join public.holdings h on h.portfolio_id = p.id
left join public.assets a on a.id = h.asset_id
group by p.league_id, p.user_id, pr.username, pr.display_name, pr.avatar_url,
         p.cash, l.starting_cash;

-- biggest movers (last cycle), priced cards only
create or replace view public.v_movers as
select a.id as asset_id, a.variant, a.price, a.prev_price, a.change_pct,
       a.change_7d_pct, a.change_30d_pct,
       c.product_id, c.name, c.number, c.rarity, c.image_url, c.slug,
       s.name as set_name, g.slug as game_slug, g.display_name as game_name
from public.assets a
join public.cards c on c.product_id = a.product_id
join public.sets s on s.group_id = c.group_id
join public.games g on g.category_id = c.category_id
where a.tradeable and a.price is not null and a.change_pct is not null
  and a.price >= 1;  -- ignore penny-card noise in movers

-- most traded by filled orders over recent cycles
create or replace view public.v_most_traded as
select o.asset_id,
       c.name, c.image_url, c.slug, c.number,
       a.variant, a.price, a.change_pct,
       s.name as set_name, g.slug as game_slug,
       count(*) filter (where o.side = 'buy')  as buys,
       count(*) filter (where o.side = 'sell') as sells,
       sum(o.qty) as total_qty,
       sum(o.executed_value) as total_value
from public.orders o
join public.assets a on a.id = o.asset_id
join public.cards c on c.product_id = a.product_id
join public.sets s on s.group_id = c.group_id
join public.games g on g.category_id = c.category_id
where o.status = 'filled'
  and o.executed_at > now() - interval '7 days'
group by o.asset_id, c.name, c.image_url, c.slug, c.number,
         a.variant, a.price, a.change_pct, s.name, g.slug;

-- market browse: one row per asset with card info
create or replace view public.v_market as
select a.id as asset_id, a.variant, a.price, a.prev_price, a.change_pct,
       a.change_7d_pct, a.change_30d_pct, a.price_source, a.price_updated_at,
       c.product_id, c.name, c.clean_name, c.number, c.rarity, c.image_url, c.slug,
       s.group_id, s.name as set_name, s.slug as set_slug,
       g.category_id, g.slug as game_slug, g.display_name as game_name
from public.assets a
join public.cards c on c.product_id = a.product_id
join public.sets s on s.group_id = c.group_id
join public.games g on g.category_id = c.category_id
where a.tradeable;

grant select on public.v_leaderboard, public.v_movers, public.v_most_traded, public.v_market
  to anon, authenticated;
