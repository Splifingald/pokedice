-- v1.9 content for a database created before it: Revive / Max Revive, the energy settings, and Burn / Poison as a
-- share of max HP (percentPerStack / percent replace the old flat damagePerStack / damage). Safe to re-run.
insert into items (key, name, description, sprite_url, price, effect, in_shop, shop_badges) values
  ('revive', 'Revive', 'Revives a fainted Pokémon with half its max HP. In battle or from the Team screen.', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/revive.png', 200, '{"kind":"revive","percent":50}'::jsonb, true, 6),
  ('max-revive', 'Max Revive', 'Revives a fainted Pokémon with all its HP. In battle or from the Team screen.', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/max-revive.png', 350, '{"kind":"revive","percent":100}'::jsonb, true, 8)
on conflict (key) do update set name = excluded.name, description = excluded.description, sprite_url = excluded.sprite_url, price = excluded.price, effect = excluded.effect, in_shop = excluded.in_shop, shop_badges = excluded.shop_badges;

insert into game_config (key, value) values
  ('energy', '{"enabled":true,"max":50,"minutesPerEnergy":30}'::jsonb),
  ('status', '{"burn":{"duration":3,"threshold":1,"percentPerStack":4},"heal":{"amount":"rollTotal","threshold":2},"frozen":{"stunTurns":2,"threshold":3},"poison":{"duration":3,"threshold":2,"percent":10},"confuse":{"threshold":2,"recoilPercent":20},"paralyze":{"stunTurns":1,"threshold":2}}'::jsonb)
on conflict (key) do update set value = excluded.value;
