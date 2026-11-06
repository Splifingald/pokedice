# Players' suggestions (Discord, November 2026)

Status: **built and live** (2026-11-06), pushed to `main` from `ccr-c1e5e49c-o2vzba`. **On for everyone, with no
switch**: the user's call of 2026-11-06 ("ship them on, no need for a switch"), an exception to docs/15 §20. Nothing
to set up (§7). The UI rules: docs/15 §51.

Six suggestions from #💡-suggestions (Ash and Ceurana, 2026-11-04 and 05). The user picked a way for each with the
built-in questions; five are built, one is left out.

| Suggestion | Who | The user's pick |
|---|---|---|
| A pre-selection for raid teams | Ash | **Favourites first**: a heart on a Pokémon; the raid team picker lists the favourites before the automatic suggestions |
| Shinies sorted, or a different background | Ash | **A shiny card background** in the Box |
| An option to skip the catch | Ash | **PASS, only for a Pokémon already owned** |
| Shinies already in the shiny Pokédex marked on the route preview | Ceurana | **A small shiny star** in a corner of the card |
| A status heal in auto-mode | Ash | **A HEAL button with a timer** |
| Amulet Coin (Pièce Rune): more ₽ from trainers, by levels | Ceurana | **Skipped** for now |

Every rule and number is the engine's (`src/engine/qol.ts`); the screens show them. All five live on the player's
device (the favourites in the save, the rest only what a screen shows or offers): no server function acts for them.

## 1. Raid favourites

- **The heart**: in the Pokémon sheet (a toggle, "Favourite", pressed when on, with the line "Favourites come first
  when you pick a raid team."), and on each card of the raid team picker (its own 36 px button at the card's top right,
  beside the card's button, named "{name}: favourite").
- **The order**: the favourites first in every sort of the raid team picker (Recommended, Highest level, Pokédex No.,
  Name), each group then in the sort's own order. The order takes the hearts as they were when the picker opened, so a
  heart tapped there doesn't move the card under the thumb; it comes first the next time ("Tap a heart: that Pokémon
  comes first here next time.").
- **The save**: `favourites`, instance ids (`toggleFavourite`, at most 600). Ids of Pokémon that left every Box (traded,
  released) are dropped at the next toggle.

## 2. Shiny tiles in the Box

A shiny's tile in the Box (and in the Pokémon waiting for their region) sits on `gold-pale`, its star kept: the Box draws
the menu icon, which has no shiny colours, so the star alone was easy to miss. A purely visual change (§20): no rules.

## 3. PASS on an owned catch

- **When**: the catch panel after a K.O., for a Pokémon already owned by Idle's rule (`canPassCatch` = `idleOwns`, docs/36):
  a plain one once its species is in the Pokédex, a shiny once a shiny of it is in the Box. A new one is never offered
  PASS, so a slip of the thumb can't lose it. Not in raids (their catch has its own card).
- **What it does**: no throw, no ball spent, on to the result card, as Idle's pass does (`passCatch`). It can never do
  better than a throw: a throw without a ball could still catch it.
- **Its look**: with a choice of balls, a small PASS beside "Tap a ball to throw it"; with one button only (no ball, or a
  sure catch), PASS and the throw side by side. **With a choice, no button presses itself**: before, a lone ROLL TO
  CATCH loaded and went by itself, which is what threw Ash's ball-less throws at Pokémon they didn't want.

## 4. The shiny star on an area's Pokémon

On the area's details (the Areas sheet's Details tab), a species whose shiny is in this region's shiny Pokédex wears the
star (`star`, "In your shiny Pokédex") under the caught ball, top right. A purely visual change: no rules.

## 5. Auto-mode's HEAL button

- **When**: auto-mode (or Idle) plays a fight, the Pokémon out is frozen or paralysed (its turn would pass), no item was
  used this turn, the bag is open, and the bag holds a cure for that stun (`autoCureItem`).
- **What shows**: in the battle panel, "{name} can't move this turn: cure it, or the turn passes." and a red "USE
  {item}" with a gauge draining over **3 s** (`AUTO_CURE_MS`, not shortened by the auto pace: it is the player's time to
  react). A tap uses the item (as the Bag would) and the turn goes ahead; left alone, the gauge empties and the turn
  passes as before. A dialog over the fight holds the gauge.
- **Which item**: the narrowest cure first (Paralyze Heal before a cure of several statuses), then the cheapest.
- Not in Versus (no Bag there). Idle keeps "never an item but Poké Balls" for itself: the button waits for a tap.

## 6. Rules and INFO

None of the five has a rules pop-up or an INFO button: each is explained where it happens (§20): the heart's line in the
sheet and the picker's tip, PASS's title ("Leave {name}: you have one already"), the HEAL offer's own line; the gold
tiles and the star only change how something already there looks.

## 7. Setting it up

Nothing to run or switch on: no migration, no admin row. The features are in the build.

## 8. Tests

- `tests/engine/qol.test.ts`: the favourites list, PASS only for an owned one, the cure picked.
- `e2e/player-suggestions.spec.ts`: each part in the game, the kitchen sink's HEAL offer, and a trainer fight's
  send-outs with the area picture on screen every frame (§9).

## 9. Fixed with it: the background flickering at a send-out

The user's report of 2026-11-06: the fight's background flickered between a trainer's Pokémon. Since a trainer's next
Pokémon comes straight into the fight (2.9.2), each one is a new fight, and the battle screen is built again
(`BattleView key={battle.id}`). The area picture (`AreaArt`) started hidden every time and stepped back in over 180 ms,
the drawn background showing meanwhile (about 6 frames at 25 fps). Now a picture already shown this session shows on the
new screen's first frame, decoded with it, without the fade (`artSeen`; `BattleStage` and `StageBackground` start with it
shown). The e2e test counts the frames without it: 12 before the fix, 0 after.
