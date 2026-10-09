# Pokédice — notes for Claude

- **UI work follows `docs/15-UI-GUIDELINES.md`** (Johto Daybreak): tokens, type, frames, components, layout,
  accessibility, motion levels, sound, strings and web requests. Read it before changing any screen; update it when a
  rule changes. Every new component goes on `/kitchen-sink` in every state.
- The engine (`src/engine`) is pure (no React, store, DOM or fetch; eslint enforces it) and decides every rule and
  number. The UI presents the battle state and its log; it never decides an outcome.
- Text lives only in `src/i18n/strings.csv`, all ten languages filled; run `pnpm i18n:fonts` after editing a CJK column.
- pnpm; Prettier style for new code (no semicolons, single quotes, width 110); `@/` imports; comments say why. Don't
  reformat whole files that aren't Prettier-clean yet.
- Before a commit: `pnpm lint && pnpm build && pnpm test && pnpm e2e`, all green.
- Never push to `main`.
