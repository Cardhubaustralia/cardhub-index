-- ============================================================
-- CardHub Index — let a game's OWNER fix its settings & card pool.
-- (e.g. a wrong set was added to the universe.) Owner-only; the
-- global game is not editable. NULL args mean "leave unchanged".
-- ============================================================

create or replace function public.update_game(
  p_league_id      uuid,
  p_name           text        default null,
  p_join_policy    text        default null,
  p_max_position_pct numeric   default null,
  p_ends_at        timestamptz default null,
  p_universe       jsonb       default null
) returns public.leagues
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league leagues;
begin
  if v_user is null then raise exception 'Not signed in'; end if;

  select * into v_league from leagues where id = p_league_id;
  if v_league.id is null then raise exception 'Game not found'; end if;
  if v_league.is_global then raise exception 'The global game cannot be edited'; end if;
  if v_league.owner_id <> v_user then
    raise exception 'Only the game owner can change its settings';
  end if;

  -- validate the values that were provided
  if p_name is not null and length(trim(p_name)) < 3 then
    raise exception 'Game name too short'; end if;
  if p_join_policy is not null and p_join_policy not in ('open','invite') then
    raise exception 'Invalid join policy'; end if;
  if p_max_position_pct is not null and (p_max_position_pct < 1 or p_max_position_pct > 100) then
    raise exception 'Position limit must be 1-100%%'; end if;
  if p_ends_at is not null and p_ends_at <= v_league.starts_at then
    raise exception 'End date must be after the start date'; end if;

  update leagues set
    name            = coalesce(trim(p_name), name),
    join_policy     = coalesce(p_join_policy, join_policy),
    is_public       = coalesce(p_join_policy = 'open', is_public),
    max_position_pct= coalesce(p_max_position_pct, max_position_pct),
    ends_at         = coalesce(p_ends_at, ends_at),
    universe        = coalesce(p_universe, universe)
  where id = p_league_id
  returning * into v_league;

  return v_league;
end $$;
revoke execute on function public.update_game(uuid, text, text, numeric, timestamptz, jsonb) from anon;
grant execute on function public.update_game(uuid, text, text, numeric, timestamptz, jsonb) to authenticated;
