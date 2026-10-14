-- The Shiny and Raids boards span every region (the user's ask of 2026-10-13): one row per trainer, ranked on the
-- shinies they own across all their regions, or their raids won (a count that was already the same in every region,
-- docs/19 D4). Level, Progression and Pokédex stay one board per region.
--
-- leaderboard() still returns one row per region a trainer holds a badge in, and gains two columns, last (as 0049's
-- `rich`), so a client reading by position keeps working:
--   lead         one row per trainer is true: the region they are playing now, else the first of their boarded
--                regions by id. The cross-region boards keep only these rows, and show that region's team.
--   shinies_all  shiny Pokémon owned over every region the trainer has played, badge or not: the badge only decides
--                whether they are on the boards, not what they own.
-- The rows are ordered with each trainer's together, so the 3,000-row cap never keeps a trainer without their lead row.
-- A new return type can't be `create or replace`d: dropped and made again, with the grants it had (0049). seed.sql
-- inlines this file after 0053 (push notifications). Safe to run again.

drop function if exists leaderboard(text);
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
    and cardinality(r.badges) > 0
    and (c.updated_at > now() - interval '72 hours' or r.user_id = auth.uid())
    and not exists (select 1 from leaderboard_bans x where x.user_id = r.user_id)
  order by c.updated_at desc, r.user_id
  limit 3000
$$;

revoke all on function leaderboard(text) from public;
grant execute on function leaderboard(text) to anon, authenticated;
