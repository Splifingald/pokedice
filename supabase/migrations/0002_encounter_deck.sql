-- Pokédice v1.4: encounter decks, easy areas, no global damage multiplier. Safe to re-run.
-- Run once in the Supabase SQL editor if your tables were created before this change
-- (a fresh install from 0001_init.sql already has the easy_mode column).

alter table areas add column if not exists easy_mode boolean not null default false;

-- Damage is exactly what the dice show now: the old global pacing knob is gone. Fight length is tuned through HP.
delete from game_config where key = 'damageScale';
insert into game_config (key, value) values ('hpMultiplier', '1.4'::jsonb) on conflict (key) do nothing;

-- Encounter decks. The game falls back to these same defaults if the rows are missing.
insert into game_config (key, value) values
  ('encounterMode', '"deck"'::jsonb),
  ('encounterDeckSize', '10'::jsonb)
on conflict (key) do nothing;
