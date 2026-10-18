-- Battle powers (docs/35): Mega Evolution's gem rules, Gigantamax's newer rules and Z-Moves. The game decides all of it
-- and keeps it in the save (src/engine/powers.ts: `save.powers`, the gems held and the badges that open each power);
-- the server holds the three switches and shows Versus each player's powers.
--
-- 1. The 95 Mega Gems (one item per Mega form, Primal Reversion and Ultra Burst included), for a database that hasn't
--    run seed.sql since they were added. Left alone if there: seed.sql writes them too.
-- 2. power_open(kind): a power's switch as the server reads it ('mega' → game_config megaEvolution.gems.access,
--    'gmax' → gigantamax.boost.access, 'z' → zMove.access), like general_open (0049). No row, or an odd value: off.
--    The switches live inside those rows, which the admin writes; nothing is inserted here, so the game's defaults
--    (engine/defaults.ts: all three off) stand until the admin saves Config.
-- 3. player_powers(user, realm): a player's powers as the caller may see them — the gems from their save while the gem
--    rules are on for the caller, Gigantamax and Z-Moves while those are on and the save notes their badge won.
-- 4. versus_board: a last `powers` column (last, so a client reading by position keeps working). Its return type
--    changes, so it is dropped and made again with its grants, as 0049 did.
--
-- Run after 0063; safe to run again. seed.sql inlines it last (scripts/seed.ts), after 0049, whose versus_board it
-- redefines.

-- ---------------------------------------------------------------- 1. the gems

-- As src/data/items.json has them (tests/powers-sql.test.ts keeps the two the same).
insert into items (key, name, description, sprite_url, price, effect, in_shop, shop_badges) values
  ('venusaurite', 'Venusaurite', 'Lets Venusaur Mega Evolve into Mega Venusaur in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/venusaurite.png', 1000, '{"kind":"megaGem","mega":10033}'::jsonb, false, 0),
  ('charizardite-x', 'Charizardite X', 'Lets Charizard Mega Evolve into Mega Charizard X in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/charizardite-x.png', 1000, '{"kind":"megaGem","mega":10034}'::jsonb, false, 0),
  ('charizardite-y', 'Charizardite Y', 'Lets Charizard Mega Evolve into Mega Charizard Y in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/charizardite-y.png', 1000, '{"kind":"megaGem","mega":10035}'::jsonb, false, 0),
  ('blastoisinite', 'Blastoisinite', 'Lets Blastoise Mega Evolve into Mega Blastoise in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/blastoisinite.png', 1000, '{"kind":"megaGem","mega":10036}'::jsonb, false, 0),
  ('alakazite', 'Alakazite', 'Lets Alakazam Mega Evolve into Mega Alakazam in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/alakazite.png', 1000, '{"kind":"megaGem","mega":10037}'::jsonb, false, 0),
  ('gengarite', 'Gengarite', 'Lets Gengar Mega Evolve into Mega Gengar in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/gengarite.png', 1000, '{"kind":"megaGem","mega":10038}'::jsonb, false, 0),
  ('kangaskhanite', 'Kangaskhanite', 'Lets Kangaskhan Mega Evolve into Mega Kangaskhan in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/kangaskhanite.png', 1000, '{"kind":"megaGem","mega":10039}'::jsonb, false, 0),
  ('pinsirite', 'Pinsirite', 'Lets Pinsir Mega Evolve into Mega Pinsir in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/pinsirite.png', 1000, '{"kind":"megaGem","mega":10040}'::jsonb, false, 0),
  ('gyaradosite', 'Gyaradosite', 'Lets Gyarados Mega Evolve into Mega Gyarados in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/gyaradosite.png', 1000, '{"kind":"megaGem","mega":10041}'::jsonb, false, 0),
  ('aerodactylite', 'Aerodactylite', 'Lets Aerodactyl Mega Evolve into Mega Aerodactyl in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/aerodactylite.png', 1000, '{"kind":"megaGem","mega":10042}'::jsonb, false, 0),
  ('mewtwonite-x', 'Mewtwonite X', 'Lets Mewtwo Mega Evolve into Mega Mewtwo X in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mewtwonite-x.png', 1000, '{"kind":"megaGem","mega":10043}'::jsonb, false, 0),
  ('mewtwonite-y', 'Mewtwonite Y', 'Lets Mewtwo Mega Evolve into Mega Mewtwo Y in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mewtwonite-y.png', 1000, '{"kind":"megaGem","mega":10044}'::jsonb, false, 0),
  ('ampharosite', 'Ampharosite', 'Lets Ampharos Mega Evolve into Mega Ampharos in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/ampharosite.png', 1000, '{"kind":"megaGem","mega":10045}'::jsonb, false, 0),
  ('scizorite', 'Scizorite', 'Lets Scizor Mega Evolve into Mega Scizor in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/scizorite.png', 1000, '{"kind":"megaGem","mega":10046}'::jsonb, false, 0),
  ('heracronite', 'Heracronite', 'Lets Heracross Mega Evolve into Mega Heracross in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/heracronite.png', 1000, '{"kind":"megaGem","mega":10047}'::jsonb, false, 0),
  ('houndoominite', 'Houndoominite', 'Lets Houndoom Mega Evolve into Mega Houndoom in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/houndoominite.png', 1000, '{"kind":"megaGem","mega":10048}'::jsonb, false, 0),
  ('tyranitarite', 'Tyranitarite', 'Lets Tyranitar Mega Evolve into Mega Tyranitar in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tyranitarite.png', 1000, '{"kind":"megaGem","mega":10049}'::jsonb, false, 0),
  ('blazikenite', 'Blazikenite', 'Lets Blaziken Mega Evolve into Mega Blaziken in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/blazikenite.png', 1000, '{"kind":"megaGem","mega":10050}'::jsonb, false, 0),
  ('gardevoirite', 'Gardevoirite', 'Lets Gardevoir Mega Evolve into Mega Gardevoir in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/gardevoirite.png', 1000, '{"kind":"megaGem","mega":10051}'::jsonb, false, 0),
  ('mawilite', 'Mawilite', 'Lets Mawile Mega Evolve into Mega Mawile in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mawilite.png', 1000, '{"kind":"megaGem","mega":10052}'::jsonb, false, 0),
  ('aggronite', 'Aggronite', 'Lets Aggron Mega Evolve into Mega Aggron in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/aggronite.png', 1000, '{"kind":"megaGem","mega":10053}'::jsonb, false, 0),
  ('medichamite', 'Medichamite', 'Lets Medicham Mega Evolve into Mega Medicham in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/medichamite.png', 1000, '{"kind":"megaGem","mega":10054}'::jsonb, false, 0),
  ('manectite', 'Manectite', 'Lets Manectric Mega Evolve into Mega Manectric in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/manectite.png', 1000, '{"kind":"megaGem","mega":10055}'::jsonb, false, 0),
  ('banettite', 'Banettite', 'Lets Banette Mega Evolve into Mega Banette in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/banettite.png', 1000, '{"kind":"megaGem","mega":10056}'::jsonb, false, 0),
  ('absolite', 'Absolite', 'Lets Absol Mega Evolve into Mega Absol in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/absolite.png', 1000, '{"kind":"megaGem","mega":10057}'::jsonb, false, 0),
  ('garchompite', 'Garchompite', 'Lets Garchomp Mega Evolve into Mega Garchomp in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/garchompite.png', 1000, '{"kind":"megaGem","mega":10058}'::jsonb, false, 0),
  ('lucarionite', 'Lucarionite', 'Lets Lucario Mega Evolve into Mega Lucario in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/lucarionite.png', 1000, '{"kind":"megaGem","mega":10059}'::jsonb, false, 0),
  ('abomasite', 'Abomasite', 'Lets Abomasnow Mega Evolve into Mega Abomasnow in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/abomasite.png', 1000, '{"kind":"megaGem","mega":10060}'::jsonb, false, 0),
  ('latiasite', 'Latiasite', 'Lets Latias Mega Evolve into Mega Latias in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/latiasite.png', 1000, '{"kind":"megaGem","mega":10062}'::jsonb, false, 0),
  ('latiosite', 'Latiosite', 'Lets Latios Mega Evolve into Mega Latios in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/latiosite.png', 1000, '{"kind":"megaGem","mega":10063}'::jsonb, false, 0),
  ('swampertite', 'Swampertite', 'Lets Swampert Mega Evolve into Mega Swampert in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/swampertite.png', 1000, '{"kind":"megaGem","mega":10064}'::jsonb, false, 0),
  ('sceptilite', 'Sceptilite', 'Lets Sceptile Mega Evolve into Mega Sceptile in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/sceptilite.png', 1000, '{"kind":"megaGem","mega":10065}'::jsonb, false, 0),
  ('sablenite', 'Sablenite', 'Lets Sableye Mega Evolve into Mega Sableye in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/sablenite.png', 1000, '{"kind":"megaGem","mega":10066}'::jsonb, false, 0),
  ('altarianite', 'Altarianite', 'Lets Altaria Mega Evolve into Mega Altaria in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/altarianite.png', 1000, '{"kind":"megaGem","mega":10067}'::jsonb, false, 0),
  ('galladite', 'Galladite', 'Lets Gallade Mega Evolve into Mega Gallade in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/galladite.png', 1000, '{"kind":"megaGem","mega":10068}'::jsonb, false, 0),
  ('audinite', 'Audinite', 'Lets Audino Mega Evolve into Mega Audino in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/audinite.png', 1000, '{"kind":"megaGem","mega":10069}'::jsonb, false, 0),
  ('sharpedonite', 'Sharpedonite', 'Lets Sharpedo Mega Evolve into Mega Sharpedo in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/sharpedonite.png', 1000, '{"kind":"megaGem","mega":10070}'::jsonb, false, 0),
  ('slowbronite', 'Slowbronite', 'Lets Slowbro Mega Evolve into Mega Slowbro in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/slowbronite.png', 1000, '{"kind":"megaGem","mega":10071}'::jsonb, false, 0),
  ('steelixite', 'Steelixite', 'Lets Steelix Mega Evolve into Mega Steelix in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/steelixite.png', 1000, '{"kind":"megaGem","mega":10072}'::jsonb, false, 0),
  ('pidgeotite', 'Pidgeotite', 'Lets Pidgeot Mega Evolve into Mega Pidgeot in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/pidgeotite.png', 1000, '{"kind":"megaGem","mega":10073}'::jsonb, false, 0),
  ('glalitite', 'Glalitite', 'Lets Glalie Mega Evolve into Mega Glalie in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/glalitite.png', 1000, '{"kind":"megaGem","mega":10074}'::jsonb, false, 0),
  ('diancite', 'Diancite', 'Lets Diancie Mega Evolve into Mega Diancie in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/diancite.png', 1000, '{"kind":"megaGem","mega":10075}'::jsonb, false, 0),
  ('metagrossite', 'Metagrossite', 'Lets Metagross Mega Evolve into Mega Metagross in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/metagrossite.png', 1000, '{"kind":"megaGem","mega":10076}'::jsonb, false, 0),
  ('blue-orb', 'Blue Orb', 'Lets Kyogre undergo Primal Reversion in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/blue-orb.png', 1000, '{"kind":"megaGem","mega":10077}'::jsonb, false, 0),
  ('red-orb', 'Red Orb', 'Lets Groudon undergo Primal Reversion in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/red-orb.png', 1000, '{"kind":"megaGem","mega":10078}'::jsonb, false, 0),
  ('meteorite', 'Meteorite', 'Lets Rayquaza Mega Evolve into Mega Rayquaza in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/meteorite.png', 1000, '{"kind":"megaGem","mega":10079}'::jsonb, false, 0),
  ('cameruptite', 'Cameruptite', 'Lets Camerupt Mega Evolve into Mega Camerupt in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/cameruptite.png', 1000, '{"kind":"megaGem","mega":10087}'::jsonb, false, 0),
  ('lopunnite', 'Lopunnite', 'Lets Lopunny Mega Evolve into Mega Lopunny in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/lopunnite.png', 1000, '{"kind":"megaGem","mega":10088}'::jsonb, false, 0),
  ('salamencite', 'Salamencite', 'Lets Salamence Mega Evolve into Mega Salamence in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/salamencite.png', 1000, '{"kind":"megaGem","mega":10089}'::jsonb, false, 0),
  ('beedrillite', 'Beedrillite', 'Lets Beedrill Mega Evolve into Mega Beedrill in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/beedrillite.png', 1000, '{"kind":"megaGem","mega":10090}'::jsonb, false, 0),
  ('ultranecrozium-z', 'Ultranecrozium Z', 'Lets Necrozma Ultra Burst into Ultra Necrozma in battle. Kept for good, never sold.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/ultranecrozium-z--bag.png', 1000, '{"kind":"megaGem","mega":10157}'::jsonb, false, 0),
  ('clefablite', 'Clefablite', 'Lets Clefable Mega Evolve into Mega Clefable in battle. Kept for good, never sold.',
   '/items/clefablite.png', 1000, '{"kind":"megaGem","mega":10278}'::jsonb, false, 0),
  ('victreebelite', 'Victreebelite', 'Lets Victreebel Mega Evolve into Mega Victreebel in battle. Kept for good, never sold.',
   '/items/victreebelite.png', 1000, '{"kind":"megaGem","mega":10279}'::jsonb, false, 0),
  ('starminite', 'Starminite', 'Lets Starmie Mega Evolve into Mega Starmie in battle. Kept for good, never sold.',
   '/items/starminite.png', 1000, '{"kind":"megaGem","mega":10280}'::jsonb, false, 0),
  ('dragoninite', 'Dragoninite', 'Lets Dragonite Mega Evolve into Mega Dragonite in battle. Kept for good, never sold.',
   '/items/dragoninite.png', 1000, '{"kind":"megaGem","mega":10281}'::jsonb, false, 0),
  ('meganiumite', 'Meganiumite', 'Lets Meganium Mega Evolve into Mega Meganium in battle. Kept for good, never sold.',
   '/items/meganiumite.png', 1000, '{"kind":"megaGem","mega":10282}'::jsonb, false, 0),
  ('feraligite', 'Feraligite', 'Lets Feraligatr Mega Evolve into Mega Feraligatr in battle. Kept for good, never sold.',
   '/items/feraligite.png', 1000, '{"kind":"megaGem","mega":10283}'::jsonb, false, 0),
  ('skarmorite', 'Skarmorite', 'Lets Skarmory Mega Evolve into Mega Skarmory in battle. Kept for good, never sold.',
   '/items/skarmorite.png', 1000, '{"kind":"megaGem","mega":10284}'::jsonb, false, 0),
  ('froslassite', 'Froslassite', 'Lets Froslass Mega Evolve into Mega Froslass in battle. Kept for good, never sold.',
   '/items/froslassite.png', 1000, '{"kind":"megaGem","mega":10285}'::jsonb, false, 0),
  ('emboarite', 'Emboarite', 'Lets Emboar Mega Evolve into Mega Emboar in battle. Kept for good, never sold.',
   '/items/emboarite.png', 1000, '{"kind":"megaGem","mega":10286}'::jsonb, false, 0),
  ('excadrite', 'Excadrite', 'Lets Excadrill Mega Evolve into Mega Excadrill in battle. Kept for good, never sold.',
   '/items/excadrite.png', 1000, '{"kind":"megaGem","mega":10287}'::jsonb, false, 0),
  ('scolipite', 'Scolipite', 'Lets Scolipede Mega Evolve into Mega Scolipede in battle. Kept for good, never sold.',
   '/items/scolipite.png', 1000, '{"kind":"megaGem","mega":10288}'::jsonb, false, 0),
  ('scraftinite', 'Scraftinite', 'Lets Scrafty Mega Evolve into Mega Scrafty in battle. Kept for good, never sold.',
   '/items/scraftinite.png', 1000, '{"kind":"megaGem","mega":10289}'::jsonb, false, 0),
  ('eelektrossite', 'Eelektrossite', 'Lets Eelektross Mega Evolve into Mega Eelektross in battle. Kept for good, never sold.',
   '/items/eelektrossite.png', 1000, '{"kind":"megaGem","mega":10290}'::jsonb, false, 0),
  ('chandelurite', 'Chandelurite', 'Lets Chandelure Mega Evolve into Mega Chandelure in battle. Kept for good, never sold.',
   '/items/chandelurite.png', 1000, '{"kind":"megaGem","mega":10291}'::jsonb, false, 0),
  ('chesnaughtite', 'Chesnaughtite', 'Lets Chesnaught Mega Evolve into Mega Chesnaught in battle. Kept for good, never sold.',
   '/items/chesnaughtite.png', 1000, '{"kind":"megaGem","mega":10292}'::jsonb, false, 0),
  ('delphoxite', 'Delphoxite', 'Lets Delphox Mega Evolve into Mega Delphox in battle. Kept for good, never sold.',
   '/items/delphoxite.png', 1000, '{"kind":"megaGem","mega":10293}'::jsonb, false, 0),
  ('greninjite', 'Greninjite', 'Lets Greninja Mega Evolve into Mega Greninja in battle. Kept for good, never sold.',
   '/items/greninjite.png', 1000, '{"kind":"megaGem","mega":10294}'::jsonb, false, 0),
  ('pyroarite', 'Pyroarite', 'Lets Pyroar Mega Evolve into Mega Pyroar in battle. Kept for good, never sold.',
   '/items/pyroarite.png', 1000, '{"kind":"megaGem","mega":10295}'::jsonb, false, 0),
  ('floettite', 'Floettite', 'Lets Floette Mega Evolve into Mega Floette in battle. Kept for good, never sold.',
   '/items/floettite.png', 1000, '{"kind":"megaGem","mega":10296}'::jsonb, false, 0),
  ('malamarite', 'Malamarite', 'Lets Malamar Mega Evolve into Mega Malamar in battle. Kept for good, never sold.',
   '/items/malamarite.png', 1000, '{"kind":"megaGem","mega":10297}'::jsonb, false, 0),
  ('barbaracite', 'Barbaracite', 'Lets Barbaracle Mega Evolve into Mega Barbaracle in battle. Kept for good, never sold.',
   '/items/barbaracite.png', 1000, '{"kind":"megaGem","mega":10298}'::jsonb, false, 0),
  ('dragalgite', 'Dragalgite', 'Lets Dragalge Mega Evolve into Mega Dragalge in battle. Kept for good, never sold.',
   '/items/dragalgite.png', 1000, '{"kind":"megaGem","mega":10299}'::jsonb, false, 0),
  ('hawluchanite', 'Hawluchanite', 'Lets Hawlucha Mega Evolve into Mega Hawlucha in battle. Kept for good, never sold.',
   '/items/hawluchanite.png', 1000, '{"kind":"megaGem","mega":10300}'::jsonb, false, 0),
  ('drampanite', 'Drampanite', 'Lets Drampa Mega Evolve into Mega Drampa in battle. Kept for good, never sold.',
   '/items/drampanite.png', 1000, '{"kind":"megaGem","mega":10302}'::jsonb, false, 0),
  ('falinksite', 'Falinksite', 'Lets Falinks Mega Evolve into Mega Falinks in battle. Kept for good, never sold.',
   '/items/falinksite.png', 1000, '{"kind":"megaGem","mega":10303}'::jsonb, false, 0),
  ('raichunite-x', 'Raichunite X', 'Lets Raichu Mega Evolve into Mega Raichu X in battle. Kept for good, never sold.',
   '/items/raichunite-x.png', 1000, '{"kind":"megaGem","mega":10304}'::jsonb, false, 0),
  ('raichunite-y', 'Raichunite Y', 'Lets Raichu Mega Evolve into Mega Raichu Y in battle. Kept for good, never sold.',
   '/items/raichunite-y.png', 1000, '{"kind":"megaGem","mega":10305}'::jsonb, false, 0),
  ('chimechite', 'Chimechite', 'Lets Chimecho Mega Evolve into Mega Chimecho in battle. Kept for good, never sold.',
   '/items/chimechite.png', 1000, '{"kind":"megaGem","mega":10306}'::jsonb, false, 0),
  ('absolite-z', 'Absolite Z', 'Lets Absol Mega Evolve into Mega Absol Z in battle. Kept for good, never sold.',
   '/items/absolite-z.png', 1000, '{"kind":"megaGem","mega":10307}'::jsonb, false, 0),
  ('staraptite', 'Staraptite', 'Lets Staraptor Mega Evolve into Mega Staraptor in battle. Kept for good, never sold.',
   '/items/staraptite.png', 1000, '{"kind":"megaGem","mega":10308}'::jsonb, false, 0),
  ('garchompite-z', 'Garchompite Z', 'Lets Garchomp Mega Evolve into Mega Garchomp Z in battle. Kept for good, never sold.',
   '/items/garchompite-z.png', 1000, '{"kind":"megaGem","mega":10309}'::jsonb, false, 0),
  ('lucarionite-z', 'Lucarionite Z', 'Lets Lucario Mega Evolve into Mega Lucario Z in battle. Kept for good, never sold.',
   '/items/lucarionite-z.png', 1000, '{"kind":"megaGem","mega":10310}'::jsonb, false, 0),
  ('heatranite', 'Heatranite', 'Lets Heatran Mega Evolve into Mega Heatran in battle. Kept for good, never sold.',
   '/items/heatranite.png', 1000, '{"kind":"megaGem","mega":10311}'::jsonb, false, 0),
  ('darkranite', 'Darkranite', 'Lets Darkrai Mega Evolve into Mega Darkrai in battle. Kept for good, never sold.',
   '/items/darkranite.png', 1000, '{"kind":"megaGem","mega":10312}'::jsonb, false, 0),
  ('golurkite', 'Golurkite', 'Lets Golurk Mega Evolve into Mega Golurk in battle. Kept for good, never sold.',
   '/items/golurkite.png', 1000, '{"kind":"megaGem","mega":10313}'::jsonb, false, 0),
  ('meowsticite', 'Meowsticite', 'Lets Meowstic Mega Evolve into Mega Meowstic in battle. Kept for good, never sold.',
   '/items/meowsticite.png', 1000, '{"kind":"megaGem","mega":10314}'::jsonb, false, 0),
  ('crabominite', 'Crabominite', 'Lets Crabominable Mega Evolve into Mega Crabominable in battle. Kept for good, never sold.',
   '/items/crabominite.png', 1000, '{"kind":"megaGem","mega":10315}'::jsonb, false, 0),
  ('golisopite', 'Golisopite', 'Lets Golisopod Mega Evolve into Mega Golisopod in battle. Kept for good, never sold.',
   '/items/golisopite.png', 1000, '{"kind":"megaGem","mega":10316}'::jsonb, false, 0),
  ('magearnite', 'Magearnite', 'Lets Magearna Mega Evolve into Mega Magearna in battle. Kept for good, never sold.',
   '/items/magearnite.png', 1000, '{"kind":"megaGem","mega":10317}'::jsonb, false, 0),
  ('zeraorite', 'Zeraorite', 'Lets Zeraora Mega Evolve into Mega Zeraora in battle. Kept for good, never sold.',
   '/items/zeraorite.png', 1000, '{"kind":"megaGem","mega":10319}'::jsonb, false, 0),
  ('scovillainite', 'Scovillainite', 'Lets Scovillain Mega Evolve into Mega Scovillain in battle. Kept for good, never sold.',
   '/items/scovillainite.png', 1000, '{"kind":"megaGem","mega":10320}'::jsonb, false, 0),
  ('glimmoranite', 'Glimmoranite', 'Lets Glimmora Mega Evolve into Mega Glimmora in battle. Kept for good, never sold.',
   '/items/glimmoranite.png', 1000, '{"kind":"megaGem","mega":10321}'::jsonb, false, 0),
  ('tatsugirinite', 'Tatsugirinite', 'Lets Tatsugiri Mega Evolve into Mega Curly Tatsugiri in battle. Kept for good, never sold.',
   '/items/tatsugirinite.png', 1000, '{"kind":"megaGem","mega":10322}'::jsonb, false, 0),
  ('baxcalibrite', 'Baxcalibrite', 'Lets Baxcalibur Mega Evolve into Mega Baxcalibur in battle. Kept for good, never sold.',
   '/items/baxcalibrite.png', 1000, '{"kind":"megaGem","mega":10325}'::jsonb, false, 0)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2. the switches

create or replace function power_open(p_kind text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (
    select case p_kind
      when 'mega' then (select value -> 'gems' ->> 'access' from game_config
                        where key = 'megaEvolution' and jsonb_typeof(value) = 'object')
      when 'gmax' then (select value -> 'boost' ->> 'access' from game_config
                        where key = 'gigantamax' and jsonb_typeof(value) = 'object')
      when 'z' then (select value ->> 'access' from game_config where key = 'zMove' and jsonb_typeof(value) = 'object')
    end a
  ) x
$$;
revoke all on function power_open(text) from public;
grant execute on function power_open(text) to anon, authenticated;

-- ---------------------------------------------------------------- 3. a player's powers

-- From the save of that realm: `powers.gems` (strings only) and `powers.earned` (the badges won). Every key always
-- there, so the game reads one shape; a switch off for the caller empties its part.
create or replace function player_powers(p_user uuid, p_realm text default 'main')
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gems', case when power_open('mega') then coalesce((
              select jsonb_agg(g) from jsonb_array_elements(
                case when jsonb_typeof(p -> 'gems') = 'array' then p -> 'gems' else '[]'::jsonb end
              ) g where jsonb_typeof(g) = 'string'
            ), '[]'::jsonb) else '[]'::jsonb end,
    'gmax', power_open('gmax') and coalesce(jsonb_typeof(p -> 'earned') = 'array' and p -> 'earned' ? 'gmax', false),
    'z', power_open('z') and coalesce(jsonb_typeof(p -> 'earned') = 'array' and p -> 'earned' ? 'z', false)
  )
  from (
    select coalesce((select s.data -> 'powers' from saves s where s.user_id = p_user and s.realm = p_realm), '{}'::jsonb) p
  ) x
$$;
revoke all on function player_powers(uuid, text) from public;

-- ---------------------------------------------------------------- 4. the Versus board

-- 0049's, with the powers. Versus (0018) is optional on a database that only ran seed.sql: made only when its tables
-- are there.
drop function if exists versus_board(text);
do $do$
begin
  if to_regclass('public.versus_teams') is null then
    return;
  end if;
  execute $ddl$
    create or replace function versus_board(p_realm text default 'main')
    returns table (
      user_id uuid,
      is_me boolean,
      name text,
      "character" text,
      team jsonb,
      ids jsonb,
      version int,
      attack_wins int,
      defense_wins int,
      beaten boolean,
      rich boolean,
      powers jsonb
    )
    language sql stable security definer set search_path = public as $body$
      select
        v.user_id,
        v.user_id = auth.uid(),
        coalesce(c.name, 'Trainer'),
        coalesce(c.avatar, 'red'),
        v.team,
        case when v.user_id = auth.uid() then v.ids end,
        v.version,
        (select count(*)::int from versus_battles b where b.realm = v.realm and b.attacker_id = v.user_id and b.won),
        (
          select count(*)::int from (
            select distinct b.attacker_id, b.defender_version from versus_battles b
            where b.realm = v.realm and b.defender_id = v.user_id and not b.won
          ) held
        ),
        exists (
          select 1 from versus_battles b
          where b.realm = v.realm and b.attacker_id = auth.uid() and b.defender_id = v.user_id
            and b.defender_version = v.version and b.won
        ),
        player_rich(v.user_id),
        player_powers(v.user_id, v.realm)
      from versus_teams v
      left join player_cards c on c.user_id = v.user_id and c.realm = v.realm
      where v.realm = p_realm
      order by v.updated_at desc
      limit 1000
    $body$
  $ddl$;
  revoke all on function versus_board(text) from public;
  grant execute on function versus_board(text) to anon, authenticated;
end
$do$;
