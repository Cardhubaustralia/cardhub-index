-- ============================================================
-- CardHub Index — reliable in-database scheduler (pg_cron)
-- Execution + state machine run every minute INSIDE Postgres,
-- so trades fill on time with no external dependency.
-- The heavy price sync stays external (it just refreshes prices).
-- ============================================================

create extension if not exists pg_cron;

-- The light tick: ensure cycles, open windows, and execute everything
-- that's due — at the most recent prices. No network, pure SQL.
create or replace function public.run_tick()
returns void language plpgsql security definer set search_path = public as $$
declare c record; v_executed boolean := false;
begin
  perform public.ensure_cycles(3);

  update trade_cycles set status = 'open'
   where status = 'scheduled' and opens_at <= now();

  for c in
    select id from trade_cycles
     where status in ('open','locked','executing') and executes_at <= now()
     order by executes_at
  loop
    update trade_cycles set status = 'executing'
     where id = c.id and status in ('open','locked','executing');
    begin
      perform public.execute_cycle(c.id);
      v_executed := true;
    exception when others then
      raise notice 'run_tick: cycle % failed: %', c.id, sqlerrm;
    end;
  end loop;

  if v_executed then perform public.notify_ranks(); end if;
end $$;
revoke execute on function public.run_tick() from anon, authenticated;

-- (re)schedule the jobs
do $$ begin perform cron.unschedule('cardhub-tick'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('cardhub-notify-daily'); exception when others then null; end $$;

select cron.schedule('cardhub-tick', '* * * * *', $$ select public.run_tick(); $$);
select cron.schedule('cardhub-notify-daily', '0 19 * * *', $$ select public.notify_daily(); $$);
