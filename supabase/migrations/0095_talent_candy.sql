-- The Talent Candy (docs/51): a Rare Candy reskin that reveals the hidden talent of a Pokémon whose family hasn't found
-- it yet, for its whole family. Never in the Mart (`in_shop` false) nor in any loot table: the admin puts it in a
-- Special Shop live event. As src/data/items.json has it (the test keeps the two the same). Left alone if there:
-- seed.sql writes it too. Safe to run again.
begin;
insert into items (key, name, description, sprite_url, price, effect, in_shop, shop_badges) values
  ('talent-candy', 'Talent Candy', 'Reveals a Pokémon''s hidden talent, for its whole family. Use it from the Team screen.',
   '/items/talent-candy.png', 1500, '{"kind":"talent"}'::jsonb, false, 0)
on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
