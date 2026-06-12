-- ============================================================
-- CardHub Index — trading engine
-- place_order / cancel_order (player-facing, security definer)
-- execute_cycle (service-only, single transaction = full rollback safety)
-- ============================================================

-- ------------------------------------------------------------
-- PLACE ORDER — only while a cycle is open. Funds/caps are
-- advisory-checked here at the current price and hard-checked
-- again at execution against the NEW price.
-- ------------------------------------------------------------
create or replace function public.place_order(
  p_league_id uuid,
  p_asset_id  bigint,
  p_side      text,
  p_qty       int
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_cycle trade_cycles;
  v_portfolio portfolios;
  v_asset assets;
  v_order orders;
  v_pending_buy_cost numeric;
  v_pending_sell_qty int;
  v_held int;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if p_side not in ('buy','sell') then raise exception 'Invalid side'; end if;
  if p_qty < 1 or p_qty > 10000 then raise exception 'Quantity must be 1-10000'; end if;

  select * into v_cycle from current_open_cycle();
  if v_cycle.id is null then
    raise exception 'Trading is locked right now — wait for the next window';
  end if;

  select * into v_portfolio from portfolios
   where user_id = v_user and league_id = p_league_id;
  if v_portfolio.id is null then raise exception 'You are not in this league'; end if;

  select * into v_asset from assets where id = p_asset_id and tradeable;
  if v_asset.id is null or v_asset.price is null then
    raise exception 'This card is not tradeable yet';
  end if;

  if p_side = 'buy' then
    -- advisory: current cash minus cost of other pending buys this cycle
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
    select coalesce(sum(qty), 0) into v_pending_sell_qty
      from orders
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
-- CANCEL ORDER — only your own, only while its cycle is still open
-- ------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_order orders;
  v_cycle trade_cycles;
begin
  select * into v_order from orders where id = p_order_id and user_id = v_user;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then raise exception 'Order can no longer be cancelled'; end if;
  select * into v_cycle from trade_cycles where id = v_order.cycle_id;
  if now() >= v_cycle.locks_at then
    raise exception 'Orders are locked for this cycle';
  end if;
  update orders set status = 'cancelled' where id = p_order_id;
end $$;

-- ------------------------------------------------------------
-- EXECUTE CYCLE — called by the cron worker with the service key
-- AFTER prices have been synced. Runs as ONE transaction: any
-- unexpected error rolls the whole batch back (cycle marked
-- 'failed' by the worker, orders untouched, safe to retry).
--
-- Order of play, deterministic: orders fill in created_at order.
-- Hard checks at the NEW price:
--   buys : cash >= cost AND resulting position <= max_position_pct
--   sells: enough qty held
-- ------------------------------------------------------------
create or replace function public.execute_cycle(p_cycle_id bigint)
returns table (filled int, rejected int)
language plpgsql security definer set search_path = public as $$
declare
  v_cycle trade_cycles;
  r record;
  v_price numeric;
  v_cost numeric;
  v_cash numeric;
  v_held int;
  v_avg numeric;
  v_pf_value numeric;
  v_cap numeric;
  v_filled int := 0;
  v_rejected int := 0;
begin
  select * into v_cycle from trade_cycles where id = p_cycle_id for update;
  if v_cycle.id is null then raise exception 'Cycle % not found', p_cycle_id; end if;
  if v_cycle.status not in ('locked','open','scheduled') then
    raise exception 'Cycle % is %, cannot execute', p_cycle_id, v_cycle.status;
  end if;

  update trade_cycles set status = 'executing' where id = p_cycle_id;

  for r in
    select o.*, a.price as new_price, l.max_position_pct
      from orders o
      join assets a on a.id = o.asset_id
      join leagues l on l.id = o.league_id
     where o.cycle_id = p_cycle_id and o.status = 'pending'
     order by o.created_at
  loop
    v_price := r.new_price;

    if v_price is null or v_price <= 0 then
      update orders set status='rejected', reject_reason='No price available this cycle'
       where id = r.id;
      v_rejected := v_rejected + 1;
      continue;
    end if;

    -- lock the portfolio row for this order
    select cash into v_cash from portfolios where id = r.portfolio_id for update;

    if r.side = 'buy' then
      v_cost := v_price * r.qty;
      if v_cost > v_cash then
        update orders set status='rejected', reject_reason='Insufficient cash at execution price'
         where id = r.id;
        v_rejected := v_rejected + 1;
        continue;
      end if;

      -- position cap: resulting position value <= cap% of portfolio value (at new prices)
      select coalesce(sum(h.qty * a.price), 0) + v_cash into v_pf_value
        from holdings h join assets a on a.id = h.asset_id
       where h.portfolio_id = r.portfolio_id;
      select coalesce(qty, 0) into v_held from holdings
       where portfolio_id = r.portfolio_id and asset_id = r.asset_id;
      v_cap := v_pf_value * (r.max_position_pct / 100.0);
      if (coalesce(v_held,0) + r.qty) * v_price > v_cap then
        update orders set status='rejected',
               reject_reason=format('Would exceed %s%% position limit', r.max_position_pct)
         where id = r.id;
        v_rejected := v_rejected + 1;
        continue;
      end if;

      -- fill
      update portfolios set cash = cash - v_cost where id = r.portfolio_id;
      insert into holdings (portfolio_id, asset_id, qty, avg_cost, updated_at)
      values (r.portfolio_id, r.asset_id, r.qty, v_price, now())
      on conflict (portfolio_id, asset_id) do update
        set avg_cost = ((holdings.qty * holdings.avg_cost) + excluded.qty * excluded.avg_cost)
                       / (holdings.qty + excluded.qty),
            qty = holdings.qty + excluded.qty,
            updated_at = now();
    else
      select coalesce(qty, 0), avg_cost into v_held, v_avg from holdings
       where portfolio_id = r.portfolio_id and asset_id = r.asset_id;
      if coalesce(v_held, 0) < r.qty then
        update orders set status='rejected', reject_reason='Not enough copies held at execution'
         where id = r.id;
        v_rejected := v_rejected + 1;
        continue;
      end if;
      v_cost := v_price * r.qty;
      update portfolios set cash = cash + v_cost where id = r.portfolio_id;
      update holdings set qty = qty - r.qty, updated_at = now()
       where portfolio_id = r.portfolio_id and asset_id = r.asset_id;
      delete from holdings
       where portfolio_id = r.portfolio_id and asset_id = r.asset_id and qty = 0;
    end if;

    update orders
       set status='filled', executed_price = v_price,
           executed_value = v_price * r.qty, executed_at = now()
     where id = r.id;
    v_filled := v_filled + 1;
  end loop;

  -- snapshot every portfolio's value at the new prices
  insert into portfolio_history (portfolio_id, cycle_id, value, cash)
  select p.id, p_cycle_id,
         p.cash + coalesce(sum(h.qty * a.price), 0),
         p.cash
    from portfolios p
    left join holdings h on h.portfolio_id = p.id
    left join assets a on a.id = h.asset_id
   group by p.id, p.cash
  on conflict (portfolio_id, cycle_id) do nothing;

  update trade_cycles
     set status='executed', executed_at = now(),
         filled_count = v_filled, rejected_count = v_rejected
   where id = p_cycle_id;

  return query select v_filled, v_rejected;
end $$;

-- ------------------------------------------------------------
-- LEAGUES: create + join
-- ------------------------------------------------------------
create or replace function public.create_league(
  p_name text,
  p_is_public boolean default false,
  p_starting_cash numeric default 10000,
  p_max_position_pct numeric default 25
) returns public.leagues
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league leagues;
  v_code text;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if length(trim(p_name)) < 3 then raise exception 'League name too short'; end if;
  if p_starting_cash < 100 or p_starting_cash > 100000000 then
    raise exception 'Starting cash out of range';
  end if;
  if p_max_position_pct < 1 or p_max_position_pct > 100 then
    raise exception 'Position limit must be 1-100%%';
  end if;

  v_code := upper(substr(md5(random()::text), 1, 6));
  insert into leagues (name, is_public, invite_code, owner_id, season_id, starting_cash, max_position_pct)
  values (trim(p_name), p_is_public, v_code, v_user,
          (select id from seasons order by id desc limit 1),
          p_starting_cash, p_max_position_pct)
  returning * into v_league;

  insert into league_members (league_id, user_id) values (v_league.id, v_user);
  insert into portfolios (user_id, league_id, cash)
  values (v_user, v_league.id, v_league.starting_cash);
  return v_league;
end $$;

create or replace function public.join_league(p_invite_code text)
returns public.leagues
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league leagues;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  select * into v_league from leagues
   where invite_code = upper(trim(p_invite_code)) or (is_public and id::text = p_invite_code);
  if v_league.id is null then raise exception 'Invalid invite code'; end if;

  insert into league_members (league_id, user_id)
  values (v_league.id, v_user) on conflict do nothing;
  insert into portfolios (user_id, league_id, cash)
  values (v_user, v_league.id, v_league.starting_cash)
  on conflict do nothing;
  return v_league;
end $$;

create or replace function public.join_public_league(p_league_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league leagues;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  select * into v_league from leagues where id = p_league_id and is_public;
  if v_league.id is null then raise exception 'League not found'; end if;
  insert into league_members (league_id, user_id)
  values (v_league.id, v_user) on conflict do nothing;
  insert into portfolios (user_id, league_id, cash)
  values (v_user, v_league.id, v_league.starting_cash) on conflict do nothing;
end $$;
