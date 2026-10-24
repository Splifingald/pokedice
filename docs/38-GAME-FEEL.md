# 38 · The game-feel pass

The changes chosen on the Fix Board after the October 2026 UX review: how the battle, the rewards and the menus look,
sound and feel on a phone, plus the accessibility and simplicity fixes that came with them. The review is
<https://claude.ai/artifact/9cZy7XnTtSkbYzYmMnXxt5>, the board <https://claude.ai/artifact/GmZWQ3rjg7RfmLLViyTEA4>.
Each item keeps its board id (F2a, U3a…), so a change can be traced to the decision behind it.

## 1. The switches

Three admin switches (Admin → Config), each **Off / On for admin / On for everyone, Off by default** (docs/15 §20):

| Switch | `config` key, helper | What it covers |
|---|---|---|
| **Game feel** | `gameFeel`, `gameFeelOn` | The juice: the damage count-up and combo tiers, hits that scale, the KO beat, faster turns, the victory payoff, the catch and progress moments, the extra taps and sounds, How to play's animated cards (§8b). Off: everything plays as before |
| **Haptics** | `haptics`, `hapticsOn` | Short vibrations (`src/lib/haptics.ts`), with a Settings switch. Android; iOS Safari can't vibrate, so an iPhone only feels the primary buttons' tap (§5) |
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

What a win, a catch and a purchase give back, and three bugs that muted them. The bug fixes have no switch; the rest
plays only with **Game feel** on, and with it off the cards look, sound and time as before.

| Id | What changed | Why |
|---|---|---|
| **B1** | `useCountUp(target, ms, start)` takes a starting value: the result card's gold counts up from 0 (`GoldCard`). The top bar and page heads pass none and keep counting from their last value | It started at its own total, so the count-up never ran |
| **B5** | A ball wobbles as many times as the engine says (`catchShakes` in `engine/catching.ts`, from the throw's total and need): a catch 3, a miss 3, 2, 1 or 0 as it fell 1, 2, 3 or 4+ short; after a Bait, up to 2 more by the same rule. The screens pass the roll to `catchTimeline` (`roll`); short motion still has none, a sure throw still jumps to its end, the Bait's hold and ground parts carry the count over. Trick or Treat's Trick Ball too. On `/kitchen-sink/fx`: "Catch: a miss N short" | A catch wobbled 3 times and a miss 2, so the third wobble gave the result away |
| **B6** | No `sfx('levelup')` on top of the evolution's, the gift's and the hatching's own fanfares (`Evolution.tsx`, `Gifts.tsx`, `DayCareScreen.tsx`) | Two jingles at once |
| **F5a** | `win.jingle` as the victory card rises, once the fight is over (not between a trainer's Pokémon) | A win had no sound of its own |
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

- **F7a, a press felt as the finger lands** (no switch). `PixelButton` played its blip on `click`, which a phone sends
  when the finger lifts, and a phone holds `:active` back a moment in case the touch is a scroll: a tap felt late.
  Now the blip (and on a primary button Android's haptic) plays on `pointerdown`, and the pressed look
  (`data-down`, drawn as `:active` in `pixel.css`) comes on at once; the release, a scroll (`pointercancel`) or the
  finger leaving takes it off. The action still waits for the click, so a press that turns into a scroll does
  nothing. One sound a press: a pointer's click has had it already (`detail` ≥ 1), a keyboard's (or code's) click has
  no pointer (`detail` 0) and plays it then. `shut`, `disabled` and `quiet` buttons stay silent, as before. The
  Underground's dig button played a second blip of its own: gone.
- **F7c, haptics** (the **Haptics** switch). Settings → Game gets **Vibration** (`settings.haptics`, unset = on) where
  the switch is on and the device can feel something; it works over a fight too (`SettingsOverlay`). Primary
  `PixelButton`s give `haptic('tap')` on Android. **iOS**: Safari has no `navigator.vibrate`, but it plays the system
  haptic when a native switch (`<input type="checkbox" switch>`, Safari 17.4+, felt from iOS 18) is toggled by a real
  tap; toggling it from code stopped working in iOS 26.5. So a primary button lays an invisible switch over itself
  (`HapticSwitch`, as `ios-haptics` 3.2 does) and the tap goes through it: the switch toggles (the haptic) and its
  click bubbles on to the button, which acts as ever. Only where the switch and the setting are on, on an iPhone or
  iPad whose Safari has the switch (feature-detected: `'switch' in HTMLInputElement.prototype`), and not when calm;
  never on a submit button (the tap would be the switch's click, and the form would not be sent), a shut or a disabled
  one. It is `aria-hidden` and out of the tab order, so the button keeps its name, its focus and its 44 px target; a
  scroll that starts on it still scrolls, and a drag puts the switch back. On an iPhone only the primary buttons can
  do this (dice, hits and catches can't be tapped through a switch), so Settings' line says so there. The test pad,
  a tile per cue, is on `/kitchen-sink`.
- **F7d, sounds on silent buttons** (no switch). The battle's Bag, the team pips (and the wide screens' team column),
  the history button (phones' and the desktop panel's) and Upgrades' buy play the button blip, as a `PixelButton`
  does.
- **F13b, battle music** (the **Battle music** switch). An original 8-bit loop (`src/audio/music.ts`: A minor, 150
  BPM, 16 bars, a 25 % pulse lead, a square arpeggio, a triangle bass, noise drums), synthesised on the effects'
  AudioContext: no file to fetch, nothing like a Pokémon tune. A timer wakes every 100 ms and books the next 300 ms of
  notes on the AudioContext's clock, so it keeps time with almost no CPU. `useBattleMusic(playing)` starts it, mounted
  with one line in `BattleView` (until the result card shows; a Versus fight's next foe carries on the same loop) and
  `RaidView` (until the result); it fades out (0.6 s) at the result card and when the fight's screen goes, pauses
  while the tab is hidden and picks up where it was. A fight started before any tap (resumed after a reload) waits
  for the first tap to open the audio. Silent with Sound off or Settings' **Battle music** off
  (`settings.music`); its own volume, Low / Medium / High (`settings.musicVolume`, unset = Medium), changes as it
  plays.
- **F12d, a cry on a poke** (the **Game feel** switch). Tapping a Pokémon on Home (it hops, with its card) also plays
  its cry, at most one every 2 s, and only with Sound on (`playCry` is silent otherwise).

The settings `haptics`, `music` and `musicVolume` travel in the save and on the device (`readSettings`, the save's
schema), so they survive a reload.

## 6. Pop-ups and Home

- **U2a · One pop-up queue.** The one-time pop-ups used to decide by themselves when to open: 18 files each copied a
  list of the pop-ups that went before them, every list a different subset, and GameLayout mounted 27 pop-ups and
  services side by side. Some stacked (the two "while you were away" reports, the General upgrades' rules and Prof.
  Oak's invite), some waited on each other in a circle of exceptions, and one never opened: the battle powers' rules
  waited on the gifts' and Trick or Treat's, which only clear at the first gift or the first ghost, so with either
  switched on the Mega, Gigantamax and Z-Move rules never showed (the board's B3). Now the engine decides
  (`nextOneTimePopup(save, data, ctx)` in `src/engine/popups.ts`, tested in `tests/engine/popups.test.ts`): the one
  pop-up due now, or none, in one order. `ctx` carries what the engine can't know: whether it's calm (between fights,
  `run.phase === 'idle'`, no battle, no full-screen moment, no gift being opened), the page, signed in, the server's
  clock, Prof. Oak's invite seen on this device, and what waits outside the save (the away reports, the developer's
  answers, friends' raid gifts, an invite reward, push's question). `PopupQueue` (in GameLayout, around the pages too)
  works the turn out once, `OneTimePopups` mounts every pop-up, and each opens only on its own turn
  (`src/components/popupTurn.ts`); the one on screen keeps its turn while it's due, so one that arrives later (raid
  gifts collected on coming back to the tab) can't snatch the screen. The order keeps the old one wherever it was
  consistent: the away reports (Extreme's, then the General upgrades'), the Day Care tutorial, the leaderboard tip, the
  developer's answers, friends' raid gifts, Support me, a new region's offer, a special event, Versus, Prof. Oak's
  invite, Extreme mode, Trades, the General upgrades, the invite rewards' rules, a reward ready, the portal run, day
  and night, the battle powers, a small world's opening, its finish, its goodbye, a live event (the Underground's rules
  too), a taken trade's scene, push's question. Day and night now comes before the powers (neither waited for the
  other). Each pop-up keeps the pages it never opens on (the Day Care's tutorial off `/daycare`, an event's off
  `/events`, Versus's off `/versus`, Extreme's off Settings, Trades' off `/trades`, the General upgrades' off
  `/upgrades`, the invite rewards' off `/friends`, the portal's off `/area`, a world's and a live event's off the Mart,
  the region offer and the trade scene on Home only); there, the next one due takes the turn. The rules that open at
  their own moment stay where they are and hold nothing back: the gifts' before the first gift, Trick or Treat's at
  the first ghost, the portal's and the nightmare's on their way in, the looks' at the first open, a world's finish and
  a live event asked for from Home. Every "seen" flag is the one the save already had: no migration. A shared trade or
  friend link, the trades' toasts and push's question now also wait for the queue to be empty.
- **U2b · A closable leaderboard tip.** Prof. Oak's leaderboard tip (`LeaderboardTutorial`) was a pop-up with no way
  out but its one button, which left the page. It now has Later and ✕ beside SEE THE LEADERBOARD; both end it for good,
  as the Day Care tutorial's Later does: saved (`leaderboardVisited`, the flag the first visit already set), so it
  syncs. It's a tip, not a choice the player must make.
- **U3a · Squares only for what's open.** On a brand-new game's first Home, three of the four squares were locked or
  empty (the next secret at Lv.5/70, the Day Care at 1/20 caught, Versus at 0/3 at Lv.50, the special events "Coming
  later"), and each answered a tap differently (the areas list, a toast, the Versus page, nothing). Home now shows a
  square only for what can be used: a secret area found and never played (one tap travels there: `featuredSecret`'s
  fresh one), the Day Care once open (`isDayCareOpen`), Versus once open (`versusUnlocked`), each open special event
  (`activeEvents`), a small world and a live event. Under them one line names the next thing to open and how close the
  player is: "Coming up: Day Care · 7/20 caught" (`ComingUpView`, from `comingUp` in `src/engine/comingUp.ts`, tested
  in `tests/engine/coming-up.test.ts`), in the order things usually open: the Day Care, the special events (from the
  teaser's 3rd Kanto badge, "clear {area}"), Versus ("1/3 at Lv.50"), then the secret area closest to opening (its
  condition still to meet, as the locked square counted it). A secret area still to find is a goal rather than a
  feature, so it folds into the line instead of keeping a square. The events' "Coming later" placeholder is gone.
- **U4a · CONTINUE becomes GO TO.** Behind in the region, Home showed a red CONTINUE that replayed a cleared area
  ("Cleared · free play") above a green GO TO {area} that moved the story on: the main button was the wrong one. Now,
  when the player is behind (`latestOpenArea`) and nothing of its own waits where they stand (a cleared area's free
  play), the big red button itself reads **GO TO {area}** and travels there, its second line saying what waits there
  (the round, the gym leader, the legend); **Stay here**, a 44 px link under it, keeps today's free play. With
  something else here (a gym, a legend, a raid, a secret area's rounds, a portal or the nightmare, or a closed or
  sealed area, whose shut CONTINUE says why), CONTINUE stays, with the green GO TO under it. The victory card's forward button follows the same idea.
- **U5a · One red GO in the Areas sheet.** Every area card's GO was red (five in view at once). Now only the GO of the
  area Home's big button leads to is red (the one being played, or the one the story goes on in when behind); the
  others are navy (`frame-dark`). In the Regions view the new region's button is the red one while a region is on
  offer, else the region being played's GO.

On `/kitchen-sink`: Home's section (`HomeBits`): the Coming up line for each thing still to open, the big button
(CONTINUE, a challenge, greyed out, GO TO with Stay here), the leaderboard tip.

## 7. Accessibility and the shell

Fixes to the shell every screen sits in: no switch, no rules pop-up. The rules themselves are in docs/15 (§2, §5–§8,
§11).

- **A3a Tablets play sideways.** A tablet held sideways used to wait behind "Turn your device" like a phone, though it
  has a small computer's room. Now only a phone is covered: `useSideways()` (`src/lib/orientation.ts`) asks for a
  mobile device held sideways whose screen is under 600 CSS px on its short side (`isTabletScreen`: Android's own
  phone/tablet line; the biggest phones are 430, the smallest tablets 600–744). A tablet sideways gets the existing wide
  layout (side nav from 768 px, columns from 1024 px), and `lockPortrait` no longer asks the browser to lock it.
  Computers are unaffected. The cover's line now says "hold your phone in portrait". **Trade-off:** the manifest's
  `orientation: portrait` can't be split per device, and it is what keeps an installed phone upright on Android, so it
  stays: an Android tablet with the game *installed* stays upright as before (iOS ignores the manifest's orientation,
  so an installed iPad turns). `e2e/rotate.spec.ts` checks the phone, an iPad sideways and a computer.
- **A4c Calm Game Corner reels.** The reels swapped symbols every 90 ms (about 11 a second) while they turned, a flicker
  the OS's reduced motion asks to avoid. Under calm (`useMotion().calm`) each turning reel now waits, still, on a "?"
  and the three stop in turn on the engine's symbols at the same times as before (three steps, with their sound); with
  animations off the result shows at once, as before. The engine still draws every result.
- **A8a Toasts by length.** Every toast went after 3.2 s whatever its length, and toasts are often the only word on why
  a control is shut. Now a toast stays `max(4 s, 1.2 s + 70 ms a character)` (`toastMs` in `src/store/game.ts`; a
  caller's longer `ms` still wins), its countdown waits while a finger, the pointer or the focus is on it (`holdToast`),
  and an error (`bad`) stays until its ✕ (44 px, `ToastCard`). `tests/toast-timing.test.ts`.
- **A9a Titles and focus per page.** The tab always said "Pokédice" and a move left the focus on `<body>`, so a screen
  reader didn't say where it had arrived. `usePageMeta` (`src/lib/pageMeta.ts`, one line in `App.tsx`) sets
  "Team · Pokédice" in the player's language (the area's name on `/area`, "Battle" in a fight, "Home" on Home), and
  after a move inside the game puts the focus on the new page's `<h1>` (`tabIndex=-1`, no ring for a tap or a click),
  unless a dialog or a field has it already. The first load leaves the focus alone.
- **A9b The page sleeps behind a dialog.** `aria-modal` and the Tab trap kept a keyboard in a dialog, but TalkBack's
  and VoiceOver's swipe could walk out of it into the page. `useDialog` now makes the page behind `inert`
  (`src/lib/inert.ts`): every dialog is portalled to `<body>`, so what comes before the top one (the game) and every
  other dialog sleep, what opened after it that isn't a dialog stays live, and the toasts, now on `<body>` too
  (`data-stay-live`), stay readable. The top dialog is the one drawn on top (the highest z-index, then the latest), and
  it answers Esc and Tab: a pop-up that opens under the partner lab waits under it instead of taking the keyboard. The
  rotate cover uses the same layers and holds everything.
- **A9d The theme follows the device for new players.** A fresh install now starts on Auto (`DEFAULT_SETTINGS`), and
  `index.html` paints a first visit in the device's theme so a dark phone never flashes light. Stored settings without
  a theme stay Light: nobody who already plays sees the look change under them.
- **U9a Offline, said.** With no connection the social screens said "Couldn't load… Try again later", which can't help.
  `useOnline` / `offlineOr` (`src/lib/online.ts`) make Friends, Trades, the leaderboard, Versus, My messages and the
  sign-in and sync toasts say "You're offline. Check your connection." instead; signing in or linking an account
  doesn't leave for a provider's page that can't load. Nothing else changes.
- **U9b A pixel loading state.** The pages split out of the main bundle (the guide, the admin…) showed a plain
  "Loading…". `PageLoading` shows a Poké Ball drawn in code wobbling in pixel steps (still under calm), the words kept
  for screen readers (`role="status"`).

Strings: `ui.common.offline`, `ui.page.title`, `ui.page.battle`; `ui.rotate.text` now speaks of phones only. On
`/kitchen-sink`: the loading ball (wobbling, still) and each toast (info, good, long, an error with its ✕).
`e2e/shell.spec.ts` covers the titles and focus, the inert page, the error toast and the offline leaderboard.

## 8. Onboarding, menus and copy

No switch for any of these: they change screens and words already there (docs/15 §20).

- **U1b Type hints on early.** A new player needs the matchups most, and they were off until found in the type chart.
  `settings.typeHints` unset now means **on until the first badge** (`typeHintsOn` in `src/save/storage.ts`, read by
  `useTypeHints` in `src/store/hooks.ts`, which counts `badgesHeld` only while it is unset); a choice made in Settings
  or the type chart always wins. `readSettings` keeps it unset instead of turning it into `false`. The switch is in
  Settings → Game ("Type hints", saying it is on until the first badge), and the type chart keeps the same one. The
  Pokémon sheet and the lead picker read the hook. A browser that stored `false` before this (any settings change
  wrote it) keeps hints off: it can't be told from a choice.
- **U1f Default name.** "Select your character" fills the name in with the character's own, as each language's games
  have it (`trainerName.red` / `trainerName.leaf`: Red, Rojo, Rot, Rosso, レッド…; Leaf, Hoja, リーフ…), so NEXT works at
  once without a phone's keyboard. Picking the other character changes it while the player hasn't typed one (or has
  emptied the field); what they type stays theirs. Renaming from the trainer card starts from the name already held.
- **P2a Dialogue at the bottom.** Prof. Oak's intro had everything in the top half of a phone. Now it is the Game Boy's
  layout: Oak in the room, the text box with SKIP INTRO and NEXT anchored to the bottom (`100dvh`, the home indicator's
  safe area kept), from 360×640 up.
- **P2b Lab card at the bottom.** In the professor's lab the picture stays on top, and the message box, the starter's
  card (Hits hard, Weak to, Dice, NOT THIS ONE / PICK) and Let's go! sit at the bottom of the screen, under the thumb.
- **B7 Intro matches the controls.** `ui.newGame.intro3` said "keep the dice you like, reroll the rest" while the game
  has you tap the dice to throw again: "Throw, tap the dice you want to throw again… then ATTACK. Pairs, straights and
  full houses add bonus damage.", in all ten languages.
- **B8 No more "Map".** Home replaced the Map: `ui.victory.secretOnMap` ("… is now in your Areas list"),
  `ui.victory.nextOpen` ("… is now open in your Areas list"), `ui.help.explore9` (Home's Areas list) and
  `ui.help.goalRegions` (switch back from Regions, in Home's Areas list), in all ten languages. Their keys keep their
  names. `ui.nav.map` and `ui.area.backToMap` are no longer used anywhere.
- **B10 No developer link on the title.** "Deployment guide" shows on the title only in dev or for the admin
  (`useIsAdmin`). Settings' legal line keeps its link to it.
- **B11 Docs match the game.** README: help and the type chart are in the trainer menu (there is no `?` in the top bar)
  and Versus is Home's widget; docs/15 §17: the menu's rows as they are (no Versus row).
- **U5c Cleaner encounter preview.** A team of one has nothing to pick: no "Send out" (`LeadPicker` draws nothing, and
  the preview leaves its frame out). The picked card's button is a white ✓ SENT OUT (`ui.lead.sentOut`), no longer a red
  SWITCH beside the red FIGHT. The name has a line of its own under the mini and level, a size smaller on a phone when
  long (more than nine letters, a CJK character counting two) and wrapping rather than cut: "Bulbasaur", "Charmander"
  in full at 360 px.
- **U5d SUPPORT ME not red.** Settings' SUPPORT ME is white, as it already was over a fight: red is for the game's own
  actions.
- **U6b Inbox row.** The trainer menu has an **Inbox** row (the envelope; Contact the developer now has the pencil)
  opening My messages on its own (`InboxModal`), with a gold count of answers not seen and gifts not opened, the count
  Contact's tab shows. Contact the developer keeps its My messages tab.
- **U8b One Disconnect, one Delete.** Settings had two Disconnects (Cloud backup's and one at the bottom) and three
  Deletes (Delete save under Save file → Advanced, Delete my Extreme save in Extreme mode, Delete all my data at the
  bottom). Now Disconnect is only Cloud backup's, beside who is signed in, and the bottom has one red **Delete a save or
  my data** that asks what goes (`DeleteChooser`: Delete save while there is one, Delete my Extreme save while one
  exists, Delete all my data; each a white row with red words and what it takes). Each then asks as before: the save
  one pop-up, the Extreme save and everything two in a row (`e2e/delete-data.spec.ts`, `e2e/extreme.spec.ts`). Under
  a lock (mid-fight, a portal run) the one Delete is shut with the reason.

Every new piece (`DeleteChooser` in each set of choices, `InboxModal`, the default name, the single lead picker) is on
`/kitchen-sink` (`OnboardingBits`).

## 8b. How to play, animated

The user's request (2026-10-24): "How to play menu is plain text: Instead it should usually be animated images … that
show how the game works. Keep it simple and start with the basic: throw dice, reroll, deal damage, catch." With **Game
feel** on, the guide (`HelpContent`: `/help` and the trainer menu's How to play) opens on four small animated cards
under "The basics"; the text, which carries the numbers, follows as it was under "All the rules" (its sections a
heading level down). Off, the guide is exactly the text it was. A purely visual change: no rules pop-up, no INFO.

| Card | What plays (one loop) |
|---|---|
| Throw the dice | The tray clears; the Pokémon's dice are thrown in (`Die` with a new `rollKey`: the tumble, or the recorded throw with Dice throws on) and land on their faces; each one's type badge shows under it, one by one. 4.6 s |
| Reroll | A pixel finger (`tap` icon) taps one die, which lifts with its ↻ tag; it taps REROLL (pressed, `REROLL (3)` → `(2)`); that die alone is thrown again and lands on the first one's number: the pair's gold ring and brackets, the "Pair +2" chip. 4.8 s |
| Deal damage | The battle's count-up (`planScore`, at half speed): "+5", "+5", "+3" pop over the dice, the pair lands, "0 DMG" counts to "15 DMG"; the finger presses ATTACK; the foe flashes white twice, shakes 2 px, its number rises over it and its HP bar drains (`FoePlate`, `HpBar`). 5.5 s |
| Catch | A Poké Ball (`PixelIcon` `ball`) flies in a stepped arc, spinning a quarter turn a step, at the greyed, worn-out foe; the foe turns white and goes into it; the drop and a bounce; three wobbles in pixel steps; the click: stars, "Gotcha!", and the catch die with the ball's bonus ("2 +1 = 3 ≥ 3"). 6.1 s |

- **Real pieces**: `Die` (ring, tier, ↻ tag), the battle's REROLL / ATTACK row as pictures (`ButtonLook` in
  `PixelButton.tsx`: the same frame, label fit and pressed look in a span, so a scene has nothing to focus), the combo
  `Chip` with `ui.battle.comboChip`, the readout's "N DMG", the foe's `FoePlate`, `MiniSprite` menu icons (the atlas
  already loaded: no new request), the `.score-pop` of the count-up. Nothing new to download.
- **Numbers from the engine** (`makeDemo`, `src/screens/help/howTo.ts`): Charmeleon Lv.16 with its own dice
  (`makeBattler`: two fire and a Base) against a Machop Lv.6; a made-up throw of 5, 2, 3, the reroll's 5; the damage is
  `computeDamage`'s (today 5 + 5 + 3 and the Pair's level-1 bonus, 2: 15), its count-up `planScore`'s, the foe's HP
  `makeBattler`'s, the catch die the lowest that catches it with a Poké Ball (`catchValueOf`, `ballBonus`). Change the
  config and the cards follow; nothing is hard-coded but the throw.
- **Motion** (`useMotion`): a clock in 50 ms steps (`clockStep`), so pixel motion steps. Full (and the player's Short):
  each card loops, resting 1.4 s on its last frame. Calm (the OS's reduced motion): no autoplay; each card is a still of
  its key moment (the landed dice; the picked die, the finger on REROLL; the count done, the finger on ATTACK; the ball
  in flight) with a **PLAY** button (44 px) that plays it once and stays on its end. Animations off: PLAY shows the end
  at once. A loop sleeps while its card is off screen (`IntersectionObserver`) and while the tab is hidden. The hit's
  two white frames are 400 ms apart (`whiteAt`: never more than 3 flashes a second); the foe's shake is left out when
  calm.
- **No sound**: it's reading material. The dice are thrown quietly (`DiceLab.quiet`: no bounce clicks); PLAY has the
  button's own blip, nothing more.
- **Accessibility**: each card is a `figure` with a `figcaption` (an `h3` title, one line); the scene is a `role="img"`
  labelled "Animation: …" (its drawing `aria-hidden`); PLAY is named "Play the animation: {title}". Text in the
  scenes is ink on paper, the "+N" gold and the hit's number white, both outlined in ink; axe is clean in both themes.
  One column on phones, 2 × 2 from 1024 px; the 280 px stage fits a 360 px phone and the trainer menu's pop-up.
- **Strings**: `ui.help.howBasics`, `howRules`, `howThrow`, `howThrowText`, `howThrowAlt`, `howReroll`,
  `howRerollText`, `howRerollAlt`, `howHit`, `howHitText`, `howHitAlt`, `howCatch`, `howCatchText`, `howCatchAlt`,
  `howPlay`, `howPlayLabel`; reused: `ui.battle.reroll`, `ui.battle.attack`, `ui.battle.dmg`, `ui.battle.comboChip`,
  `ui.victory.gotcha`.
- **Where to see it**: `/kitchen-sink` → "How to play, animated" (`HowToBits`: playing, the stills with PLAY, PLAY to
  the end, the button pictures up and pressed). Tests: `tests/how-to-play.test.ts` (the fight is the engine's, the
  clock, the flash rule), `e2e/how-to-play.spec.ts` (360×640 and 390×844, reduced motion, animations off, axe in both
  themes, the trainer menu, the switch off). No migration: it rides the Game feel switch of §1.

## 9. Setting it up

1. Deploy the client. The three switches are Off: nothing changes for anyone until the admin turns them on.
2. Run migration `supabase/migrations/0072_game_feel.sql` in the Supabase SQL editor
   (<https://github.com/Splifingald/pokedice/blob/ccr-0d03596c-nyhjr3/supabase/migrations/0072_game_feel.sql>): it adds
   the three switches' rows, Off, and bumps `configVersion`. `supabase/seed.sql` carries it too, inlined. Safe to run
   again.
3. Admin → Config: try **Game feel**, **Haptics** and **Battle music** On for admin first, then On for everyone.
4. The board also chose to turn the existing **Dice throws** On for everyone (F8a): Admin → Config → Dice throws.
