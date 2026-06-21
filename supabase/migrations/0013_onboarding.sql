-- ============================================================
-- CardHub Index — track whether a player has seen onboarding
-- ============================================================
alter table public.profiles add column if not exists onboarded boolean not null default false;
