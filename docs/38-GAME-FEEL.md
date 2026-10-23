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

<!-- WP2 -->

## 4. Rewards, catches and progress

What a win, a catch and a purchase give back, and three bugs that muted them. The bug fixes have no switch; the rest
plays only with **Game feel** on, and with it off the cards look, sound and time as before.

| Id | What changed | Why |
|---|---|---|
| **B1** | `useCountUp(target, ms, start)` takes a starting value: the result card's gold counts up from 0 (`GoldCard`). The top bar and page heads pass none and keep counting from their last value | It started at its own total, so the count-up never ran |
| **B5** | A ball wobbles as many times as the engine says (`catchShakes` in `engine/catching.ts`, from the throw's total and need): a catch 3, a miss 3, 2, 1 or 0 as it fell 1, 2, 3 or 4+ short; after a Bait, up to 2 more by the same rule. The screens pass the roll to `catchTimeline` (`roll`); short motion still has none, a sure throw still jumps to its end, the Bait's hold and ground parts carry the count over. Trick or Treat's Trick Ball too. On `/kitchen-sink/fx`: "Catch: a miss N short" | A catch wobbled 3 times and a miss 2, so the third wobble gave the result away |
| **B6** | No `sfx('levelup')` on top of the evolution's, the gift's and the hatching's own fanfares (`Evolution.tsx`, `Gifts.tsx`, `DayCareScreen.tsx`) | Two jingles at once |
| **F5a** | `win.jingle` as the victory card rises | A win had no sound of its own |
| **F5b** | The gold's count-up ticks (`coin.tick`, every 50 ms at most), the till (`sfx('gold')`) when it lands | The payoff heard as well as seen |
| **F5c** | Each Pokémon's XP bar fills from where it stood before the fight — the engine's `xp` event now carries `from` (its level and XP before the award) — in 50 ms steps (`xpFillFrames` in `src/lib/xpFill.ts`: a full bar in 8, a part in its share), a rising `xp.tick`; a level-up fills the bar, two white frames (none when calm), `level.roll`, `haptic('reward')`, then the next level from empty; the row's level, its Lv. chip, its milestones, the sprite's hop and the confetti wait for that roll (their room kept). More than 3 level-ups at once land together; animations off, the end state | The bar sat at its final width: a level-up was a chip, not a moment |
| **F5d** | Badges and the League's members play `badge.fanfare`, the Champion `champion.fanfare`, an area cleared `area.fanfare` (and an Elite Rebattle medal `badge.fanfare`), in place of the level-up's sound | The biggest moments sounded like every level-up |
| **F5e** | `Confetti` on the pixel grid: 2 × 2 art-pixel squares on the 2 px grid, 12 frames a second, each piece stepping through a fixed ramp (white, yellow, gold, red, deep red) and dropping out on a frame of its own; no rotation, no fade. Also the Wheel's | Smoothly spinning squares were the one thing on screen not drawn in pixels |
| **F5f** | Once counted, a few coins (`CoinFlight`) fly in 50 ms steps along an arc from the gold line into the top bar's gold (`data-hud-gold` on `Hud`'s gold button), one tick as each lands, the counter's bump (`bumpGold`) after the last. Not under calm, not with animations off, not when the counter is off screen. XP doesn't fly: the top bar has no XP to land in, and the bar fills in place | The reward goes somewhere you can see |
| **F10a** | A species' first catch adds a "Registered in the Pokédex!" card (`DexRegisteredCard`: the Pokédex icon, its number and name, its sprite) right under its catch card, with `dex.registered` | As in the main games: a new entry is an event, it was a quiet NEW |
| **F11a** | `defeat.jingle` as the wipe card rises (areas and rebattles) | A loss had no sound either |
| **F12a** | Buying an upgrade: `upgrade.pop` (in place of the level-up's sound), the new pip fills in 3 steps of 60 ms, one white frame (none when calm), and the new bonus as the engine words it ("+4 damage", the toast's) rises 2 px a frame over the track and goes; animations off, the toast alone | A purchase changed a number quietly |
| **U4b** | The victory card has one way forward: CONTINUE, or **GO TO NEW AREA** in its place when the fight cleared the area and opened the story's way forward (the area `latestOpenArea` points to, as Home's CONTINUE does), red; HOME the quiet white one beside it (a third of the row), the round gauge over both. A portal run still has CONTINUE alone | Three buttons (a green GO TO over HOME and a red CONTINUE) asked the player to choose where one would do |
| **U5b** | Upgrades' buy buttons are navy (`frame-dark`); the list's **best buy** — the cheapest upgrade within your gold, the first listed on a tie (`bestBuy` in `src/lib/upgrades.ts`, on the engine's costs) — is gold, with a "Best buy" chip by its level so it isn't colour alone | Every row's red button made the screen all main actions; the cheapest is the quickest step up |

The haptics: `haptic('wobble')` with each wobble and `haptic('catch')` with the Gotcha, from the catch timeline's cues
(never all at once when a timeline is skipped to its end). The board's "Pidgey was defeated!" after a catch, behind
the card, was marked Don't do and stays.

New strings: `ui.victory.dexRegistered`, `ui.upgrades.bestBuy`. On `/kitchen-sink`: "Rewards' game feel".

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
