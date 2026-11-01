# Patch notes

Each file here is one update's notes. When the push that adds a note reaches `main`, GitHub Actions waits until the
live site serves that push, then posts the note to the Discord server's #patch-notes and pings Patch Notes Pings,
and its French twin to #🥖-français (`.github/workflows/discord-patch-notes.yml`, docs/23-DISCORD-SERVER.md).

- **Name:** `YYYY-MM-DD-short-name.md`, e.g. `2026-10-20-version-2.md`. No spaces. The date is the release day.
- **First line:** `# Title`, the post's title, e.g. `# Version 2: raids, events and the Fortune Wheel`.
- **Then Markdown**, the way Discord writes it: paragraphs, `- lists`, `**bold**`, `*italic*`, `[links](https://…)`.
  `## Headings` become bold lines (Discord's embeds have no headings).
- **One picture**, optionally: a line with only `![](/area-art/a522.png)` (a path on the site, or a full URL). It shows
  under the text.
- **Or one video**: a line with only `![](/patch-notes/2026-11-01-version-2-8.mp4)`, a file in `public/patch-notes/`
  (MP4, under 10 MB, Discord's limit). It is sent with the post and plays under it, in both languages.
  `scripts/patch-clip.ts` records the game's own screens for one, frame by frame (its header says how).
- Write it for players: what they will notice, not how it was built. English (the server's main language).
- **Short** (the user's rule, 2026-11-01): the title, the 2 to 4 highlights as one-line bullets, then everything else in
  one `Also:` line (`·` between items, a few words each). No numbers, rules or how-tos the game itself explains. A
  feature switched on later that day may be among the highlights, said once ("Arriving later today:").
  The players' words only: no design terms (a "card", the "deck", a "round", a "switch"), what they see and do.
- **And in French:** every note has a twin, `YYYY-MM-DD-short-name.fr.md` (same name, `.fr` before `.md`, same
  format), written for French players ("tu", as the game speaks). The same run posts it to `#🥖-français`, without a
  ping. `pnpm test` fails on a note from version 2.8 on that has no twin.

Long notes are fine: they're split across several embeds and, past Discord's 6 000 characters, several messages.

Check one before pushing: `pnpm discord:patch-notes patch-notes/2026-10-20-version-2.md patch-notes/2026-10-20-version-2.fr.md --dry`.
Post one again: GitHub → Actions → **Discord patch notes** → **Run workflow**, with the file's path.

Files starting with `_` (like `_template.md`) and this README are never posted.
