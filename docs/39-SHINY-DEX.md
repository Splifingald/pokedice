# The shiny Pokédex

Each region's Pokédex gets a second page once that region's League is beaten: **Shiny**, every species of the region
the player has owned shiny there. A collection to finish after the credits, as the Pokédex is before them. It sits
behind its own admin switch (docs/15 §20), Off by default.

## 1. Decisions

- **One per region**, as the Pokédex is: regions are separate runs (a Box, a bag, a purse each), so a shiny caught in
  Johto fills Johto's shiny page. The page lists the same species as the region's Pokédex (`regionSpecies`).
- **It opens with the region's League** (`leagueDone`): the Pokédex is the game's first checklist, the shiny one is
  the next. A small world's region never has it (it has no League of its own).
- **Owned, not seen**: a species counts the moment one is the player's, however it came (caught, hatched, a gift, a
  raid, a trade, an evolution: a shiny Charmander that evolves fills Charmeleon too), and **stays** when it leaves (a
  trade, a release), as a catch stays in the Pokédex. A fossil still reviving doesn't count yet, as in the Pokédex.
- **Noted whatever the switch says**: the save keeps its shinies from the first day, so the page is whole the day the
  admin opens it, and a save from before it fills from its Boxes the first time it loads.
- **Display only**: it gives nothing and changes no odds, so no server function acts for it (as the dice throws); the
  server needs only the switch's row.

## 2. The engine (`src/engine/shinyDex.ts`)

- `shinyDexOn(data)`: the switch (`game_config.shinyDex.access`, read through `eventOpenTo`).
- `shinyDexOpen(save, data)`: the switch, a real region, its League beaten.
- `noteShinyDex(save)`: notes every shiny in the live Box, the parked regions' Boxes and the Day Care's residents
  under their own region (`save.shinyDex[region]`), never taking one off. The same save back when nothing is new. The
  store runs it as every save settles (`settle`, `store/game.ts`), so nothing that adds a Pokémon has to remember it.
- `shinyDexOf(save, region?)`: the species noted for a region (the live one by default).
- `shinyDexRulesDue` / `markShinyDexSeen`: the rules pop-up, once (`save.shinyDexSeen`); it takes its turn in the
  one-time pop-ups' queue right after the General upgrades' (`engine/popups.ts`), never on the Pokédex.

## 3. The screen

- The Pokédex's top gets a **Pokédex / Shiny** switch (`DexViewSwitch`, a `Seg`) once the page is open;
  `/pokedex?view=shiny` opens on it (the pop-up's Let's go!). Seeing the page counts as reading its rules.
- On the shiny page the count, the gauge and the filters count what's owned shiny: All, **Shiny** (owned shiny),
  Missing, Nearby (meetable now, in the region's opened areas, and not owned shiny). A tile owned shiny wears the Box's
  star (top left) and opens its entry in shiny colours (`DexEntry` / `PokemonSheet` `shiny`, the best shiny owned if
  there is one); the rest are silhouettes, named once caught. NEW tags stay on the Pokédex page.
- All of it owned shiny: the complete card says **SHINY POKÉDEX COMPLETE!**
- **INFO** at the bottom of the Pokédex (once the page is open) shows the rules again: a page for shinies, counted for
  good, the hunt (the player's wild odds now, `wildShinyChance`: the Shiny Charm shows), each region its own. The
  picture is the crystal cave.

Every state is on `/kitchen-sink` (`ShinyDexBits`).

## 4. Setting it up

1. Deploy the client (the switch is Off: the Pokédex has one page; saves start noting their shinies).
2. Run `supabase/migrations/0075_shiny_dex.sql` (the switch's row, Off, and the content version + 1; safe to run again):
   https://github.com/Splifingald/pokedice/blob/feature/version_2_3/supabase/migrations/0075_shiny_dex.sql
   `supabase/seed.sql` carries it too (inlined). Without it, the admin's switch still saves (it inserts the row).
3. Admin → Config → **Shiny Pokédex**: **On for admin** to try it signed in, **On for everyone** to open it. Publish.

## 5. Tests

- `tests/engine/shiny-dex.test.ts`: the live Box noted under its region, a species kept once it leaves, parked Boxes
  and the Day Care under their own regions, a reviving fossil left out, the same save back when nothing is new; the
  page open only with the switch and the League (On for admin: the admin only); the rules once, after the region's
  offer and the rebattle event, never on the Pokédex.
- `tests/engine/popups.test.ts`: the queue's order with `shinyDex` after `general`.
- `tests/shiny-dex-sql.test.ts`: migration 0075 (Off, the content version + 1, the admin's switch kept on a second
  run, inlined in seed.sql).
- `e2e/shiny-dex.spec.ts`: Off, one page; On with the League beaten, the pop-up once, its GO to the shiny page, a shiny
  owned starred and counted, INFO.
