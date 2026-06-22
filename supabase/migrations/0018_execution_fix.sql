-- ============================================================
-- CardHub Index — make execution robust & independent of the sync
--  • 45-min lockout (sync comfortably finishes before execution)
--  • execute_cycle tolerates re-claimed 'executing' status
-- ============================================================

-- wider lockout window
create or replace function public.ensure_cycles(p_days int default 3)
returns void language plpgsql security definer set search_path = public as $$
declare
  d date; h int; v_exec timestamptz; v_prev timestamptz;
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
      if v_exec > now() and not exists (select 1 from trade_cycles where executes_at = v_exec) then
        insert into trade_cycles (opens_at, locks_at, executes_at, status)
        values (v_prev, v_exec - interval '45 minutes', v_exec,
                case when now() >= v_prev then 'open' else 'scheduled' end);
      end if;
    end loop;
  end loop;
end $$;
revoke execute on function public.ensure_cycles(int) from anon, authenticated;

-- allow execute_cycle to run on a cycle already claimed as 'executing'
-- (the tick claims it atomically before calling, to avoid double-runs)
create or replace function public.execute_cycle(p_cycle_id bigint)
returns table (filled int, rejected int)
language plpgsql security definer set search_path = public as $$
declare
  v_cycle trade_cycles; r record;
  v_price numeric; v_cost numeric; v_cash numeric; v_held int; v_avg numeric;
  v_pf_value numeric; v_cap numeric; v_pnl numeric;
  v_filled int := 0; v_rejected int := 0;
begin
  select * into v_cycle from trade_cycles where id = p_cycle_id for update;
  if v_cycle.id is null then raise exception 'Cycle % not found', p_cycle_id; end if;
  if v_cycle.status = 'executed' then
    return query select 0, 0; return;          -- already done, no-op
  end if;
  if v_cycle.status not in ('locked','open','scheduled','executing') then
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
    v_price := r.new_price; v_pnl := null;
    if v_price is null or v_price <= 0 then
      update orders set status='rejected', reject_reason='No price available this cycle' where id = r.id;
      v_rejected := v_rejected + 1; continue;
    end if;
    select cash into v_cash from portfolios where id = r.portfolio_id for update;

    if r.side = 'buy' then
      v_cost := v_price * r.qty;
      if v_cost > v_cash then
        update orders set status='rejected', reject_reason='Insufficient cash at execution price' where id = r.id;
        v_rejected := v_rejected + 1; continue;
      end if;
      select coalesce(sum(h.qty * a.price), 0) + v_cash into v_pf_value
        from holdings h join assets a on a.id = h.asset_id where h.portfolio_id = r.portfolio_id;
      select coalesce(qty, 0) into v_held from holdings where portfolio_id = r.portfolio_id and asset_id = r.asset_id;
      v_cap := v_pf_value * (r.max_position_pct / 100.0);
      if (coalesce(v_held,0) + r.qty) * v_price > v_cap then
        update orders set status='rejected',
          reject_reason=format('Would exceed %s%% position limit', r.max_position_pct) where id = r.id;
        v_rejected := v_rejected + 1; continue;
      end if;
      update portfolios set cash = cash - v_cost where id = r.portfolio_id;
      insert into holdings (portfolio_id, asset_id, qty, avg_cost, updated_at)
      values (r.portfolio_id, r.asset_id, r.qty, v_price, now())
      on conflict (portfolio_id, asset_id) do update
        set avg_cost = ((holdings.qty * holdings.avg_cost) + excluded.qty * excluded.avg_cost)
                       / (holdings.qty + excluded.qty),
            qty = holdings.qty + excluded.qty, updated_at = now();
    else
      select coalesce(qty, 0), avg_cost into v_held, v_avg from holdings
        where portfolio_id = r.portfolio_id and asset_id = r.asset_id;
      if coalesce(v_held, 0) < r.qty then
        update orders set status='rejected', reject_reason='Not enough copies held at execution' where id = r.id;
        v_rejected := v_rejected + 1; continue;
      end if;
      v_cost := v_price * r.qty;
      v_pnl := (v_price - coalesce(v_avg, 0)) * r.qty;
      update portfolios set cash = cash + v_cost where id = r.portfolio_id;
      update holdings set qty = qty - r.qty, updated_at = now()
        where portfolio_id = r.portfolio_id and asset_id = r.asset_id;
      delete from holdings where portfolio_id = r.portfolio_id and asset_id = r.asset_id and qty = 0;
    end if;

    update orders set status='filled', executed_price = v_price,
      executed_value = v_price * r.qty, realized_pnl = v_pnl, executed_at = now()
     where id = r.id;
    v_filled := v_filled + 1;
  end loop;

  insert into portfolio_history (portfolio_id, cycle_id, value, cash)
  select p.id, p_cycle_id, p.cash + coalesce(sum(h.qty * a.price), 0), p.cash
    from portfolios p
    left join holdings h on h.portfolio_id = p.id
    left join assets a on a.id = h.asset_id
   group by p.id, p.cash
  on conflict (portfolio_id, cycle_id) do nothing;

  update trade_cycles set status='executed', executed_at = now(),
    filled_count = v_filled, rejected_count = v_rejected where id = p_cycle_id;
  return query select v_filled, v_rejected;
end $$;
revoke execute on function public.execute_cycle(bigint) from anon, authenticated;
