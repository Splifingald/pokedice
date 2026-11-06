# The Unown Pokédex

Unown come in 28 letters (A to Z, ! and ?). In Johto, where they are found, each one caught is a letter, and the
letters fill a page of their own: the **Unown Pokédex**. The region's Pokédex keeps its one Unown entry (the user's
call, 2026-10-25: "only 1 version is necessary for the normal Pokédex"). It sits behind its own admin switch (docs/15
§20), Off by default.

## 1. Decisions

- **It opens with the area**: the page is there once an area of the region being played where Unown live is opened
  (`unownArea`: Johto's Ruins of Alph, a secret area; Mt. Silver's catch-all pool has them too). No area, no page; a
  small world never has it. Read from the wild pools, so an admin who moves Unown moves the page with them.
- **Every variant can be found**: while a letter is missing, every Unown caught is one the page doesn't have yet
  (`unownLetterFor`, at random among the missing), so the 28 come in 28 catches. Once all are found, any letter.
- **A weaker one is still worth it**: a known species is normally caught only when stronger than the copy owned; while a
  letter is missing, an Unown can always be caught (`catchTarget`). It joins as its own Pokémon, and the Box keeps one
  copy per species as always (`releaseDuplicates`), so the weaker one is let go once it settles. The letter stays on
  the page. A stronger one replaces the copy owned and takes the new letter.
- **The letter is drawn as it's caught**, not when it's met: the fight and the encounter are unchanged (one Unown
  sprite), and the result card says which letter it was.
- **Owned, not seen**, and **kept** when it leaves, as the shiny Pokédex (docs/39). An Unown caught before the letters,
  hatched, traded or given has no letter: it reads as an A (`letterOf`), the form the game draws. The letters are
  noted whatever the switch says (`noteUnownDex` as every save settles, and `applyCatch` for a catch).
- **The prize**: the 28th letter pays **₽1,000** (`unownDex.reward`, the admin's number), once per region
  (`unownDexPaid`), into the region's purse. A page finished while the switch was off is paid the day it opens. No
  server function acts for it: the purse is the save's, like every catch's ₽.

## 2. The engine (`src/engine/unownDex.ts`)

- `UNOWN_DEX`, `UNOWN_LETTERS` (the games' order), `isUnownLetter`, `letterOf`, `letterText`.
- `unownDexOn(data)`: the switch (`game_config.unownDex.access`, through `eventOpenTo`); `unownReward(data)`.
- `unownLivesIn(area)`, `unownArea(save, data)` (the area stood in, else the opened one with the most Unown),
  `unownDexOpen(save, data)`.
- `unownDexOf(save, region?)`, `unownDexComplete`, `unownCatchOpen` (open and a letter missing).
- `unownLetterFor(save, rng)`, `addUnownLetters`, `noteUnownDex(save)`, `payUnownDex(save, data)`.
- `unownDexRulesDue` / `markUnownDexSeen`: the rules pop-up, once (`save.unownDexSeen`), in the one-time pop-ups'
  queue right after the shiny Pokédex's (`engine/popups.ts`), never on the Pokédex.
- `PokemonInstance.letter`; `applyCatch` takes `caught.letter` and adds the run event `unown_letter` (`letter`,
  `isNew`, `found`, `total`, `reward` when it was the last) while the page is open.
- Save: `unownDex` (each region's letters), `unownDexPaid` (the regions paid), `unownDexSeen`.

The store draws the letter at the throw (`store/run.ts`, `settleThrow`) and settles every save through
`noteUnownDex` then `payUnownDex` (`store/game.ts`), with a toast when a commit pays it.

## 3. What players see

- **The Pokédex** gets an **Unown** option on its switch (`DexViewSwitch`, beside Shiny when that page is open too);
  `/pokedex?view=unown` opens on it. The page: "Unown Pokédex 7/28", the gauge, where to find them and the prize
  ("Every Unown you catch in Ruins of Alph is a new letter. Find them all for ₽1,000."), then the 28 tiles in the
  games' order: each letter's own sprite once found, a silhouette until then, its letter under it. All found: the
  complete card (**UNOWN POKÉDEX COMPLETE!**, "All 28 letters found: ₽1,000 earned."). **INFO** at the bottom.
- **Home**, while the player stands in an area where Unown live: a **banner above the scene**, as a small world's strip
  (`UnownStripView`): the ruins' picture, the last letter found, "Unown Pokédex", one cell per letter (gold once found),
  "7/28 letters · ₽1,000 for all" and **See** (to the page). Complete: a gold COMPLETE and "All found · ₽1,000 earned".
- **The result card** after an Unown is caught (`UnownLetterCard`): "Unown K: a new letter!" and "12/28 letters"; the
  last one, gold, "Unown Pokédex complete! +₽1,000".
- **The rules** (`UnownDexRulesModal`, the Ruins of Alph as its picture): 28 letters (the Pokédex counts Unown once,
  this page every letter), always a new one (even weaker than yours), one in your Box, the prize. Once as a pop-up
  (Later / Let's go! to the page), then from INFO. Seeing the page counts as reading them.
- Each letter's sprite is Showdown's animated one (`gen5ani/unown-b.gif`, `unown-exclamation`, `unown-question`; the A is
  plain `unown`), loaded like every other Pokémon's; offline, the local Unown (an A) stands in.

Every state is on `/kitchen-sink` (`UnownDexBits`).

## 4. Setting it up

1. Deploy the client (the switch is Off: no page, no banner; Unown are caught as before, and saves start noting their
   letters).
2. Run `supabase/migrations/0080_unown_dex.sql` (the switch's row, Off, with the ₽1,000 prize, and the content version
   + 1; safe to run again):
   https://github.com/Splifingald/pokedice/blob/ccr-4b6b2283-tl9bvv/supabase/migrations/0080_unown_dex.sql
   `supabase/seed.sql` carries it too (inlined). Without it, the admin's switch still saves (it inserts the row).
3. Admin → Config → **Unown Pokédex**: set the **Prize (₽)** if not 1,000, then **On for admin** to try it signed in,
   **On for everyone** to open it. Publish.

## 5. Tests

- `tests/engine/unown-dex.test.ts`: the content (Unown in the Ruins of Alph); the page open only with the switch and
  the area (On for admin: the admin only), in the ruins before Mt. Silver; a letter always missing from the page, all 28
  in 28 catches; a weaker Unown caught while a letter is missing (not once all are found, not while off); the letter on
  the Pokémon and the page, Unown once in the Pokédex; a stronger copy taking the new letter; the letters noted from the
  Box (no letter = A) and kept; the prize once at the 28th, a page finished while off paid when it opens, the admin's
  number; the rules once, never on the Pokédex.
- `tests/engine/popups.test.ts`: the queue's order with `unownDex` after `shinyDex`.
- `tests/unown-dex-sql.test.ts`: migration 0080 (Off with the prize, the content version + 1, the admin's row kept on
  a second run, inlined in seed.sql).
- `e2e/unown-dex.spec.ts`: Off, nothing; On in the ruins, the pop-up once, its GO to the page, the letters found, INFO,
  the banner on Home and its See; a page finished while off paid once.
