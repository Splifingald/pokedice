-- Simpler raids (the user's redesign of 2026-10-13, docs/19 "Simpler raids"): the raid Pokémon fights alone. Its
-- summons are gone, so their numbers leave game_config `events` → raid (and each raid Pokémon's own, the day's raids'
-- and the progression raids'), and its bars hold 2.2 times its HP instead of 2, so a raid stays as hard as it was
-- (`pnpm raid-balance`: 56 % wins, 57 % before). An HP per bar the admin set to anything but 2 is theirs and stays.
-- The raid's type matchups (`raid.sideTypes`, `raid.bossTypes`) need no row: the game reads its defaults until the
-- admin saves them. Deploy the client with it: an older one reads its own summon defaults again. Safe to run again.
begin;

update game_config
set value = jsonb_set(
  value,
  '{raid}',
  ((value -> 'raid') - 'startAllies' - 'summonPerBreak' - 'maxField')
    || case
      when jsonb_typeof(value -> 'raid' -> 'barHp') is distinct from 'number' then '{"barHp": 2.2}'::jsonb
      when (value -> 'raid' ->> 'barHp')::numeric = 2 then '{"barHp": 2.2}'::jsonb
      else '{}'::jsonb
    end
)
where key = 'events' and jsonb_typeof(value -> 'raid') = 'object';

-- Each raid Pokémon's own numbers lose their summon numbers; one left with none goes.
update game_config
set value = jsonb_set(value, '{raid,perMon}', coalesce((
  select jsonb_object_agg(dex, own - 'startAllies' - 'summonPerBreak' - 'maxField')
  from jsonb_each(value -> 'raid' -> 'perMon') e(dex, own)
  where jsonb_typeof(own) = 'object' and own - 'startAllies' - 'summonPerBreak' - 'maxField' <> '{}'::jsonb
), '{}'::jsonb))
where key = 'events' and jsonb_typeof(value -> 'raid' -> 'perMon') = 'object';

update game_config
set value = jsonb_set(value, '{raid,progress,perMon}', coalesce((
  select jsonb_object_agg(dex, own - 'startAllies' - 'summonPerBreak' - 'maxField')
  from jsonb_each(value -> 'raid' -> 'progress' -> 'perMon') e(dex, own)
  where jsonb_typeof(own) = 'object' and own - 'startAllies' - 'summonPerBreak' - 'maxField' <> '{}'::jsonb
), '{}'::jsonb))
where key = 'events' and jsonb_typeof(value -> 'raid' -> 'progress' -> 'perMon') = 'object';

commit;
