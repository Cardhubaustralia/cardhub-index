-- ============================================================
-- CardHub Index — how many trades are locked in for this lockout.
-- Counts EVERYONE's pending orders in a game for the active cycle,
-- so we can highlight the activity next to the countdown.
-- ============================================================

create or replace function public.pending_cycle_orders(p_league_id uuid default null)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  c trade_cycles;
  v_league uuid;
  n integer;
begin
  -- the cycle orders are attaching to (open) or about to execute (locked)
  select * into c from trade_cycles
   where status in ('open','scheduled','locked','executing')
     and executes_at > now() - interval '30 minutes'
   order by executes_at limit 1;
  if c.id is null then return 0; end if;

  -- default to the global game (everyone's shared market)
  v_league := coalesce(p_league_id, (select id from leagues where is_global limit 1));

  select count(*) into n from orders o
   where o.cycle_id = c.id and o.status = 'pending'
     and (v_league is null or o.league_id = v_league);
  return coalesce(n, 0);
end $$;
grant execute on function public.pending_cycle_orders(uuid) to anon, authenticated;
