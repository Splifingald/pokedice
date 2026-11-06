# Pokédice — our own copy of Showdown's sprites

> **Status: ready to set up.** The game reads every Pokémon sprite and cry from Pokémon Showdown's server
> (docs/13-SHOWDOWN-SPRITES.md). This guide puts a copy of those files, same look, same paths, on Cloudflare Pages
> and points the game at it, so Showdown being slow or down no longer touches players. Cost: **$0 a month** (Pages'
> free plan doesn't charge for static files or their traffic; the copy is about 6,000 files, its limit is 20,000).

Allow about 30 minutes. You need a computer with this repo, Node 22 and pnpm.

## 1. Ask Smogon first

Smogon's sprite repository says the newer Pokémon's community sprites (the Black/White-style ones after #649) need
their OK: "please talk to us first before using them". Post in the Smogon Sprite Project thread on smogon.com, or
open an issue on [smogon/sprites](https://github.com/smogon/sprites):

> Hi! I make Pokédice (https://poke-dice.netlify.app), a free, non-commercial Pokémon fan game. It already shows the
> Showdown sprites with credit, loaded from play.pokemonshowdown.com. To take that load off your servers, may I host
> a copy of the sprites and cries it uses on my own free static host, credited to Pokémon Showdown and the Smogon
> Sprite Project? Happy to change the credit line however you prefer. Thanks!

Wait for a yes before step 4. If they only allow the Black/White ones (#1–649), stop here: that needs a small code
change first (the copy leaves the community sprites out, and the game keeps reading those from Showdown).

## 2. Make the Cloudflare account

Sign up at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) (free plan, no card). Nothing else to set
up there: the next step creates the project.

## 3. Build the copy

In the repo:

```bash
pnpm sprites-mirror
```

It downloads every sprite and cry the game uses from Showdown (about 6,000 files, 250 MB, a few minutes; kept in
`scripts/.cache/showdown`, so a re-run only fetches what's new) into `sprites-mirror/`, with a `_headers` file (a
month in the browser's cache) and a credit page. `pnpm sprites-mirror --dry` only counts them.

## 4. Upload it

```bash
pnpm dlx wrangler@4 login
pnpm dlx wrangler@4 pages project create pokedice-sprites --production-branch=main
pnpm dlx wrangler@4 pages deploy sprites-mirror --project-name=pokedice-sprites --branch=main
```

`login` opens the browser once. Keep `--branch=main` on the deploy: without it, any other git branch makes a
preview, not the live copy. The deploy prints the copy's address, `https://pokedice-sprites.pages.dev` (another
name if that one was taken: use what it prints).

Check it: `https://pokedice-sprites.pages.dev/sprites/gen5ani/pikachu.gif` shows Pikachu.

## 5. Point the game at it

In Netlify: the site → **Site configuration** (Project configuration on newer accounts) → **Environment
variables** → **Add a variable**:

| Key | Value |
|---|---|
| `VITE_SPRITES_HOST` | `https://pokedice-sprites.pages.dev` |

Then **Deploys** → **Trigger deploy** → **Deploy site**. The address is built into the game, so only a new deploy
picks it up. For `pnpm dev`, the same line goes in `.env.local`.

Check it: open the game, start a battle, and in the browser's developer tools (Network tab) filter on `pages.dev`:
the sprites come from there, and nothing from `pokemonshowdown.com`.

## Afterwards

- **New species or forms** (after `pnpm showdown-sprites`): run step 3, then the `deploy` line of step 4.
- **Our own sprites** (outfits Showdown doesn't have, such as Santa Pikachu: `design/outfits/README.md`) live in
  `sprites-custom/`, at the paths Showdown would use. Step 3 copies them in as they are, with nothing to download.
  After adding or changing one, run step 3, then the `deploy` line of step 4. Only the copy has them, not Showdown,
  so the game can show them only once `VITE_SPRITES_HOST` points at the copy.
- **If the copy fails** for a player: after 4 s the game shows its older built-in sprites, exactly as it does when
  Showdown fails (`src/lib/showdownReach.ts`). It doesn't fall back to Showdown.
- **To go back to Showdown:** delete `VITE_SPRITES_HOST` in Netlify and deploy again.
- **The switch** is that variable, not an admin setting: it chooses where files come from and changes nothing
  players do, so there is nothing to show players first.

How it works: `SPRITES_HOST` in `src/lib/showdown.ts` swaps `https://play.pokemonshowdown.com` for the copy in every
sprite and cry address; `scripts/sprites-mirror.ts` lists exactly those files, plus everything in `sprites-custom/`
(`tests/sprites-mirror.test.ts` checks none is missing, and that each of our own sprites has all four views).
