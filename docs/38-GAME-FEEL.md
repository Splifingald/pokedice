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

<!-- WP3 -->

## 5. Taps, haptics and music

<!-- WP4 -->

## 6. Pop-ups and Home

<!-- WP5 -->

## 7. Accessibility and the shell

<!-- WP6 -->

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

## 9. Setting it up

1. Deploy the client. The three switches are Off: nothing changes for anyone until the admin turns them on.
2. Run migration `supabase/migrations/0072_game_feel.sql` in the Supabase SQL editor (it adds the three switches' rows,
   Off, and bumps `configVersion`). `supabase/seed.sql` carries it too, inlined. Safe to run again.
3. Admin → Config: try **Game feel**, **Haptics** and **Battle music** On for admin first, then On for everyone.
4. The board also chose to turn the existing **Dice throws** On for everyone (F8a): Admin → Config → Dice throws.
