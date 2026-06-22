-- ============================================================
-- CardHub Index — clear Supabase security lints
--  • security_definer_view: flip public-data views to invoker;
--    convert cross-user aggregate views to definer FUNCTIONS
--  • rls_disabled_in_public: enable RLS on every price_snapshots
--    partition (and on all future ones)
-- ============================================================

-- 1. views that only read public-read tables -> security_invoker
alter view public.v_market       set (security_invoker = on);
alter view public.v_movers       set (security_invoker = on);
alter view public.v_market_stats set (security_invoker = on);
alter view public.v_sets         set (security_invoker = on);
alter view public.v_rarities     set (security_invoker = on);

-- 2. cross-user aggregates -> SECURITY DEFINER functions (not views).
--    These expose only aggregated columns, never raw private tables.
drop view if exists public.v_leaderboard cascade;
create or replace function public.leaderboard()
returns table (
  league_id uuid, user_id uuid, username text, display_name text, avatar_url text,
  value numeric, cash numeric, holdings_value numeric, starting_cash numeric,
  profit numeric, rank bigint
) language sql stable security definer set search_path = public as $$
  select p.league_id, p.user_id, pr.username, pr.display_name, pr.avatar_url,
         p.cash + coalesce(sum(h.qty * a.price), 0) as value, p.cash,
         coalesce(sum(h.qty * a.price), 0) as holdings_value, l.starting_cash,
         (p.cash + coalesce(sum(h.qty * a.price), 0)) - l.starting_cash as profit,
         rank() over (partition by p.league_id
                      order by p.cash + coalesce(sum(h.qty * a.price), 0) desc) as rank
    from portfolios p
    join profiles pr on pr.user_id = p.user_id
    join leagues l on l.id = p.league_id
    left join holdings h on h.portfolio_id = p.id
    left join assets a on a.id = h.asset_id
   group by p.league_id, p.user_id, pr.username, pr.display_name, pr.avatar_url, p.cash, l.starting_cash;
$$;
grant execute on function public.leaderboard() to anon, authenticated;

drop view if exists public.v_most_traded cascade;
create or replace function public.most_traded()
returns table (
  asset_id bigint, name text, image_url text, slug text, number text, variant text,
  price numeric, change_pct numeric, set_name text, game_slug text,
  buys bigint, sells bigint, total_qty bigint, total_value numeric
) language sql stable security definer set search_path = public as $$
  select o.asset_id, c.name, c.image_url, c.slug, c.number, a.variant, a.price, a.change_pct,
         s.name, g.slug,
         count(*) filter (where o.side = 'buy'),
         count(*) filter (where o.side = 'sell'),
         sum(o.qty), sum(o.executed_value)
    from orders o
    join assets a on a.id = o.asset_id
    join cards c on c.product_id = a.product_id
    join sets s on s.group_id = c.group_id
    join games g on g.category_id = c.category_id
   where o.status = 'filled' and o.executed_at > now() - interval '7 days'
   group by o.asset_id, c.name, c.image_url, c.slug, c.number, a.variant, a.price, a.change_pct, s.name, g.slug;
$$;
grant execute on function public.most_traded() to anon, authenticated;

-- 3. enable RLS (+ public read) on every existing price_snapshots partition
do $$
declare r record;
begin
  for r in
    select c.relname from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_class p on p.oid = i.inhparent
     where p.relname = 'price_snapshots'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=r.relname) then
      execute format('create policy "read" on public.%I for select using (true)', r.relname);
    end if;
  end loop;
end $$;

-- 4. make future partitions get RLS automatically
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
      v_name, v_start, v_end);
    execute format('alter table public.%I enable row level security', v_name);
    execute format('create policy "read" on public.%I for select using (true)', v_name);
  end if;
end $$;
revoke execute on function public.ensure_snapshot_partition(timestamptz) from anon, authenticated;
