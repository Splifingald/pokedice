-- Pokémon forms: regional forms, Mega Evolutions and battle forms are rows of `pokemon` past the National Dex
-- (PokeAPI's 10001+ ids; Arceus's types 20001+), and this column says which kind each is:
--   {"of": 19, "kind": "regional", "region": "alola"}            Alolan Rattata
--   {"of": 6, "kind": "mega"}                                     Mega Charizard X / Y
--   {"of": 487, "kind": "battle", "trigger": "lowHp", "swapDie": {"from": "ghost", "to": "dragon"}}
-- Null on a plain species. supabase/seed.sql carries this line too, so running seed.sql alone is enough.
alter table pokemon add column if not exists form jsonb;
