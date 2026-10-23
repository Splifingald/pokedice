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
  (`src/lib/inert.ts`): every dialog is portalled to `<body>`, so what comes before the top one (the game, a dialog
  under it) sleeps, what opened after it stays live, and the toasts, now on `<body>` too (`data-stay-live`), stay
  readable. The rotate cover uses the same layers and holds everything.
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

<!-- WP7 -->

## 9. Setting it up

1. Deploy the client. The three switches are Off: nothing changes for anyone until the admin turns them on.
2. Run migration `supabase/migrations/0072_game_feel.sql` in the Supabase SQL editor (it adds the three switches' rows,
   Off, and bumps `configVersion`). `supabase/seed.sql` carries it too, inlined. Safe to run again.
3. Admin → Config: try **Game feel**, **Haptics** and **Battle music** On for admin first, then On for everyone.
4. The board also chose to turn the existing **Dice throws** On for everyone (F8a): Admin → Config → Dice throws.
