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

<!-- WP4 -->

## 6. Pop-ups and Home

<!-- WP5 -->

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

## 9. Setting it up

1. Deploy the client. The three switches are Off: nothing changes for anyone until the admin turns them on.
2. Run migration `supabase/migrations/0072_game_feel.sql` in the Supabase SQL editor (it adds the three switches' rows,
   Off, and bumps `configVersion`). `supabase/seed.sql` carries it too, inlined. Safe to run again.
3. Admin → Config: try **Game feel**, **Haptics** and **Battle music** On for admin first, then On for everyone.
4. The board also chose to turn the existing **Dice throws** On for everyone (F8a): Admin → Config → Dice throws.
