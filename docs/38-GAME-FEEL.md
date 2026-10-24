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

A turn took ~10.5 s at full motion, and every hit landed alike: a resisted 1 shook the stage like a ×2 60, and 1.7–2.6 s
of each move played after the HP had already drained. The hits now weigh what the log says, the scenes hand the stage
back once they have done their work, and a K.O. is a beat of its own. The engine still decides everything: the stage
reads the log's numbers (`hitPower`), it never changes one.

| Board id | Switch | What changed | Why |
|---|---|---|---|
| **F1a** Trim scene tails | Game feel | Each attack scene (the typed moves, the generic hit, a Z-Move's strike) has a `settle` cue half a second after its last hit and that hit's stop (`SETTLE`, `felt()` in `src/fx/timelines/attacks.ts`). The log moves on there; the page's sprites come back; the canvas stays over them (`BattleStage`'s `linger`, pointer-transparent) drawing only the particles already flying, nothing new spawning, until the scene's own end, the next scene or an overlay replaces it. Moves settle at 1.1 s (the generic hit) to 3.0 s (Ice Beam's shatter), 2.2 s on average, where they ended at 3.2–4.4 s. The late status flourishes inside a few moves (Flamethrower's burn mark, Psychic's stars) go with the tail: the status step that follows shows its icon on the page's sprite | The HP drained at contact, then the player watched smoke for two seconds |
| **F1d** (the foe's part) | Game feel | The foe's pause on each reroll 700 → 450 ms (`FOE_REROLL_FEEL_MS`), its AI timer 450 → 250 ms (`BattleView`) | The foe's turn is watched, not played |
| **F3a** Hit power | Game feel | `hitPower` (`src/engine/hitPower.ts`, pure): tier 0 resisted, 1 plain, 2 strong, 3 huge — a point each for super effective, a combo of tier 3+ (`comboTier`), a hit taking half the target's max HP; half a point for a tier-2 combo or a quarter of the HP; a resisted hit stays tier 0 unless it is the K.O., which is never under 2. Its scale `k` (0.6 / 1 / 1.3 / 1.6) goes to the scene (`Fighters.power`): `Stage.hit` scales every hit as a Z-Move's does — hit-stop × k (a big one at most the house rule's five frames, never shorter than drawn), sprite and screen shake × k, a resisted hit's look a quarter shorter — and the stage's particles from the first hit on are thinned or thickened by `Particles.density` (jittered copies, their own random stream, so density 1 draws exactly as before) | A resisted 1 played like a ×2 60 |
| **F3b** Effectiveness on contact | Game feel | At contact: `feelSound('hit.super')` (super effective) or `'hit.resisted'`; the stage's number gold at 2× when super effective, grey at 1× when resisted; a resisted hit's impact short (F3a). The SUPER EFFECTIVE / not very effective / no effect banner stamps down in three held steps (1.8 → 1.4 → 1×), then goes, instead of swelling in | The best moment of a turn was silent and looked like any other |
| **F3c** Bigger stage number | Game feel | The in-scene damage number at 2× (14 art px, ~22–24 CSS px on a phone) with a two-pixel ink outline, white for a plain hit (`pop(…, size)`, `damagePop`) | 12 CSS px of yellow didn't read on a bright sky |
| **F4a** Final-blow beat | Game feel | The K.O.'s last hit holds the whole scene still for 0.25 s (`BOSS_STOP`) on its impact frame — the target a white silhouette, the burst just out; nothing steps and no full-screen flash is held on (`withoutFlashes`); a `ko` cue there plays `feelSound('hit.ko')` and `haptic('ko')`. A freeze isn't a flash or a shake, so it stays under a calm OS. The fainting Pokémon's cry plays at 0.75× (`playCry(dex, { rate })`, its pitch dropping with it), and its sprite sinks through its platform in four steps over 0.4 s (`clipPath` cutting its bottom away as it goes down, `steps(4)`) instead of fading. Motion off: no scene, so the K.O.'s sound and vibration come with the hit | Sakurai's "boss stop": the end of a fight should land |
| **F4b** K.O.-to-catch sting | Game feel | `feelSound('ko.sting')` when a K.O. leaves a wild or legendary Pokémon worn out for the catch | Silence where the best news of the fight arrives |
| **F10b** Shiny entrance | Game feel | A shiny foe lands on its platform in the hatching's sparkle: two rings of stars a beat apart, each with a dithered ring spreading out, a few twinkles, and `feelSound('shiny.chime')` (`src/fx/timelines/shiny.ts`, on a clear canvas over the page's sprite, once per Pokémon) | A 12 px star on the plate was all a shiny got |
| **B2** Step sounds with scenes | none (a bug) | A hit's sound plays at its scene's contact: the log's `'super'` / `'hit'` without the pass, F3b's with it (`landHit`, `Scene.hit`). It only played on the no-scene path, so at full and short motion the super-effective sting was never heard | |
| Haptics | Haptics | `haptic('hit1' / 'hit2' / 'hit3')` at contact by tier (0 and 1 are `hit1`), `haptic('ko')` on the final blow (at contact without the game-feel pass) | |

A turn measured at full motion on a phone-sized page, from ATTACK until the next roll is on the tray (a Lv.5 starter
against a wild Rattata, both sides attacking, no K.O.): **11.3 s** with the pass off (11.5, 10.9, 11.6), **6.9 s**
with it on (7.1, 7.0, 6.5). What remains is mostly the dice: each side's roll (750 ms), your auto-throw (400 ms) and
the foe's line (350 ms).

Where to see them: the kitchen sink's "Game feel, hits" section (the stage with the pass on: a shiny's entrance, a hit of
each weight and its settle, the K.O.'s stop and drop); `/kitchen-sink/fx` (Hit power, Battle's settle, the shiny
entrance, the `settle` and `ko` cues in the log).

## 3. Battle: the dice and the readout

<!-- WP2 -->

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
