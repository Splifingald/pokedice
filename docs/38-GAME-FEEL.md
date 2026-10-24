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

<!-- WP1 -->

## 3. Battle: the dice and the readout

<!-- WP2 -->

## 4. Rewards, catches and progress

<!-- WP3 -->

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
