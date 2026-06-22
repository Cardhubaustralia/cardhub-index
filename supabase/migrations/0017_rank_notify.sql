-- ============================================================
-- CardHub Index — rank-change notifications
-- ============================================================
alter table public.portfolios add column if not exists last_rank int;

-- Recompute ranks per game; notify on top-3 / top-10 crossings.
-- Called once per tick after any cycle executes.
create or replace function public.notify_ranks()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    with cur as (
      select p.id, p.user_id, p.league_id, p.last_rank,
        rank() over (partition by p.league_id
                     order by p.cash + coalesce(sum(h.qty * a.price), 0) desc) as rnk,
        count(*) over (partition by p.league_id) as members
      from portfolios p
      left join holdings h on h.portfolio_id = p.id
      left join assets a on a.id = h.asset_id
      group by p.id, p.user_id, p.league_id, p.last_rank, p.cash
    )
    select c.*, l.name as lname, l.is_global, pr.notify_general
    from cur c
    join leagues l on l.id = c.league_id
    join profiles pr on pr.user_id = c.user_id
    where (l.is_global or (now() >= l.starts_at and (l.ends_at is null or now() < l.ends_at)))
  loop
    if r.notify_general and r.last_rank is not null and r.rnk <> r.last_rank then
      if r.rnk <= 3 and r.last_rank > 3 then
        insert into notifications (user_id, kind, title, body, link) values
          (r.user_id, 'update', 'Now #' || r.rnk || ' in ' || r.lname,
           'Top 3! Rank ' || r.rnk || ' of ' || r.members || ' players.',
           '/leagues/' || r.league_id);
      elsif r.rnk <= 10 and r.last_rank > 10 then
        insert into notifications (user_id, kind, title, body, link) values
          (r.user_id, 'update', 'Top 10 in ' || r.lname,
           'You climbed to #' || r.rnk || ' of ' || r.members || '.',
           '/leagues/' || r.league_id);
      elsif r.rnk > 10 and r.last_rank <= 10 then
        insert into notifications (user_id, kind, title, body, link) values
          (r.user_id, 'update', 'Dropped to #' || r.rnk || ' in ' || r.lname,
           'You slipped out of the top 10.',
           '/leagues/' || r.league_id);
      end if;
    end if;
    update portfolios set last_rank = r.rnk where id = r.id;
  end loop;
end $$;
revoke execute on function public.notify_ranks() from anon, authenticated;
