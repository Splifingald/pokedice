# Patch notes

Each file here is one update's notes. When the push that adds a note reaches `main`, GitHub Actions waits until the
live site serves that push, then posts the note to the Discord server's #patch-notes and pings Patch Notes Pings
(`.github/workflows/discord-patch-notes.yml`, docs/23-DISCORD-SERVER.md).

- **Name:** `YYYY-MM-DD-short-name.md`, e.g. `2026-10-20-version-2.md`. No spaces. The date is the release day.
- **First line:** `# Title`, the post's title, e.g. `# Version 2: raids, events and the Fortune Wheel`.
- **Then Markdown**, the way Discord writes it: paragraphs, `- lists`, `**bold**`, `*italic*`, `[links](https://…)`.
  `## Headings` become bold lines (Discord's embeds have no headings).
- **One picture**, optionally: a line with only `![](/area-art/a522.png)` (a path on the site, or a full URL). It shows
  under the text.
- Write it for players: what they will notice, not how it was built. English (the server's main language).

Long notes are fine: they're split across several embeds and, past Discord's 6 000 characters, several messages.

Check one before pushing: `pnpm discord:patch-notes patch-notes/2026-10-20-version-2.md --dry`.
Post one again: GitHub → Actions → **Discord patch notes** → **Run workflow**, with the file's path.

Files starting with `_` (like `_template.md`) and this README are never posted.
