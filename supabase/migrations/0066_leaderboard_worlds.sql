-- Small worlds get a leaderboard (the user's ask of 2026-10-18). A world has no gyms, so 0024's rule (a region's row
-- only once its player holds a badge there) left every world board empty. In a world, the first area cleared stands
-- for the badge: every trainer who has cleared one of its areas is on its board, badges elsewhere or not.
--
-- A world is a region on the admin's list (game_config `smallWorlds`, as trade_world() in 0044 reads it), so a world
-- taken off the list leaves the boards with it. Everything else is 0054's leaderboard(), the same columns and order;
-- the same signature and return type, so `create or replace` keeps its grants. Run after 0054. seed.sql inlines it
-- after 0064. Safe to run again.

create or replace function leaderboard(p_realm text default 'main')
returns table (
  region text,
  is_me boolean,
  name text,
  "character" text,
  team jsonb,
  pokedex int,
  max_level int,
  shinies int,
  progress jsonb,
  is_friend boolean,
  friend_id uuid,
  raids_won int,
  rich boolean,
  lead boolean,
  shinies_all int
)
language sql stable security definer set search_path = public as $$
  select r.region, r.user_id = auth.uid(), c.name, c.avatar, r.team, r.pokedex, r.max_level, r.shinies, r.progress,
         m.id is not null, m.id, coalesce(e.raids_won, 0), player_rich(c.user_id),
         row_number() over (partition by r.user_id order by r.region = c.region desc, r.region) = 1,
         (
           select coalesce(sum(a.shinies), 0)::int from player_card_regions a
           where a.user_id = r.user_id and a.realm = r.realm
         )
  from player_card_regions r
  join player_cards c on c.user_id = r.user_id and c.realm = r.realm
  left join friend_ids_of(auth.uid()) m on m.id = r.user_id
  left join event_state e on e.user_id = r.user_id and e.realm = r.realm
  where r.realm = p_realm
    and (
      cardinality(r.badges) > 0
      or (
        exists (
          select 1
          from jsonb_array_elements(coalesce((select value -> 'list' from game_config where key = 'smallWorlds'), '[]')) w
          where w ->> 'regionId' = r.region
        )
        and exists (select 1 from jsonb_each(r.progress) p(k, v) where coalesce((v ->> 'cleared')::boolean, false))
      )
    )
    and (c.updated_at > now() - interval '72 hours' or r.user_id = auth.uid())
    and not exists (select 1 from leaderboard_bans x where x.user_id = r.user_id)
  order by c.updated_at desc, r.user_id
  limit 3000
$$;

revoke all on function leaderboard(text) from public;
grant execute on function leaderboard(text) to anon, authenticated;
