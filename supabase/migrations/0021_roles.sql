-- ============================================================
-- CardHub Index — user roles; only lead/admin can create games
-- ============================================================
alter table public.profiles add column if not exists role text not null default 'user'
  check (role in ('user','lead','admin'));

-- gate create_game on role (server-side enforcement)
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
  v_role text;
  v_league leagues;
  v_code text;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  select role into v_role from profiles where user_id = v_user;
  if coalesce(v_role,'user') not in ('lead','admin') then
    raise exception 'Only leads and admins can create games';
  end if;
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

-- make yourself an admin (run once, replace with your username):
-- update public.profiles set role = 'admin' where username = 'CardhubDev';
