-- Friend Battles, version 2.9.6 (docs/65 §18, a player's report of 2026-11-09): after a switch, that side's next 3 turns
-- of its own can't switch, so two players can't answer each other's switch forever.
-- 1. friend_battles_defaults() carries the number, `switchCooldown` 3, as the game's defaults do: friend_battles_cfg()
--    sends it to both games with the rest, and the admin can change it in the Friend Battles box (0 = no cooldown).
--    Whether a switch can be made is the engines' (as in 0137): one refused changes nothing on either game.
-- 2. configVersion + 1, so players fetch the new content.
--
-- Run after 0137; safe to run again.
begin;

create or replace function friend_battles_defaults()
returns jsonb
language sql immutable as $$
  select '{
    "access": "off", "expiry": 120, "pick": 30, "order": 20, "turn": 45, "grace": 90, "shield": 75,
    "classic": true, "draft": true, "ticketDaily": 1, "ticketCap": 3, "ticketPrice": 10, "ticketWeekly": 10,
    "lv100": true, "switchCooldown": 3
  }'::jsonb
$$;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
