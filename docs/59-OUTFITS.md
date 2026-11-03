# Outfits

The user's asks (2026-10-31 to 2026-11-01): *"would you be able to make a custom one with a santa hat? Animated too.
Put the animated ones in the cloudflare bucket."* Then how they're used: *"Same stats as normal pokemon but special
outfit pokemon cannot evolve except if there is a version of their evolution with the outfit."* The Gift calendar's
session asked that outfit Pokémon can be given by its doors (docs/55).

**Status: built** on `version/2_8`, behind its switch, **Off** (docs/15 §20). The migration is **0105**.

## 1. Decisions

| Question | Answer |
|---|---|
| What an outfit is | A **tag on the Pokémon** (`PokemonInstance.outfit`, a key of `OUTFITS` in `src/engine/outfits.ts`), as a shiny is: the same species, Pokédex entry, dice, stats, HP and talent. Only its look changes |
| The first one | **Santa Pikachu** (`santa`): our own drawing over Showdown's animated Original Cap Pikachu, after Pokémon GO's holiday Pikachu, in the four views the game uses (front, back, both shiny): `design/outfits/README.md` |
| Evolving | **Only into a species wearing the same outfit** (the user's rule). No Raichu wears a Santa hat, so Santa Pikachu stays a Pikachu: no evolution by level, no Thunder Stone, no Link Cable, no trade evolution. A Santa Pichu, if one is drawn, would evolve into Santa Pikachu |
| Its own Pokémon | **As a shiny**: never let go as a duplicate (`releaseDuplicates`), never overwritten by a stronger wild catch (`catchTarget`), a trade or a hatchling; a plain copy beside it lives its own life |
| Eggs | An Egg it leaves **hatches plain** (the Egg keeps only its parents' species) |
| Trades | It **keeps its outfit** (`receiveTrade`); the listing's board row shows a plain Pikachu (§4) |
| Where it comes from | **Gifts**: a Pokémon gift (the developer's messages, the welcome-back and invite gifts, which share `Gift`) and the **Gift calendar's** doors can carry an outfit, picked in the admin's editors (*Outfit*, only for a species that has one) |
| Its switch | `outfits.access`: **Off / On for admin / On for everyone**, Off by default (Admin → Config → Switches, *Outfits*). Off: a gift with an outfit brings the plain Pokémon, an outfit Pokémon owned looks plain (its tag kept), no chip, no rules. The evolution rule holds either way, so turning it back on never finds a Raichu it can't draw |
| Server check | **None**: an outfit only changes looks and evolution in the player's own save, as the gift calendar's switch (0100). Message gifts' check (`feedback_gifts_ok`, 0048) already lets the extra field through |
| Sprites | **Only from our sprite copy** (`VITE_SPRITES_HOST`, docs/45): our drawings aren't on Showdown. Without the copy every outfit shows plain, so the game never asks Showdown for a file it doesn't have (a miss would mark Showdown down for every sprite, docs/13) |
| Rules | No page of its own: a **rules pop-up**, once, in the one-time pop-ups' queue after the hidden talents', when the first Pokémon in an outfit has arrived with the switch on (Later / Let's go!); **INFO** is a tap on the outfit's chip on the Pokémon sheet (OK) |

## 2. What players see

- **The Pokémon sheet**: its outfit sprite in the hero, and a red chip with the outfit's name (*Santa hat*) beside the
  shiny one; a tap shows the rules.
- **The team and the Box**: a small Santa hat beside the name on the team's cards, and in the tile's top-right corner
  on the Box (the menu icons have no outfit), named for screen readers.
- **Battle, Home's scene, the Day Care** (the yard and the slot cards): the outfit sprite, front and back. A Gigantamax
  form shows the plain Gigantamax Pikachu.
- **Gifts**: the opening shows the outfit sprite; the gift's line says "Pikachu Lv.10 Santa hat" with a red chip; its
  icon has the hat in the corner. The calendar's doors use the same words and icon.
- **The rules** (three rows): *Dressed up* (only the look changes), *Evolves only in its outfit* (Santa Pikachu stays a
  Pikachu), *A gift to keep* (its own Pokémon like a shiny; kept in a trade; Eggs hatch plain).

## 3. Code

- **Engine** `src/engine/outfits.ts` (pure): `OUTFITS` (each outfit's sprite per species; `own`: drawn by us),
  `outfitsOn`, `outfitOf(data, inst)` (the outfit to show: switch on and drawn on that species), `hasOutfit`,
  `outfitAllowsEvolution`, `outfitChoices`, `cleanOutfit`, `ownsOutfit`, `outfitRulesDue` / `markOutfitRulesSeen`.
  The evolution gate sits in `stoneEvolution`, `linkEvolution`, `levelEvolutions` (progression.ts) and `receiveTrade`;
  the "its own Pokémon" rule beside each `!p.shiny` (run.ts `releaseDuplicates`, catching.ts, trade.ts, daycare.ts).
  Gifts: `parseGifts` / `placeGifts` (gifts.ts), `normaliseCalendarReward` / `calendarGifts` (calendar.ts). The queue:
  `outfits` in popups.ts.
- **Types**: `PokemonInstance.outfit`, `GameConfig.outfits`, `SaveData.outfitRulesSeen`, `outfit` on `Gift` and
  `CalendarReward`'s Pokémon; the save schema keeps a known outfit and drops any other, never the Pokémon.
- **Sprites** `src/lib/outfitSprites.ts`: `OUTFIT_SPRITES` (each drawing's entry, in `showdown-sprites.json`'s shape:
  its measured boxes, the species' icon and cry), `outfitSprite`, `ownSpritesServed`. `showdownView`, `SpriteImg`,
  `stageSprite`, `loadSprite` and `spriteKey` take an optional `outfit`; battlers carry it (`BattlerSeed.outfit`).
- **UI** `src/components/Outfit.tsx`: `OutfitChip`, `OutfitRulesModal`, `OutfitRulesPopup` (PopupQueue), `outfitName`;
  the `santaHat` pixel icon; every state on `/kitchen-sink` (`OutfitBits`), and a Santa Pikachu door in `CalendarBits`.
- **Admin** `src/admin/OutfitSelect.tsx`, in the calendar's `DayRow` and in `GiftEditor`; the switch in
  `ConfigSection.tsx`'s `FEATURES`.
- **Files** `sprites-custom/sprites/gen5ani{,-back}{,-shiny}/pikachu-santa.gif`, copied into the sprite copy by
  `pnpm sprites-mirror` (docs/45); `design/outfits/` has the drawing tool and the hat art.
- **Strings**: `ui.outfit.*`, ten languages.
- **Tests**: `tests/engine/outfits.test.ts`, the Santa door in `tests/engine/calendar.test.ts`, the queue's order in
  `tests/engine/popups.test.ts`, the outfit files and entries in `tests/sprites-mirror.test.ts`, the 28 switches in
  `e2e/admin-config.spec.ts`, and `e2e/outfits.spec.ts` (the rules once, the card's hat, the sheet's chip; off: plain).

## 4. Not yet

- **Other players' screens** show a plain Pikachu: the server's snapshots copy chosen fields of a Pokémon (Versus teams,
  friends' raid teams and profiles, the trade board's row, friends' Day Cares), and none copies the outfit yet. A
  traded one still arrives in its hat.
- **The menu icons** are Showdown's sheet, with no outfit: the hat in the corner stands in.
- **More outfits**: Showdown's own Cap and Cosplay Pikachus and Furfrou's trims (§13 of the first proposal), drawn
  outfits for other species. Each is an `OUTFITS` row, an `OUTFIT_SPRITES` entry and, for one of ours, its files.

## 5. Setting it up

1. Run in Supabase → SQL Editor (the switch's row, Off; `supabase/seed.sql` inlines it too, after 0101):
   https://github.com/Splifingald/pokedice/blob/ccr-9185c524-ychnfs/supabase/migrations/0105_outfits.sql
2. Put Santa Pikachu's files in the sprite copy: `pnpm sprites-mirror`, then
   `pnpm dlx wrangler@4 pages deploy sprites-mirror --project-name=pokedice-sprites --branch=main` (docs/45 step 4).
3. Admin → Config → Switches → **Outfits**: *On for admin*, Save & Publish; give yourself a Santa Pikachu (a message's
   gift, or a calendar door: Pokémon Pikachu, Outfit *Santa hat*) and try it signed in as admin. Then *On for
   everyone* and Save & Publish again.
