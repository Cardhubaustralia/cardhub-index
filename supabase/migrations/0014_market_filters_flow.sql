-- ============================================================
-- CardHub Index — rarity filter options + live order flow
-- (others' locked-in trades, hidden until the lockout window)
-- ============================================================

-- distinct rarities per game, for the market filter dropdown
create or replace view public.v_rarities as
select g.slug as game_slug, c.rarity, count(*) as n
from public.cards c
join public.games g on g.category_id = c.category_id
join public.assets a on a.product_id = c.product_id and a.tradeable and a.price is not null
where c.rarity is not null and c.rarity <> ''
group by g.slug, c.rarity;
grant select on public.v_rarities to anon, authenticated;

-- Order flow for one asset in the active cycle. Details are only
-- revealed once the cycle is LOCKED (now >= locks_at); during the open
-- window the rows come back with null side/qty/user so the UI can show
-- blurred placeholders and a count, but the content stays secret.
create or replace function public.order_flow_for_asset(p_asset_id bigint)
returns table (
  order_id uuid, side text, qty int, username text,
  created_at timestamptz, revealed boolean
)
language plpgsql stable security definer set search_path = public as $$
declare c trade_cycles; rev boolean;
begin
  select * into c from trade_cycles
   where status in ('open','scheduled','locked','executing')
     and executes_at > now() - interval '30 minutes'
   order by executes_at limit 1;
  if c.id is null then return; end if;
  rev := now() >= c.locks_at;
  return query
    select o.id,
      case when rev then o.side end,
      case when rev then o.qty end,
      case when rev then pr.username end,
      o.created_at, rev
    from orders o
    join profiles pr on pr.user_id = o.user_id
    where o.asset_id = p_asset_id and o.cycle_id = c.id and o.status = 'pending'
    order by o.created_at desc
    limit 50;
end $$;
grant execute on function public.order_flow_for_asset(bigint) to anon, authenticated;

-- Market-wide recent order flow (same reveal rules) for a global feed.
create or replace function public.order_flow_global()
returns table (
  order_id uuid, side text, qty int, username text,
  card_name text, card_slug text, game_slug text, variant text,
  created_at timestamptz, revealed boolean
)
language plpgsql stable security definer set search_path = public as $$
declare c trade_cycles; rev boolean;
begin
  select * into c from trade_cycles
   where status in ('open','scheduled','locked','executing')
     and executes_at > now() - interval '30 minutes'
   order by executes_at limit 1;
  if c.id is null then return; end if;
  rev := now() >= c.locks_at;
  return query
    select o.id,
      case when rev then o.side end,
      case when rev then o.qty end,
      case when rev then pr.username end,
      case when rev then ca.name end,
      ca.slug, g.slug, a.variant,
      o.created_at, rev
    from orders o
    join profiles pr on pr.user_id = o.user_id
    join assets a on a.id = o.asset_id
    join cards ca on ca.product_id = a.product_id
    join games g on g.category_id = ca.category_id
    where o.cycle_id = c.id and o.status = 'pending'
    order by o.created_at desc
    limit 40;
end $$;
grant execute on function public.order_flow_global() to anon, authenticated;
