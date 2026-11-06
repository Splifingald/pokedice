-- Halloween 2026's trainer look (docs/31 §7): the Halloween 26 Pokémaniac, granted once to every player who holds a
-- shiny Giratina, or who caught Haunted Hollow's in its Distortion World raid (that raid in `events.raidsDone`), in
-- either of their saves. The grant goes into the main save (`looks.earned`), whose progress the looks read.
--
-- A shiny Giratina is one the player owns: in a Box (the live region's or a parked one's), the Day Care, a Box it
-- waits to join (a closed world's homers, its pending catches, a raid's locked prizes) or a trade still listed. Not
-- today's raid boss, a friend's Day Care guest, a trade log or an encounter left half-way: those aren't theirs.
--
-- The save is stamped now (its row and `updatedAt`), so every device sees the cloud copy moved and compares again; the
-- game keeps a look granted to either copy, whichever wins (keepLooksEarned), so a device played on meanwhile keeps
-- it too. The game itself gives it from then on to whoever wins that raid, so this only covers what is already there.
-- Not in seed.sql: a fresh database has no players. Safe to run again (who already has it is left alone): run it once
-- more after Haunted Hollow ends (1 Nov 2026) for anyone who caught theirs in an Extreme save in the meantime.

begin;

with stamp as (
  select date_trunc('milliseconds', now()) as at
),
owners as (
  select distinct s.user_id
  from saves s
  where jsonb_path_exists(s.data, '$.box[*] ? (@.dex == 487 && @.shiny == true)')
    or jsonb_path_exists(s.data, '$.parked.*.box[*] ? (@.dex == 487 && @.shiny == true)')
    or jsonb_path_exists(s.data, '$.dayCare.residents[*].inst ? (@.dex == 487 && @.shiny == true)')
    or jsonb_path_exists(s.data, '$.parked.*.dayCare.residents[*].inst ? (@.dex == 487 && @.shiny == true)')
    or jsonb_path_exists(s.data, '$.events.worldHome[*].inst ? (@.dex == 487 && @.shiny == true)')
    or jsonb_path_exists(s.data, '$.events.worldPending[*] ? (@.dex == 487 && @.shiny == true)')
    or jsonb_path_exists(s.data, '$.events.raidLocked[*] ? (@.dex == 487 && @.shiny == true)')
    or jsonb_path_exists(s.data, '$.trades.out[*].mon ? (@.dex == 487 && @.shiny == true)')
    -- Haunted Hollow's Distortion World (0052), its raid won: Giratina caught there, even if since let go.
    or jsonb_path_exists(s.data, '$.events.raidsDone[*] ? (@ == "cfff57e0-5175-545c-9e68-a2e2e64d7d45:487")')
)
update saves s
set
  data = jsonb_set(
    jsonb_set(
      s.data,
      '{looks}',
      (case when jsonb_typeof(s.data -> 'looks') = 'object' then s.data -> 'looks' else '{}'::jsonb end)
        || jsonb_build_object(
          'earned',
          (case
            when jsonb_typeof(s.data -> 'looks' -> 'earned') = 'array' then s.data -> 'looks' -> 'earned'
            else '[]'::jsonb
          end) || '["events/halloween-2026-pokemaniac"]'::jsonb
        )
    ),
    '{updatedAt}',
    to_jsonb((extract(epoch from stamp.at) * 1000)::bigint)
  ),
  updated_at = stamp.at
from owners, stamp
where s.user_id = owners.user_id
  and s.realm = 'main'
  and not jsonb_path_exists(s.data, '$.looks.earned[*] ? (@ == "events/halloween-2026-pokemaniac")');

commit;
