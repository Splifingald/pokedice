-- Status faces, reworked (docs/01 §3.2): a single face is enough for every status, so the thresholds are gone.
-- 1. game_config `status`: Poison 5 % for 5 turns; Freeze and Paralysis a chance per face (sure at 3 and at 2 faces);
--    Confusion 10 % recoil per face, 3 faces at most; Heal the Heal faces' value plus their die's upgrade (nothing to
--    set). The old keys (thresholds, `confuse.recoilPercent`, `heal`) mean nothing now, so the row is rewritten, kept
--    equal to the game's defaults; only Burn, which works as before, keeps the admin's numbers. Battles run on the
--    player's device, so no server function reads it.
-- 2. configVersion + 1, so players fetch the new rules. Safe to run again: a row already reworked is left alone.
begin;
insert into game_config (key, value) values ('status', '{}'::jsonb) on conflict (key) do nothing;
update game_config
set value = jsonb_build_object(
  'burn', coalesce(value -> 'burn', '{"threshold": 1, "percentPerStack": 4, "duration": 3}'::jsonb),
  'poison', '{"percent": 5, "duration": 5}'::jsonb,
  'frozen', '{"sureAt": 3, "stunTurns": 2}'::jsonb,
  'paralyze', '{"sureAt": 2, "stunTurns": 1}'::jsonb,
  'confuse', '{"recoilPercentPerFace": 10, "maxFaces": 3}'::jsonb
)
where key = 'status' and not coalesce(value -> 'paralyze' ? 'sureAt', false);
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
