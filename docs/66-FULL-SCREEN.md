# Full screen

Status: **built** (2026-11-04) on `ccr-e18cb944-4xracb` (from `version/2_9_2`), in a pull request into
`version/2_9_2`. Ships **Off**.

## 1. What it does

- **Settings → Game → Full screen** (on / off): the browser's own full screen, the page over the whole screen — no
  address bar or tabs on a computer; on a phone no address bar, status bar or navigation bar either. It works in a
  browser tab and in the installed app, on phones, tablets and computers.
- **On by default in a phone's installed app** (Android, an iPad): until the player chooses, the installed game asks
  for full screen; a browser tab and a computer don't.
- **The choice is this device's**: kept in this browser (`pokedice.fullscreen`: `on` / `off`), not in the save, so a
  phone and a computer each keep their own.
- **An iPhone has no full screen for a page** (Safari offers it to videos only): the row isn't shown there. Its
  installed app already opens without Safari's bars (`apple-mobile-web-app-capable`).

## 2. How it works (`src/lib/screenFill.ts`)

- A browser lets a page go full screen only inside a tap or a key. Settings' switch is a tap, so it goes in (and out)
  at once. Otherwise — the installed app's default, a reload with the switch on — the game asks on the player's next
  tap or key (`keepFullScreen`, mounted once in `App`).
- **The browser letting it go**: a computer's player pressing Esc chose to leave, so the switch turns off with it (and
  the next click doesn't trap them back in). A phone drops full screen on its own (the app sent to the background, the
  back gesture): the wish stays and the next tap brings it back; Settings turns it off.
- The game's own "full-screen moments" (a battle, a hatching: `src/lib/fullscreen.ts`) are something else: they only
  move the game's own bars, and work as before either way.
- A phone in full screen can hold portrait (`lockPortrait` tries again on entering it, docs/15 §6).
- Not the manifest's `display: fullscreen`: the installed app's display is fixed at install and a page can't leave it,
  so the Settings switch couldn't turn it off there. The manifest keeps `standalone`.

## 3. The switch (docs/15 §20)

`fullScreen` (Admin → Config → Switches → Full screen): Off / On for admin / On for everyone, **Off by default**. Off,
there's no row in Settings and the game never asks for full screen (a page left in it goes out). A purely visual change
(§20): no rules pop-up and no INFO. Nothing the server acts on reads it: the switch only changes how the page fills the
device's screen.

## 4. Setting it up

1. Run `supabase/migrations/0141_full_screen.sql` in Supabase → SQL Editor (the switch's row, Off, and the content
   version + 1; safe to run again). `supabase/seed.sql` carries it, inlined.
2. Admin → Config → Switches → Full screen: On for admin to try it, then On for everyone. Save, then Publish.
