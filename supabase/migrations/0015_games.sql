-- ============================================================
-- CardHub Index — Games: durations, start/end, join policy, and a
-- configurable card universe (all / by game / sets / rarity / name).
-- ============================================================

alter table public.leagues add column if not exists starts_at   timestamptz not null default now();
alter table public.leagues add column if not exists ends_at     timestamptz;
alter table public.leagues add column if not exists join_policy text not null default 'open'
  check (join_policy in ('open','invite'));
alter table public.leagues add column if not exists universe    jsonb not null default '{}'::jsonb;

-- the global game: rolling 80-day seasons, all cards, always joinable
update public.leagues
   set ends_at = coalesce(ends_at, now() + interval '80 days'),
       join_policy = 'open', universe = '{}'::jsonb
 where is_global;

-- ------------------------------------------------------------
-- Universe rules engine. Empty {} = every card. Otherwise a card
-- must satisfy ALL provided constraints (AND). Keys (all optional):
--   games:    ["pokemon","one-piece"]
--   set_ids:  [23551, ...]   (group_ids)
--   rarities: ["Rare Holo", ...]
--   name_like: "pikachu"
--   sealed:   "any" | "only" | "exclude"
-- ------------------------------------------------------------
create or replace function public.asset_in_universe(p_universe jsonb, p_asset_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_universe is null or p_universe = '{}'::jsonb then true
    else exists (
      select 1
        from assets a
        join cards c on c.product_id = a.product_id
        join games g on g.category_id = c.category_id
       where a.id = p_asset_id
         and (not (p_universe ? 'games')
              or jsonb_array_length(p_universe->'games') = 0
              or g.slug in (select jsonb_array_elements_text(p_universe->'games')))
         and (not (p_universe ? 'set_ids')
              or jsonb_array_length(p_universe->'set_ids') = 0
              or c.group_id in (select (jsonb_array_elements_text(p_universe->'set_ids'))::int))
         and (not (p_universe ? 'rarities')
              or jsonb_array_length(p_universe->'rarities') = 0
              or c.rarity in (select jsonb_array_elements_text(p_universe->'rarities')))
         and (not (p_universe ? 'name_like')
              or coalesce(p_universe->>'name_like','') = ''
              or c.name ilike '%' || (p_universe->>'name_like') || '%')
         and (coalesce(p_universe->>'sealed','any') = 'any'
              or (p_universe->>'sealed' = 'only' and c.is_sealed)
              or (p_universe->>'sealed' = 'exclude' and not c.is_sealed))
    )
  end;
$$;

-- which of MY active games allow trading this asset (for the trade panel)
create or replace function public.eligible_leagues_for_asset(p_asset_id bigint)
returns table (league_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id
    from leagues l
    join league_members m on m.league_id = l.id and m.user_id = auth.uid()
   where (l.is_global or (now() >= l.starts_at and (l.ends_at is null or now() < l.ends_at)))
     and public.asset_in_universe(l.universe, p_asset_id);
$$;
grant execute on function public.eligible_leagues_for_asset(bigint) to anon, authenticated;

-- ------------------------------------------------------------
-- place_order: enforce game window + universe
-- ------------------------------------------------------------
create or replace function public.place_order(
  p_league_id uuid, p_asset_id bigint, p_side text, p_qty int
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_cycle trade_cycles;
  v_portfolio portfolios;
  v_asset assets;
  v_league leagues;
  v_order orders;
  v_pending_buy_cost numeric;
  v_pending_sell_qty int;
  v_held int;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if p_side not in ('buy','sell') then raise exception 'Invalid side'; end if;
  if p_qty < 1 or p_qty > 10000 then raise exception 'Quantity must be 1-10000'; end if;

  select * into v_league from leagues where id = p_league_id;
  if v_league.id is null then raise exception 'Game not found'; end if;
  if not v_league.is_global then
    if now() < v_league.starts_at then raise exception 'This game has not started yet'; end if;
    if v_league.ends_at is not null and now() >= v_league.ends_at then
      raise exception 'This game has ended'; end if;
  end if;

  select * into v_cycle from current_open_cycle();
  if v_cycle.id is null then
    raise exception 'Trading is locked right now — wait for the next window';
  end if;

  select * into v_portfolio from portfolios where user_id = v_user and league_id = p_league_id;
  if v_portfolio.id is null then raise exception 'You are not in this game'; end if;

  select * into v_asset from assets where id = p_asset_id and tradeable;
  if v_asset.id is null or v_asset.price is null then
    raise exception 'This card is not tradeable yet';
  end if;

  if not public.asset_in_universe(v_league.universe, p_asset_id) then
    raise exception 'This card is not in this game''s pool';
  end if;

  if p_side = 'buy' then
    select coalesce(sum(o.qty * a.price), 0) into v_pending_buy_cost
      from orders o join assets a on a.id = o.asset_id
     where o.portfolio_id = v_portfolio.id and o.cycle_id = v_cycle.id
       and o.status = 'pending' and o.side = 'buy';
    if v_pending_buy_cost + (p_qty * v_asset.price) > v_portfolio.cash then
      raise exception 'Estimated cost exceeds your available cash';
    end if;
  else
    select coalesce(qty, 0) into v_held from holdings
     where portfolio_id = v_portfolio.id and asset_id = p_asset_id;
    select coalesce(sum(qty), 0) into v_pending_sell_qty from orders
     where portfolio_id = v_portfolio.id and cycle_id = v_cycle.id
       and asset_id = p_asset_id and status = 'pending' and side = 'sell';
    if coalesce(v_held,0) - v_pending_sell_qty < p_qty then
      raise exception 'You do not hold enough copies to sell';
    end if;
  end if;

  insert into orders (portfolio_id, user_id, league_id, asset_id, cycle_id, side, qty, est_price)
  values (v_portfolio.id, v_user, p_league_id, p_asset_id, v_cycle.id, p_side, p_qty, v_asset.price)
  returning * into v_order;
  return v_order;
end $$;

-- ------------------------------------------------------------
-- create_game: full config incl. universe + duration
-- ------------------------------------------------------------
create or replace function public.create_game(
  p_name text,
  p_join_policy text default 'open',
  p_starting_cash numeric default 10000,
  p_max_position_pct numeric default 25,
  p_duration_days int default 80,
  p_universe jsonb default '{}'::jsonb,
  p_starts_at timestamptz default now()
) returns public.leagues
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league leagues;
  v_code text;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if length(trim(p_name)) < 3 then raise exception 'Game name too short'; end if;
  if p_join_policy not in ('open','invite') then raise exception 'Invalid join policy'; end if;
  if p_starting_cash < 100 or p_starting_cash > 100000000 then raise exception 'Starting cash out of range'; end if;
  if p_max_position_pct < 1 or p_max_position_pct > 100 then raise exception 'Position limit must be 1-100%%'; end if;
  if p_duration_days < 1 or p_duration_days > 730 then raise exception 'Duration must be 1-730 days'; end if;

  v_code := upper(substr(md5(random()::text), 1, 6));
  insert into leagues (name, is_public, invite_code, owner_id, season_id, starting_cash,
                       max_position_pct, starts_at, ends_at, join_policy, universe)
  values (trim(p_name), p_join_policy = 'open', v_code, v_user,
          (select id from seasons order by id desc limit 1),
          p_starting_cash, p_max_position_pct,
          p_starts_at, p_starts_at + (p_duration_days || ' days')::interval,
          p_join_policy, coalesce(p_universe, '{}'::jsonb))
  returning * into v_league;

  insert into league_members (league_id, user_id) values (v_league.id, v_user);
  insert into portfolios (user_id, league_id, cash) values (v_user, v_league.id, v_league.starting_cash);
  return v_league;
end $$;

-- ------------------------------------------------------------
-- Games listing view (RLS-respecting) with member counts + status
-- ------------------------------------------------------------
drop view if exists public.v_games cascade;
create view public.v_games with (security_invoker = on) as
select l.id, l.name, l.is_public, l.is_global, l.invite_code, l.owner_id,
       l.starting_cash, l.max_position_pct, l.starts_at, l.ends_at,
       l.join_policy, l.universe, l.created_at,
       (select count(*) from league_members m where m.league_id = l.id) as member_count,
       case when l.is_global then 'active'
            when now() < l.starts_at then 'upcoming'
            when l.ends_at is not null and now() >= l.ends_at then 'ended'
            else 'active' end as game_status
from leagues l;
grant select on public.v_games to anon, authenticated;
