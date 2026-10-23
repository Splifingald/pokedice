# 38 · The game-feel pass

The changes chosen on the Fix Board after the October 2026 UX review: how the battle, the rewards and the menus look,
sound and feel on a phone, plus the accessibility and simplicity fixes that came with them. The review is
<https://claude.ai/artifact/9cZy7XnTtSkbYzYmMnXxt5>, the board <https://claude.ai/artifact/GmZWQ3rjg7RfmLLViyTEA4>.
Each item keeps its board id (F2a, U3a…), so a change can be traced to the decision behind it.

## 1. The switches

Three admin switches (Admin → Config), each **Off / On for admin / On for everyone, Off by default** (docs/15 §20):

| Switch | `config` key, helper | What it covers |
|---|---|---|
| **Game feel** | `gameFeel`, `gameFeelOn` | The juice: the damage count-up and combo tiers, hits that scale, the KO beat, faster turns, the victory payoff, the catch and progress moments, the extra taps and sounds. Off: everything plays as before |
| **Haptics** | `haptics`, `hapticsOn` | Short vibrations (`src/lib/haptics.ts`), with a Settings switch. Android only: iOS Safari can't vibrate |
| **Battle music** | `music`, `musicOn` | An original 8-bit loop under fights, synthesised like the effects, with a Settings switch |

All three only change how the game looks, sounds and feels on the player's device: the engine has decided everything
first, so no server function acts for them and none reads them, as with the dice throws (docs/37 §7.4). They are
purely sensory, so they have **no rules pop-up and no INFO button** (docs/15 §20).

The bug fixes, the accessibility fixes and the simplifications of existing screens have no switch: they change
features already there.

The new sounds live in `src/audio/feel.ts` (`feelSound`), built from `sfx.ts`'s `tone` and `hiss` on the same Sound
switch; the haptics in `src/lib/haptics.ts` (`haptic(cue)`).

## 2. Battle: hits and pace

<!-- WP1 -->

## 3. Battle: the dice and the readout

Measured before at 390×844: 54 px dice, a readout reading "NO COMBO · 5 · BRN 0/1", about 195 px of nothing between
REROLL / ATTACK and the Bag row, and an empty tray while the foe's turn began. The engine still decides every number:
the count-up, the pops and the tiers only show `computeDamage`'s result (each die's face plus upgrade, the combo's key
and bonus, the final damage) and `comboTier`, never a number of their own.

| Board id | Switch | What changed | Why |
|---|---|---|---|
| **F2a** Damage count-up | Game feel | Once the last die is down, each scoring die pops a pixel "+N" over it (its points, `score.tick` a semitone higher each, 60 ms apart), the combo lands as its own beat (its chip, its ring, `combo.<tier>`), then the damage counts to the engine's number in whole steps over 300–500 ms (`score.count` a step). A reroll counts on from the number shown before. `short`: the whole run in 250 ms; `off`: the end state at once. The beats are planned by `src/fx/dice/score.ts` (`planScore`, pure, `tests/dice-score.test.ts`) and played by `useDamageReveal` (`BattlePanel.tsx`). The count is for the eye (`aria-hidden`): the damage button's name already says the engine's number | The damage was a static number that appeared before the dice had finished: nothing said where it came from |
| **F2b** Four combo tiers | Game feel | `comboTier` picks the ring and the sound: a pair keeps the gold ring, tier 2 doubles it, tier 3 frames it in ink between two golds and shakes the tray 2 px, tier 4 adds a ring that turns white and back twice a second, names the combo over the tray ("FIVE OF A KIND!", `ui.battle.comboBanner`) and flashes it once. No shake, flash or shimmer when the screen should be calm | Every combo had the same gold ring and chip: five of a kind felt like a pair |
| **F2d** The readout waits for the dice | none | The tray says when the last die of a throw is down (`onSettled`, from each die's landing: the tumble's end or the throw's hand-over); the readout, its combo ring and the damage's breakdown wait for it, and a reroll keeps the roll before's readout up until the new dice land, instead of hiding it | With 5–6 dice the 50 ms stagger put the last die past the 750 ms step: the damage showed before the dice it came from, and blinked out on every reroll |
| **F7b** Picking a die | Game feel | A pick and an unpick click (`die.pick`, `die.unpick`) and buzz (`haptic('diePick')`, on the haptics' own switch), from a tap or the 1–6 keys; the lift is two steps over 60 ms, like a button press, instead of a 120 ms glide | A pick had no sound and a soft glide |
| **F8b** The last die lands heavy | Game feel | Whichever path threw it (the tumble, or the recorded throws), the last die of a throw thuds (`die.landHeavy`), squashes for two frames on its base, and buzzes (`haptic('diceLand')`, your dice only) | The throw ended on the same click as every bounce |
| **F8c** Anticipation (and F1d's auto-throw) | Game feel | Before your turn's own throw your dice wait in hand, face down; 150 ms in, the tray jitters two frames (`die.jitter`), and the throw comes at 250 ms instead of 400 ms. No jitter when calm | The throw came out of nowhere, and late |
| **F9a** LAST REROLL | Game feel | With one reroll left the button reads LAST REROLL (`ui.battle.lastReroll`) in gold, the picked dice jitter 1 px (not when calm), and that throw sounds `reroll.last` | "REROLL (1)" read like any other |
| **A7a** Shapes for die states | none | A picked die gets a ↻ tag on its top-left corner, a combo die gold corner brackets, on top of the red and gold rings (`Die.tsx`). On every die, the raids' and the Kitchen Sink's too | Red ring against gold ring was the only difference: colour alone |
| **P1a** Bigger dice on tall phones | none | A phone at least 740 px tall (and under 768 px wide) draws your dice up to 72 px instead of 54 | The tray left most of a tall phone empty |
| **P1b** Controls in the thumb zone | none | The readout is one line led by the damage, at 30 px; the room to spare sits above REROLL / ATTACK, so they stay right over the Bag row, and on a tall phone the tray comes down a little (up to 72 px). 360×640 fits as before | The buttons sat high on a tall phone, 195 px above the bottom row |
| **P1c** The foe's dice in the panel | Game feel | From the foe's "rolls…" line, its dice wait in the tray face down (through a burn or an item before its throw), then land there, a size up where the panel has room (¾ of yours, at least 40 px), the last one landing heavy. Read from the log (`turnInHand`), never decided by the screen | The tray was empty until the foe's dice came |
| **U1c** A clearer readout | none | No grey NO COMBO chip; the damage reads "26 DMG" (`ui.battle.dmg`); its title says tap, not click (`ui.battle.damageTitle`, all ten languages) | "NO COMBO · 5" read as a list of codes |

On `/kitchen-sink` → "Game feel, the dice and the readout" (`src/screens/kitchen/FeelDiceBits.tsx`), whatever the
switch says: a tray thrown at each tier with its count-up at full, short or off; the ↻ tag, the brackets and the four
rings; the squash, the jitter, dice in hand (yours and the foe's); the readout counting before its combo lands.

Not covered: the raids keep their own panel (`RaidView.tsx`): they have A7a, U1c and the bigger readout through the
shared components, but not yet F2d, the count-up or the heavy landing.

## 4. Rewards, catches and progress

<!-- WP3 -->

## 5. Taps, haptics and music

<!-- WP4 -->

## 6. Pop-ups and Home

<!-- WP5 -->

## 7. Accessibility and the shell

<!-- WP6 -->

## 8. Onboarding, menus and copy

<!-- WP7 -->

## 9. Setting it up

1. Deploy the client. The three switches are Off: nothing changes for anyone until the admin turns them on.
2. Run migration `supabase/migrations/0072_game_feel.sql` in the Supabase SQL editor (it adds the three switches' rows,
   Off, and bumps `configVersion`). `supabase/seed.sql` carries it too, inlined. Safe to run again.
3. Admin → Config: try **Game feel**, **Haptics** and **Battle music** On for admin first, then On for everyone.
4. The board also chose to turn the existing **Dice throws** On for everyone (F8a): Admin → Config → Dice throws.
