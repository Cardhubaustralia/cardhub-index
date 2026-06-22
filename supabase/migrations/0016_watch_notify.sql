-- ============================================================
-- CardHub Index — watchlist + notifications (trades & updates)
-- ============================================================

-- notification prefs
alter table public.profiles add column if not exists notify_trades  boolean not null default true;
alter table public.profiles add column if not exists notify_general boolean not null default true;

-- ------------------------------------------------------------
-- WATCHLIST
-- ------------------------------------------------------------
create table if not exists public.watchlist (
  user_id    uuid not null,
  asset_id   bigint not null references public.assets(id),
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);
create index if not exists watchlist_user_idx on public.watchlist(user_id, created_at desc);

alter table public.watchlist enable row level security;
drop policy if exists "own watchlist read" on public.watchlist;
drop policy if exists "own watchlist write" on public.watchlist;
drop policy if exists "own watchlist delete" on public.watchlist;
create policy "own watchlist read"   on public.watchlist for select using (auth.uid() = user_id);
create policy "own watchlist write"  on public.watchlist for insert with check (auth.uid() = user_id);
create policy "own watchlist delete" on public.watchlist for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  kind       text not null check (kind in ('trade','update')),
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where not read;

alter table public.notifications enable row level security;
drop policy if exists "own notifications read" on public.notifications;
drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications read"   on public.notifications for select using (auth.uid() = user_id);
create policy "own notifications update" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Trade outcome -> notification (fires inside execute_cycle's updates,
-- so it's part of the same transaction and rolls back on failure)
-- ------------------------------------------------------------
create or replace function public.notify_on_order_resolve()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_card text; v_gslug text; v_cslug text; v_lname text; v_pref boolean;
begin
  if new.status = old.status or new.status not in ('filled','rejected') then
    return new;
  end if;
  select notify_trades into v_pref from profiles where user_id = new.user_id;
  if not coalesce(v_pref, true) then return new; end if;

  select c.name, g.slug, c.slug into v_card, v_gslug, v_cslug
    from assets a
    join cards c on c.product_id = a.product_id
    join games g on g.category_id = c.category_id
   where a.id = new.asset_id;
  select name into v_lname from leagues where id = new.league_id;

  if new.status = 'filled' then
    insert into notifications (user_id, kind, title, body, link)
    values (new.user_id, 'trade',
      initcap(new.side) || ' filled · ' || coalesce(v_card,'card'),
      new.side || ' ' || new.qty || ' @ ' || to_char(new.executed_price, 'FM$999G999G990D00')
        || case when new.side = 'sell' and new.realized_pnl is not null
             then ' (P&L ' || to_char(new.realized_pnl, 'FM$999G999G990D00') || ')' else '' end
        || ' in ' || coalesce(v_lname, 'game'),
      '/card/' || v_gslug || '/' || v_cslug);
  else
    insert into notifications (user_id, kind, title, body, link)
    values (new.user_id, 'trade',
      'Order not filled · ' || coalesce(v_card,'card'),
      coalesce(new.reject_reason, 'Could not be filled'),
      '/card/' || v_gslug || '/' || v_cslug);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_order on public.orders;
create trigger trg_notify_order
  after update on public.orders
  for each row execute function public.notify_on_order_resolve();

-- ------------------------------------------------------------
-- Daily "days left" updates (run from the daily cron). Deduped per day.
-- ------------------------------------------------------------
create or replace function public.notify_daily()
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link)
  select m.user_id, 'update',
    d.days || ' day' || (case when d.days = 1 then '' else 's' end) || ' left in ' || l.name,
    'The season is wrapping up — check where you sit on the leaderboard.',
    '/leagues/' || l.id
  from leagues l
  join lateral (
    select greatest(0, ceil(extract(epoch from (l.ends_at - now())) / 86400))::int as days
  ) d on true
  join league_members m on m.league_id = l.id
  join profiles p on p.user_id = m.user_id and p.notify_general
  where not l.is_global and l.ends_at is not null and d.days in (7, 3, 1)
    and not exists (
      select 1 from notifications n
      where n.user_id = m.user_id and n.link = '/leagues/' || l.id
        and n.created_at::date = now()::date
    );
$$;
revoke execute on function public.notify_daily() from anon, authenticated;

-- unread count helper
create or replace function public.unread_notification_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where user_id = auth.uid() and not read;
$$;
grant execute on function public.unread_notification_count() to authenticated;
