-- A smaller leaderboard download (docs/11-SCALING-COST-PLAN.md §6.2 A).
--
-- leaderboard() sends every region's board at once, each row carrying the player's whole per-area progress map
-- (~2.5 KB a row, up to 3,000 rows), and the screen shows one region. leaderboard_region(p_region) sends that region
-- only, and in place of the map the two numbers the ranking uses (src/lib/leaderboard.ts):
--   cleared  the region's main-route areas cleared (areas of the region that aren't hidden)
--   gyms     gym / Elite Four battles won in those areas
-- ~150 bytes a row. The counts are worked out when the cache is rebuilt (once a minute at most, 0026), and live for the
-- caller's own rows, against the `areas` table.
--
-- leaderboard() stays, unchanged, for tabs still running an older build. 0016_regions.sql carries the same pieces, so
-- re-running supabase/seed.sql keeps them. Safe to run again.

alter table leaderboard_cache add column if not exists cleared int;
alter table leaderboard_cache add column if not exists gyms int;

-- `progress` as leaderboard_rows() builds it ({areaId: {cleared, gyms}}), counted over the region's main route.
create or replace function leaderboard_counts(p_region text, p_progress jsonb, out cleared int, out gyms int)
language sql stable set search_path = public as $$
  select
    (count(*) filter (where coalesce((p_progress -> a.id::text ->> 'cleared')::boolean, false)))::int,
    coalesce(sum((p_progress -> a.id::text ->> 'gyms')::int), 0)::int
  from areas a
  where a.region_id = p_region and not a.hidden
$$;

-- As in 0026, plus the counts.
create or replace function leaderboard_refresh() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from leaderboard_cache_state where refreshed_at > now() - interval '1 minute') then
    return;
  end if;
  if not pg_try_advisory_xact_lock(hashtext('pokedice.leaderboard_refresh')) then
    return;
  end if;
  -- Someone may have finished a rebuild between the check and the lock.
  if exists (select 1 from leaderboard_cache_state where refreshed_at > now() - interval '1 minute') then
    return;
  end if;
  delete from leaderboard_cache where true;  -- a bare DELETE is refused through the API (pg-safeupdate)
  insert into leaderboard_cache (user_id, region, name, "character", team, pokedex, max_level, progress, updated_at, cleared, gyms)
  select r.user_id, r.region, r.name, r."character", r.team, r.pokedex, r.max_level, r.progress, r.updated_at, n.cleared, n.gyms
  from leaderboard_rows(now() - interval '72 hours', null) r
  cross join lateral leaderboard_counts(r.region, r.progress) n;
  insert into leaderboard_cache_state (id, refreshed_at) values (true, now())
  on conflict (id) do update set refreshed_at = excluded.refreshed_at;
end
$$;

-- One region's board: everyone else from the cache, the caller live (same rules as leaderboard()).
create or replace function leaderboard_region(p_region text)
returns table (
  is_me boolean,
  name text,
  "character" text,
  team jsonb,
  pokedex int,
  max_level int,
  cleared int,
  gyms int
)
language sql volatile security definer set search_path = public as $$
  select leaderboard_refresh();
  select r.user_id = auth.uid(), r.name, r."character", r.team, r.pokedex, r.max_level, r.cleared, r.gyms
  from (
    select c.user_id, c.name, c."character", c.team, c.pokedex, c.max_level, c.updated_at,
      -- A cache rebuilt before this migration has no counts yet: work them out here until the next rebuild.
      coalesce(c.cleared, (leaderboard_counts(c.region, c.progress)).cleared) as cleared,
      coalesce(c.gyms, (leaderboard_counts(c.region, c.progress)).gyms) as gyms
    from leaderboard_cache c
    where c.region = p_region
      and c.user_id is distinct from auth.uid()
      and not exists (select 1 from leaderboard_bans x where x.user_id = c.user_id)
    union all
    select m.user_id, m.name, m."character", m.team, m.pokedex, m.max_level, m.updated_at, n.cleared, n.gyms
    from leaderboard_rows(null, auth.uid()) m
    cross join lateral leaderboard_counts(m.region, m.progress) n
    where m.region = p_region
  ) r
  order by r.updated_at desc
  limit 3000
$$;

revoke all on function leaderboard_counts(text, jsonb) from public, anon, authenticated;
revoke all on function leaderboard_refresh() from public, anon, authenticated;
revoke all on function leaderboard_region(text) from public;
grant execute on function leaderboard_region(text) to anon, authenticated;
