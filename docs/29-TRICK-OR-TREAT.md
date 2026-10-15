# Trick or Treat

Status: **built** (2026-10-15) on `feat/hh-trick-or-treat` (from `feature/version_2`); the migration is **0056**. It
ships **Off** (Admin → Events → Trick or Treat, docs/15 §20).

A new encounter card for Haunted Hollow (docs/26), the user's request of 2026-10-15: a ghost floats in, you tempt it with
Treats and throw Trick Balls, and too many of either make it flee.

## 1. The rules (all in `src/engine/trickOrTreat.ts`)

| Question | Answer |
|---|---|
| Where | **One card in the deck of each of Haunted Hollow's ten main areas** (Dusk Road … Spirit Mountain): decks go from 10 to 11 cards. The Shadow Elite has no deck; the secret areas have none. Any area can deal it: its copies are its encounter weight `trick` (Admin → Areas → Encounter deck), and it needs a ghost list. |
| The switch | **Off / On for admin / On for everyone**, Off by default (`game_config.trickOrTreat.access`). Off: the card is never dealt (`deckCounts` gives it no copy) and a card left in a deck dealt before is discarded like any card the area can't produce. |
| Who comes | **Ghost types only**, from the area's own list (`trickOrTreat.areas[areaId]`), each with a tier: common, rare, very rare. The card picks one by its tier's weight (6 · 3 · 1). |
| Its level | Within the area's level range (around the team in an area that scales). Shiny at the wild odds there (a Shiny Parade counts); a legendary never. |
| The gauge | 0 to 100, starts at 0, cut into **sections**: each says the d6 a Trick Ball needs there, higher sections easier; **the last stretch is the flee zone**. |
| Treat | Endless and free (not an item). Fills the gauge by a random whole number, 10 to 30 (admin). Into the flee zone: it flees. |
| Trick Ball | Endless and free (not an item). Rolls a d6 against the section the gauge is in: at or over the need, caught. A miss doesn't scare it off, but it gets **restless: the gauge rises by 35** (admin), which can push it into the flee zone. |
| A catch | As a wild catch there (`catchTarget`, `applyCatch`): the team if it has room, else the Box (no "Add to team?" question); a stronger one replaces your weakest plain copy; a shiny is its own Pokémon; one as strong as yours merges into it (nothing new). The world's Pokédex notes it; a secret area whose condition it meets opens. |
| The end | Caught or fled, the card is used. No battle, no XP, no ₽. The energy it costs is a wild card's (1). |

### Each tier's gauge (defaults)

| Tier | Weight | Sections (from → the d6 needed) | Flees from |
|---|---|---|---|
| Common | 6 | 0 → 6 · 40 → 5+ · 75 → 4+ · 80 → 3+ | 90 |
| Rare | 3 | 0 → 6 · 40 → 5+ · 75 → 4+ | 85 |
| Very rare | 1 | 0 → 6 · 40 → 5+ | 55 |

### Where it differs from the first idea, and why

The user's first numbers were a failed ball pushing the gauge by **+10**, Treats 10–30, and common 0–34 → 6, 35–59 →
5+, 60–79 → 4+, 80–89 → 3+, flee 90 (rare flee 82, best 4+; very rare flee 75, best 5+), "to start from and verify".
The exact best play (`trickBestPlay`) showed that at +10 a miss costs less room than a Treat and still gives a chance:
**throwing Trick Balls only was the best play, at 98 %** for a common ghost (96 % rare, 88 % very rare), and a Treat was
never worth giving. A miss has to cost more than a Treat for the choice to matter, so the push is **35**, and the
sections and flee zones were then searched (exactly, every boundary on a step of 5) for the tier targets with the widest
gap between the best play and every fixed recipe. The rare tier's flee zone moved from 82 to 85 and the very rare's
from 75 to 55: with only one or two throws before the flee zone, that is what puts a very rare ghost at about one in
three. Every number stays the admin's.

## 2. Balance (measured)

`tests/engine/trick-or-treat.test.ts`: the exact catch rate of each play (`trickBestPlay`, the gauge only goes up so
each value follows from the ones above it), checked against a Monte Carlo of 40,000 encounters per play and tier played
through the engine's own `feedTreat` / `throwTrickBall`. The test keeps best play inside the targets (70–80 %, 50–60 %,
30–40 %) and every other play at least 4 points under it.

| Play | Common | Rare | Very rare |
|---|---|---|---|
| **Best play** (exact) | **74.7 %** | **58.4 %** | **35.1 %** |
| Best play (Monte Carlo) | 74.7 % | 58.7 % | 35.2 % |
| Trick Balls only | 53.5 % | 53.5 % | 30.6 % |
| One Treat, then Balls | 61.5 % | 50.6 % | 29.4 % |
| Two Treats, then Balls | 57.5 % | 51.3 % | 23.5 % |
| Treats up to the best section, then Balls | 32.9 % | 24.7 % | 24.9 % |
| A coin flip each time | 44.7 % | 39.3 % | 22.8 % |

What the best play does (gauge → action): common 0–4 Treat, 5–19 Ball, 20–39 Treat, 40–54 Ball, 55–69 Treat, 70–89
Ball; rare 0–3 Treat, 4–14 Ball, 15–34 Treat, 35–49 Ball, 50–58 Treat, 59–84 Ball; very rare 0–3 Treat, 4–19 Ball,
20–34 Treat, 35–54 Ball. In words: throw when a miss would still land in a better section, short of the flee zone;
feed a Treat otherwise. The admin shows the three exact rates beside each tier's numbers as they're edited.

## 3. Haunted Hollow's ghosts

Each main area's ghost-type wild Pokémon, the tier from its wild weight against the pool's heaviest entry (40 % of it or
more: common; 20 % or more: rare; less: very rare: `ghostsFromWildPool`, the admin's Prefill). Frozen Lake has no ghost
in the wild: the user's own list.

| Area | Ghosts |
|---|---|
| Dusk Road | Drifloon (rare), Gastly (very rare) |
| Foggy Marsh | Gastly, Golett (rare) |
| Whispering Woods | Phantump, Pumpkaboo, Bramblin |
| Lantern Town | Litwick, Shuppet, Misdreavus (very rare) |
| Old Quarry | Golett |
| Frozen Lake | Shuppet, Duskull, Froslass (very rare) |
| Sunken Shore | Sandygast |
| Rusted Armory | Honedge, Doublade (very rare) |
| Windy Cliffs | Drifloon, Drifblim (rare), Brambleghast (rare) |
| Spirit Mountain | Duskull, Misdreavus, Banette, Dusclops (rare) |

All of them are already the world's (its pools, or Froslass by the Dawn Stone), so its Pokédex count (124) is unchanged.

## 4. The pieces

- **Engine** (`engine/trickOrTreat.ts`): `trickOn`, `trickGhosts`, `trickDealable`, `pickTrickGhost`, `trickOdds`,
  `ghostsFromWildPool`, `trickBand` / `trickZoneAt` (the admin's numbers cleaned up), `startTrick`, `feedTreat`,
  `throwTrickBall`, `trickBestPlay`, `applyTrickCatch`, `trickRulesDue` / `markTrickRulesSeen`. In `engine/encounters.ts`
  the `trick` card (`rollTrick`, `deckCounts` / `deckAbilities` / `deckSize` given the game data), the encounter
  `{ kind: 'trick', dex, level, tier, isNew, shiny? }`; the campaign simulator walks past it like the Game Corner.
- **Store** (`store/run.ts`): the phase `trick`, `run.trick` (the state, the last step for the screen to play, the catch);
  `giveTreat`, `throwTrickBall`, `leaveTrick`. `store/trick.ts`: the server's check.
- **Save**: `trickOrTreat.rulesSeen`; `trick` in an area's deck and drawn cards.
- **Screens**: the preview card (`TrickCard`), the round gauge's pumpkin, the area details' round mix (only where it's
  dealt), and **the encounter's screen, laid out as the battle** (the user's request of 2026-10-15; docs/15 §28):
  `TrickView` takes the whole screen in place of the area page (`screens/Area.tsx`, as a battle does), the battle's
  stage on top with the ghost at its centre and its plate, then the message box, the gauge with its value ("62/100")
  and what the last Treat or miss added ("+18"), the last step's die against the die it needed, TREAT and TRICK BALL
  (the die the section needs, its "+", the odds and a miss's push under it), INFO at the foot; once it's over, the
  battle's result card (`Overlay`, `CatchCard` with the Trick Ball, `SecretAreaCard`) with the round gauge and
  CONTINUE. Every state on `/kitchen-sink` (`TrickBits`: idle, after a Treat, a Treat and a throw playing, a miss, a
  flee, caught, each tier's gauge, the recaps and the risen result card).
- **Animations** (the game's pixel FX, not CSS): `fx/timelines/trick.ts` (`treatTimeline`: the Treat's arc with
  twinkles, the catch with a hit-stop, the munch with crumbs and hearts, the gauge's glow and ring; the ghost's flee,
  rising and dithering into wisps as the area dims) and the battle's `fx/timelines/catch.ts` with the Trick Ball
  (`ball: 'trick'`: `fx/scenes.ts` draws it from its picture, pixel for pixel), the ghost awake at the stage's centre
  (`at`, `ground`, `awake`) and fleeing as a ghost (`ghost`). Motion levels and sounds as the battle's. On
  `/kitchen-sink/fx` with the other timelines.
- **Pictures**: `public/items/treat.png` (the Rare Candy in pumpkin orange) and `public/items/trick-ball.png` (the Poké
  Ball in purple, its button orange), made from the item atlas by `tsx scripts/trick-or-treat-sprites.ts` (pngjs, no new
  dependency). The pumpkin and ghost icons are drawn in `components/icons.tsx`.
- **Sounds** (`audio/sfx.ts`): `trick.toss`, `trick.munch`, `trick.fill`, `trick.flee` on the Treat's cues, with the
  catch's own throw, open, close, wobble, settle, Gotcha, break-free and stay on the Trick Ball's.
- **Admin**: Events → Trick or Treat (`TrickOrTreatTab`): the switch, the Treat's range and a miss's push, each tier's
  weight, sections and flee zone with its exact rates and its gauge, and each area's ghosts (Pokémon, tier, Prefill
  from the wild pool, Clear). Areas → Encounter deck has the Trick or Treat copies. `admin/schemas.ts` checks the row
  (`TRICK_SCHEMA`: sections from 0, rising, inside the flee zone; Treat max ≥ min; tiers known) and the deck's `trick`.
- **Strings**: `ui.trick.*` (the screen's `ui.trick.ballOdds`, `ui.trick.needs` and `ui.trick.delta` since the battle
  layout), `ui.card.trick`, `ui.home.kind.trick`, `ui.enc.titleTrick`, in the ten languages.

## 5. The switch and the server

- The game reads `trickOrTreat.access` through `eventOpenTo` (`trickOn`).
- **The server checks it too** (migration 0056): `trick_or_treat_open()`, the switch for the caller (on for everyone,
  or for the admin only by their JWT). A signed-in player's game asks it before the ghost comes out (kept 5 minutes);
  said no, or not reachable, the card is spent and a toast says it isn't open. A guest only ever has "On for everyone".
- **Rules**: the rules pop-up (`TrickRulesModal`: the haunted picture with a Treat and a Trick Ball, four rows with the
  config's numbers) the first time a ghost floats in, Later / Let's go! (both carry on), and INFO at the foot of the screen's panel.

## 6. Setting it up

1. Run the migration in Supabase → SQL Editor:
   https://github.com/Splifingald/pokedice/blob/feature/version_2/supabase/migrations/0056_trick_or_treat.sql
   (after 0052 and 0055). It adds the card to the ten decks, the `trickOrTreat` row (Off, with the world's ghost lists)
   and `trick_or_treat_open()`, and bumps `configVersion`; an admin's own numbers, lists and deck counts are kept. Safe
   to run again. `supabase/seed.sql` carries it too (its decks' step does nothing there until 0052's content is in).
2. Or, over an admin export: `tsx scripts/patch-hh-trick-or-treat.ts <in.json> <out.json>`, then `pnpm import-bundle`.
   Fresh content (`pnpm haunted-hollow`) already has it.
3. Admin → Events → Trick or Treat: **On for admin** to try it, then **On for everyone**.
