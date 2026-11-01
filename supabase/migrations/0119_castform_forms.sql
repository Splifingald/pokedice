-- Castform's weather forms (docs/62 §3, the user's ask of 2026-11-01): its Sunny (Fire), Rainy (Water) and Snowy (Ice)
-- Forms, battle forms taken as a fight under sun, rain (or a thunderstorm) or snow starts, its Normal dice turning into
-- the form's type. They are never caught (a Castform caught in one is Castform). 1. The three rows, left alone when
-- there. 2. configVersion + 1. Safe to run again. supabase/seed.sql carries them.
begin;
insert into pokemon (dex, name, type1, type2, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones, notes, form) values
  (10013, 'Castform', 'fire', null, 12, 281, 70, '/pokemon/10013_front.png', '[{"type":"fire","count":2}]'::jsonb, 2, 5, '[]'::jsonb, '[]'::jsonb, 'castform-sunny · in sun, its Normal dice become fire dice', '{"of":351,"kind":"battle","trigger":"weather","weather":["sun"]}'::jsonb),
  (10014, 'Castform', 'water', null, 12, 281, 70, '/pokemon/10014_front.png', '[{"type":"water","count":2}]'::jsonb, 2, 5, '[]'::jsonb, '[]'::jsonb, 'castform-rainy · in rain or thunderstorm, its Normal dice become water dice', '{"of":351,"kind":"battle","trigger":"weather","weather":["rain","thunderstorm"]}'::jsonb),
  (10015, 'Castform', 'ice', null, 12, 281, 70, '/pokemon/10015_front.png', '[{"type":"ice","count":2}]'::jsonb, 2, 5, '[]'::jsonb, '[]'::jsonb, 'castform-snowy · in snow, its Normal dice become ice dice', '{"of":351,"kind":"battle","trigger":"weather","weather":["snow"]}'::jsonb)
on conflict (dex) do nothing;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
