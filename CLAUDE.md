# Pokédice — notes for Claude

- **UI work follows `docs/15-UI-GUIDELINES.md`** (Johto Daybreak): tokens, type, frames, components, layout,
  accessibility, motion levels, sound, strings and web requests. Read it before changing any screen; update it when a
  rule changes. Every new component goes on `/kitchen-sink` in every state.
- **Every new feature** gets the admin's Off / On for admin / On for everyone switch (Off by default, checked by the
  server too) and its rules pop-up once plus an INFO button: `docs/15-UI-GUIDELINES.md` §20.
- The engine (`src/engine`) is pure (no React, store, DOM or fetch; eslint enforces it) and decides every rule and
  number. The UI presents the battle state and its log; it never decides an outcome.
- Text lives only in `src/i18n/strings.csv`, all ten languages filled; run `pnpm i18n:fonts` after editing a CJK column.
- pnpm; Prettier style for new code (no semicolons, single quotes, width 110); `@/` imports; comments say why. Don't
  reformat whole files that aren't Prettier-clean yet.
- Before a commit: `pnpm lint && pnpm build && pnpm test`, all green, plus the e2e specs of what changed
  (`pnpm e2e <spec>`). The full `pnpm e2e` runs only before pushing to `main`.
- Never push to `main`.
