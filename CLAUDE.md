# Pokédice — notes for Claude

- **UI work follows `docs/15-UI-GUIDELINES.md`** (Johto Daybreak): tokens, type, frames, components, layout,
  accessibility, motion levels, sound, strings and web requests. Read it before changing any screen; update it when a
  rule changes. Every new component goes on `/kitchen-sink` in every state.
- **Every new feature** gets the admin's Off / On for admin / On for everyone switch (Off by default, checked by the
  server too) and its rules once plus an INFO button: a `RulesCard` at the top of its page the first time it opens (a
  pop-up only for a feature with no page of its own): `docs/15-UI-GUIDELINES.md` §20.
- The engine (`src/engine`) is pure (no React, store, DOM or fetch; eslint enforces it) and decides every rule and
  number. The UI presents the battle state and its log; it never decides an outcome.
- Text lives only in `src/i18n/strings.csv`, all ten languages filled; run `pnpm i18n:fonts` after editing a CJK column.
- pnpm; Prettier style for new code (no semicolons, single quotes, width 110); `@/` imports; comments say why. Don't
  reformat whole files that aren't Prettier-clean yet.
- Small fixes: run only the tests related to the change (`pnpm exec vitest run <its test files>`, plus
  `pnpm e2e <spec>` only when a spec covers the changed screen). Never the full suite for a small fix.
- Features, before a commit: `pnpm lint && pnpm build && pnpm test`, all green, plus the e2e specs of what changed
  (`pnpm e2e <spec>`). The full `pnpm e2e` runs only before pushing to `main`.
- **SQL to run**: whenever a change adds or edits a migration (`supabase/migrations/`), give the user the GitHub link
  of each file to run, on the branch it was pushed to
  (`https://github.com/Splifingald/pokedice/blob/<branch>/supabase/migrations/<file>.sql`), in the reply and in the
  feature's doc (its "Setting it up" steps). Say also that `supabase/seed.sql` carries it when the migration is inlined.
- Never push to `main`.
- **Testing is on Netlify Deploy Previews**, not Artifacts (the user's rule, 2026-10-26): push the work to its branch, keep
  a pull request open for it (into the version branch), and give the user its preview link
  (`https://deploy-preview-<PR>--poke-dice.netlify.app`) once Netlify has built the latest commit. Netlify builds
  previews only for PRs into `main` or a branch-deploy branch (Project configuration › Build & deploy › Branches and
  deploy contexts): a new version branch goes in that list first.
- **Patch note with every change bound for `main`** (a push the user asks for, or a PR into `main`): write
  `patch-notes/YYYY-MM-DD-short-name.md` and its French twin `…-short-name.fr.md`, both short (format:
  `patch-notes/README.md`; the French one goes to #🥖-français), show both to the user with
  `pnpm discord:patch-notes <file> <file.fr> --dry`, and add them only once they approve them. Adding it to `main`
  posts it to Discord as soon as the site is live, so leave out what players can't see yet (a feature still Off or
  On for admin), unless the user switches it on later that day: then the note says it comes during the day.
