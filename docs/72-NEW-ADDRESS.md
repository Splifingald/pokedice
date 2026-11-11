# 72 · The new address (pokedice.graf.quest)

The ask, 2026-11-11: "Tell me what I need to do to change my game address to a domain I bought. I bought graf.quest
and I want to use the subdomain pokedice, so the new url would be pokedice.graf.quest. But I don't want players to lose
their save." Then: "Prepare it", and "build me a small guide to go through with all the steps to properly switch to
the new address."

**Status (2026-11-11): built** on `claude/tender-einstein-radrs5` (from `version/2_9_7`), behind its switch, **Off**.
Migration `0148_site_move.sql`.

## 1. Why saves need help

A browser keeps a site's storage per address. Opened at `pokedice.graf.quest`, the game finds none of what
`poke-dice.netlify.app` kept on that device: the save, the Extreme save, the settings, the device's id.

- **Signed-in players** have their save in the cloud too: signing in on the new address brings it back.
- **Guests** (never signed in) have it on their device only. Without help, they would start over.

## 2. How the hand-over works

Netlify serves the same build at both addresses; the old one never redirects by itself. So the game itself moves its
players:

1. **On the old address**, with the switch on for the player, at a calm moment (no fight, encounter or catch under
   way; never on /admin or /setup): a cover says "Pokédice is moving to pokedice.graf.quest. Bringing your save…", the
   page stops writing, packs every `pokedice.*` key of the device (gzip, base64), leaves it with the server
   (`site_move_drop`) and goes to `https://pokedice.graf.quest/move.html?to=<the same page>#<code>`. The code is in
   the fragment, which no server or log sees.
2. **On the new address**, `move.html` (a page of its own, so no game is running yet to write over what arrives) takes
   it (`site_move_take`, once: the server deletes it as it answers), lays it into the new address's storage, and goes
   on to the page the player was on. The game opens on their save with a pop-up, once: **Pokédice has moved** (the
   new address, your save came along, add it to your home screen again, notifications are asked again).
3. **Back on the old address later** (a bookmark, a home-screen icon, an old link): same save, nothing sent, straight
   on to the new address. A changed save (a sign-in's sync brought a newer one) is sent again.

What stays behind: the push subscription (made for the old address: the new one asks again), the sign-in session
(the player signs in again; their cloud save comes back then), and the address's own marks (sprite fallback, reload
signals, the sign-in options' cache).

**A save already on the new address** (the player tried it first): the two meet as a cloud copy would
(`decideSync`): the further one wins, the other goes to the save's backups (Settings), never lost.

**When something fails** the old address keeps the save: a drop that fails (offline, server down) leaves the player
playing there, the next load tries again; a take that fails sends them back to the old address (`#stay`), which plays
on this time and sends the save again next load. A save left on the server and never taken is deleted after an hour.

## 3. The pieces

| Piece | What it does |
|---|---|
| `game_config.siteMove` | The switch (Admin → Config → Switches → **Move to the new address**): Off / On for admin / On for beta testers / On for everyone. Off by default. |
| Migration **0148** `site_move` | The switch's row; `site_moves` (one row per save on its way, a random code, an hour at most; no player can read it); `site_move_drop(payload)` (checks the switch for the caller, the size ≤ 8 MB, the table's room) and `site_move_take(code)` (once). |
| `src/lib/siteMove.ts` | The old address's side: when, the cover, the drop, where to go. |
| `src/save/move.ts` | What is carried (`carried`), the packing (`packDevice`, `encodeMove`), and the game's start on the new address settling a save that met one already there (`settleMovedSaves`, called first in `store/game.ts` `boot`). |
| `move.html`, `src/move.ts`, `src/moveIn.ts` | The new address's page. It imports nothing from the game, so the game still loads as one file; the few names both use are written in both, and `tests/site-move.test.ts` checks they agree. |
| `src/components/SiteMove.tsx` | The cover (`SiteMoveCover`) and the pop-up (`MovedPopup`, first in the one-time pop-ups' queue: `moved`). Both on `/kitchen-sink`; the rules also in How to play while the switch is on. |

Tests: `tests/site-move.test.ts` (what comes along, gzip and plain JSON, a save already there either way, the switch,
the pop-up's place), `tests/site-move-sql.test.ts` (0148 on PGlite: the switch for each caller, once, an hour, the
size, no grants), `e2e/site-move.spec.ts` (both real hosts in a real browser: the whole trip; a failed take; Off).

## 4. Setting it up: the guide, step by step

Do these in order. Nothing changes for players until step 9.

### A. Ship the code (switch Off)

1. Merge the pull request into `version/2_9_7` and release that version to `main` as usual. With the switch Off,
   players see nothing new.
2. Run the migration in the Supabase SQL editor (safe to run again):
   [`supabase/migrations/0148_site_move.sql`](https://github.com/Splifingald/pokedice/blob/claude/tender-einstein-radrs5/supabase/migrations/0148_site_move.sql).
   `supabase/seed.sql` doesn't inline it.

### B. Point the domain at Netlify

3. **DNS**, where graf.quest's DNS is managed (usually where you bought it): add one record.

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `pokedice` | `poke-dice.netlify.app` |

   Wait until it answers: `https://dnschecker.org` with `pokedice.graf.quest` (CNAME) shows `poke-dice.netlify.app`
   (minutes, sometimes a few hours).
4. **Netlify** → the site → **Domain management** → **Add a domain** → `pokedice.graf.quest` → confirm (it's
   managed outside Netlify, that's fine) → **Verify DNS configuration**. Then wait under **HTTPS** until the
   certificate is issued ("Your site has HTTPS enabled"). Then **Options → Set as primary domain**.
5. **Check the old address still serves the game itself** (this is what the hand-over needs): open
   `https://poke-dice.netlify.app/home`, and the address bar must stay on `poke-dice.netlify.app`. If Netlify sends it
   to the new address, set the netlify.app address back as primary (keep pokedice.graf.quest as an alias) and tell
   Claude: players must not reach the new address without their save.

### C. Sign-in on the new address

6. **Supabase** → Authentication → **URL Configuration**:
   - **Site URL**: `https://pokedice.graf.quest`
   - **Redirect URLs**: add `https://pokedice.graf.quest/**`. Keep the old entries (`https://poke-dice.netlify.app/**`,
     the deploy previews', localhost).

   Google and Discord need nothing: their sign-in comes back through Supabase's own address.
7. Open `https://pokedice.graf.quest` in a **private window** and sign in with Google, then with Discord: you should
   come back signed in, with your cloud save.

### D. Try it on yourself, then open it

8. Admin → Config → Switches → **Move to the new address** → **On for admin** → Save, then **Publish**. On the old
   address, signed in as the admin, go to Home: the cover shows for a second or two, then the new address opens on your
   save with **Pokédice has moved**. Check your team, Pokédex and settings. You're signed out there: sign in again.
9. When it looks right: ask Claude for the patch note (English and French, "the game has a new address, your save
   comes with you"), then switch it **On for everyone**, Save, **Publish**.

### E. Everything else that names the old address

10. **Ko-fi** → Settings → API → Webhook URL: `https://pokedice.graf.quest/.netlify/functions/kofi-webhook`.
11. **Discord posts** ("Play now", events, raids, the patch notes' wait for the live build): ask Claude to change
    `SITE` in `scripts/discord/layout.ts` to the new address (its tests follow).
12. Anywhere you wrote the old link by hand: the Discord server's channels and pinned messages, the Ko-fi page, social
    bios, the Google OAuth consent screen's home page link (optional).

Deploy previews stay on `deploy-preview-<PR>--poke-dice.netlify.app`: testing doesn't change.

### F. Keep the old address alive

- **Never delete or rename the Netlify site**, and leave the switch **On for everyone** for months: every player who
  comes back late (a bookmark, a home-screen icon, a link in an old message) is moved the day they come back.
- To watch it: `select count(*) from site_moves;` in the SQL editor stays near 0 (each save is taken within seconds;
  any left is deleted after an hour).
- **Switching it Off** stops the moving: players on the old address play there again, on the save it still holds
  (the old address never deletes its copy). Players already moved keep playing on the new one.
