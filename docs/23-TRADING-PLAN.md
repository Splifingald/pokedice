# Trading: plan

Status: **built** (2026-10-12): questions → this plan → Visual Lab mockups (`design/visual-lab/trades.js`, Home tab,
"Trades" preview bar) → validation (§7, answered: §7c overrides the rest of this page where they differ) →
integration (§9 says what was built and where it differs). Built on `feature/version_2`; the migration is **0044**
(0040–0043 were taken meanwhile). It ships **Off**: see the hand-over at the end of §8.

Players trade Pokémon through **listings**, like the games' GTS: you put up one of your Pokémon, say what you want for
it, and anyone allowed to see the listing can take it while you're away. Everything is asynchronous.

## 0. Decisions (your answers, 2026-10-11)

| Topic | Decision |
|---|---|
| How | **Listings, fully asynchronous.** You pick your Pokémon and what you want for it: a species, any I don't own, or anything. Whoever has a match takes it; nobody has to be online at the same time. |
| Limits | A fixed number of open listings per player (admin, default **4**). A listing nobody takes is removed after X days (admin, default **3**) and the Pokémon comes back. |
| Who sees it | Chosen per listing: **Public** (the trade board, every signed-in player), **Friends** (your friends only) or **Private** (only people with its link). Every listing has a link to share. |
| Your copy | **You lose the Pokémon you trade.** The game keeps one plain copy per species per region and has no spares, so a trade gives away your only copy. Its Pokédex entry stays (the Pokédex never shrinks). A Trade case for spare duplicates may come later. |
| Level | A traded Pokémon arrives **at the level of the one you gave**: a Lv.12 Charmander for a Lv.34 Wartortle gets you Wartortle at Lv.12, raised to the species' minimum (Wartortle can't be under Lv.16: Squirtle evolves at 16). Every traded Pokémon is **capped at Lv.50**. |
| Over Lv.50 | A species that only exists above Lv.50 arrives at its own minimum (Dragonite Lv.55, Hydreigon Lv.64): the only ones above the cap. |
| What | **Shinies can be traded; legendaries and mythicals can't.** |
| Next | Plan + mockups first, then the build. |

## 1. The rules

### 1.1 Putting a Pokémon up

- From the Trades page (**New listing**) or a Pokémon's sheet (**Trade**): pick one of your Pokémon, from any region's
  Box or team.
- What you want, one of three:
  - **a species**, from every region you've started (legendaries and mythicals left out), picked in a grid:
    - a search by name or number;
    - a toggle **Not owned** (the default) / **Owned** / **All**, with counts: owned = you have one now;
    - region chips (All regions, Kanto, Johto…) once you've started two regions;
    - the grid: 3 columns on a phone, more on PC (as many 112 px tiles as fit), each tile with its number, icon, name
      and an **Owned** or **NEW** (not in your Pokédex) tag. Picking one folds the grid into the pick, with Change;
  - **any I don't own**: a species you don't have right now in the Box it would land in (§1.4), or a shiny when you
    have no shiny of it;
  - **anything**.
- Who can see it: Public, Friends or Private (§0).
- **POST** sends it. The Pokémon leaves your Box and team at once: it waits in the listing, frozen (no XP, no evolving,
  no Day Care, no Versus or raid team). If it was on your team, the next one steps in (as when you send one on to
  another region).
- **CANCEL** at any time before someone takes it brings it back. After X days (admin, default 3) the listing ends by
  itself and the Pokémon comes back the next time you play.
- What can't be listed:
  - legendaries and mythicals;
  - a fossil still reviving;
  - a Day Care resident (take it back first);
  - the last Pokémon in a region's Box.
- At most 4 open listings (admin).

### 1.2 Taking a listing

- Open it from the trade board (public and friends' listings), a friend's card, or a shared link.
- **TRADE** opens a picker of your Pokémon (every region's Box) that match the want. Each row says what you'd get:
  - "You get Charmander Lv.22" (the level of the one you give, see §1.3);
  - **NEW**: not in your Pokédex yet;
  - **STRONGER**: above the copy in your Box, which it replaces;
  - "You have Lv.30: nothing gained": you keep yours, the incoming one merges into it (allowed, with a warning).
- A confirm says it plainly: "Pidgey Lv.22 leaves your Box for good (its Pokédex entry stays). You get Charmander
  Lv.22." Then the trade animation, then the Pokémon is yours. It's done: the poster doesn't confirm anything.
- Limits: you must be signed in, have started the listed Pokémon's home region (§1.4), and be under the daily cap
  (admin, default **5 trades a day**, UTC). You can't take your own listings.

### 1.3 The level a Pokémon arrives at

```
arrival level = the level of the Pokémon you gave, at most 50 (admin: levelCap),
                raised to the species' minimum
```

The **species' minimum** is the lowest level the game ever gives it:

- its evolution level (Wartortle 16, Charizard 36, Alakazam 34 through the trade rule, Gyarados 20);
- or lower if it's found wild lower in a fixed-level area (Pikachu, Lv.3 in Viridian Forest, though Pichu evolves at
  30);
- a species evolved by an item or stone takes its pre-evolution's minimum (Raichu = Pikachu's);
- a species with no pre-evolution starts at Lv.1.

It is computed by the engine from the content (evolutions and wild pools), never stored, so admin edits flow in.

XP starts at 0 and HP is full.

Examples (the poster put up the first Pokémon):

| Poster gives | Taker gives | The poster gets | The taker gets |
|---|---|---|---|
| Charmander Lv.12 | Wartortle Lv.34 | Wartortle Lv.16 (its minimum) | Charmander Lv.34: it evolves into Charmeleon on its next XP, as a caught one would |
| Magikarp Lv.5 | Gyarados Lv.41 | Gyarados Lv.20 (minimum) | Magikarp Lv.41 |
| Pidgey Lv.22 | Kadabra Lv.30 | Kadabra Lv.22 → Alakazam Lv.22 (a trade evolution, §1.5) | Pidgey Lv.30 |
| Dratini Lv.10 | Dragonite Lv.62 | Dragonite Lv.55 (minimum above the cap) | Dratini Lv.50 (the cap) |

### 1.4 Where it lands, and the one-copy rule

- **Its home region**: a traded Pokémon lands in the Box (live or parked) and Pokédex of the region of its generation:
  Pikachu in Kanto's, Totodile in Johto's, an Alolan Rattata in Alola's. That region always lists the species and lets
  it evolve (the generation gate), wherever it came from.
- **Or another region you've started, your pick** (added 2026-10-15, the user's ask): when other regions you've
  started (small worlds never) list the species in their Pokédex too (Pikachu: Kanto's and Johto's), you pick its Box
  (`tradeLandings`: its home region first, then the others in the regions' order). A taker picks on the confirm (it
  starts on the first Box where it can play now); a poster picks on the last step of "Trade done!", before the result.
  Until then it waits out of every Box (`trades.landing`), and the scene keeps coming back on Home (the gold dot stays)
  until the pick is made. Being able to take a listing still asks for its home region (the server checks it, 0044).
- **The level lock** (added 2026-10-15, the same rule as a small world's Pokémon going home, docs/26 §1): a traded
  Pokémon above the best level of the region it goes to (its team, Box and Day Care) waits there, locked ("Traded by
  Misty"), on the same waiting list, until one of that region's Pokémon reaches its level; then it arrives by the catch
  rule below, Pokédex entry and all. The outcome says so: `locked`.
- So a trade can cross regions: a Kanto player's Pikachu for a Johto player's Totodile. Each side must have started the
  home region of what they get: the poster only asks for species of regions they've started (§1.1), and a taker who
  hasn't started the listed Pokémon's region sees it greyed on the board ("Start Johto first").
- On arrival the **catch rule** applies, as for a wild catch:
  - a new species: added, and into the Pokédex;
  - a stronger one than your plain copy: it replaces yours (your copy's team slot keeps it);
  - as strong or weaker: it merges into yours, which stays as it is (the taker is warned; the poster chose the risk
    with Anything);
  - a shiny: always kept as its own Pokémon.
- The Pokédex entry of what you gave stays.

### 1.5 Trade evolutions

- Kadabra, Machoke, Graveler, Haunter, Boldore, Gurdurr, Karrablast, Shelmet, Phantump and Pumpkaboo **evolve the
  moment they arrive**, at the level they arrive at, with the evolution animation after the trade one. The minimum is
  the arriving species' (Kadabra's 16), so a Lv.22 Alakazam is possible, as in the games. They need the region to
  allow that evolution (the generation gate).
- Their Lv.34 rule stays for players who don't trade.
- The list is a config entry (admin), not a data change, so no seed is needed.
- Karrablast and Shelmet evolve whatever they're traded for (no partner rule).

### 1.6 Coming back to the game

There's no Realtime, as with friends. The game checks your trades when it loads and when you come back to its tab (at
most every 5 minutes), in the same call as the friends check where possible:

- **A listing was taken**: back on Home, once the run is idle, the trade animation opens by itself as "Trade done!
  Misty took your Charmander" (skippable), then "Wartortle Lv.16 joined your Box". The Trades row and your avatar carry
  a gold dot until it has played (see §9).
- **A listing ran out**: a toast, "Charmander came back from the trade board."
- Offline, nothing moves: a listing is only given back once the server says it ended (someone may have taken it a
  minute before).

## 2. What players see

**Trainer menu → Trades**, under Friends: a page like Friends and Versus (`/trades`), two tabs:

- **Board**: open listings, public and friends' (sky blue with the Friend tag, as on the boards). Since 2026-11-01 it
  shows 5 picked for you until you search (§2.1); what follows is the search's list.
  - A search (Pokémon or trainer) and chips: **All**, **Friends**, **New for me**, **I can trade**.
  - Sort: **Tradable first** (the default: what you can take now, friends first, then ending soonest), **Ending soon**,
    **Newest**.
  - Rows: the listed Pokémon on the left (mini, name, shiny star, NEW when it's not in your Pokédex), who, the time
    left and its region when it isn't Kanto; the wanted Pokémon on the right (its icon and name, or a NEW / ANY tile for
    any I don't own / anything). A row you can't take is greyed with the reason (You have no Haunter, Start Johto
    first, No trades left today); one you can take says You can trade.
  - A tap opens the listing.
- **Mine**: your slots (4).
  - A listing shows its Pokémon, the want, a Public / Friends / Private chip, the time left, SHARE and CANCEL.
  - An empty slot is **+ New listing**.
  - Below, **Done**: your last trades, both ways.

### 2.1 The board's picks (added 2026-11-01, the user's ask)

Listing every open listing didn't scale, so the **Board** no longer does. Without a search it shows **5 listings
picked for you** (admin `trade.boardPicks`), under "Picked for you" and one line: "Pokémon you don't have first, then
hidden talents you haven't found. A search shows every listing."

- **Only listings you can take** (`takeBlock`: your region started, something of yours it wants), never your own.
  The day's cap doesn't hide one: tomorrow it can be taken, and its row says "No trades left today" meanwhile.
- **Ranked** (`rankPicks`, engine/trade.ts):
  1. a Pokémon **you don't have** in the Box it would land in, or a **shiny** when you have no shiny of it (as "Any I
     don't own" counts it; a trade evolution counts as what it becomes: a Kadabra is new when you have no Alakazam);
  2. one carrying the **hidden talent** its family hasn't unlocked in that region (talents on);
  3. any other you can take.
  Within each, friends' first, then ending soonest.
- **NEW PICKS** (`NewPicksButton`, the dice icon, "New picks · 2/2 today"): **twice a UTC day** (admin
  `trade.boardRerolls`). The listings shown go to the back of the line until midnight UTC: the ones not shown yet come
  first, then those seen, the one seen longest ago first, so each press brings the listings seen least. Greyed with
  "That's every listing you can take right now" when nothing else can be shown, "New picks tomorrow" once used. Kept
  in the save (`trades.picks`: the day, the presses, the listings passed over), so a reload or another device doesn't
  give them back. The server doesn't count them: a search shows every listing anyway.
- **A search, as often as you like**: typing a Pokémon or a trainer shows every listing that matches (`trade_board`,
  unchanged: 50 at a time), with the sort and the chips (All, Friends, New for me, I can trade), greyed rows with why,
  your own last. Clearing it brings the picks back.
- **On the server** (`trade_picks`, migration **0108**): the game sends what it owns (the snapshot a listing keeps),
  every species it could give and the species whose family's talent it has unlocked (`picksAsk`). The server ranks
  every open listing it may see the same way (tradable first, then new, talent, the rest; friends' first, ending
  soonest; the ones passed over today last) and sends back 40 candidates; the game ranks those exactly and shows the
  first 5 it can take. A database before 0108 answers with the board's first 50, so the page works before the
  migration has run.
- No switch of its own: a change to the Trades page, under Trades' switch (as the Fortune Wheel's tickets were,
  docs/15 §20), explained where it happens (the line over the picks, the count on NEW PICKS), so the rules card keeps
  its four rows.

**Setting it up**: run
[`0108_trade_picks.sql`](https://github.com/Splifingald/pokedice/blob/ccr-fbc66ea0-rrh0dw/supabase/migrations/0108_trade_picks.sql)
(`supabase/seed.sql` carries it too), then deploy. Until it has run, the board picks among the 50 listings ending
soonest. Admin → Config → Trades has the two numbers.

**A listing** (a sheet): the Pokémon large (shiny sparkles), its types, "Sora's", what they want, the time left, "You
get it at the level of the Pokémon you give", then **TRADE** (red), or why you can't (region not started, cap reached,
nothing matching, sign in).

**New listing** (a sheet, three steps on one page):

1. **Your Pokémon**: the Box picker with region tabs, search and sort, blocked ones greyed with the reason.
2. **In exchange**: A species (the grid of §1.1) / Any I don't own / Anything.
3. **Who can see it**: Public / Friends / Private (link).

Then a summary ("Charmander leaves your Box now. It comes back if nobody trades within 3 days. You'll get theirs at
Lv.12, or its minimum.") and **POST**. A private listing opens the share sheet straight away.

**Sharing**: a link `https://<site>/t/K7QM4XD9`, through the share sheet on phones or copied on desktop, as for friend
invites. A message goes with it, so a chat says what's on offer without opening it (every link's preview is the site's
one picture):

```
Trade with me on Pokédice: my shiny Pikachu (Lv.32) is up for trade!
I want: Riolu
https://<site>/t/K7QM4XD9
```

- Opening it shows the listing in its sheet once the run is idle, never mid-fight.
- Signed out: "Sora wants to trade. Connect to take part" with CONNECT.
- A Friends-only listing opened by a non-friend says "Only Sora's friends can take it", with ADD SORA.

**A friend's card**: a "Their trades" row of their Public and Friends listings, each opening the listing.

**A Pokémon's sheet**: a **TRADE** button beside Send on, which opens New listing with that Pokémon picked.

**The trade animation** (full screen, SKIP, about 7.5 s, like the games' — see §9 for what was built):

1. Your Pokémon says goodbye on the link pad (its cry) and goes into its ball; the ball shoots up.
2. Through the link: your ball and theirs come out of the gates at either end of a cable of light, braid along it and
   cross in the middle in a flash.
3. The other ball comes down a beam onto your pad, opens, and the new Pokémon appears (its cry) with a sparkle (shiny:
   the shiny one and its stars).
4. "Take good care of Charmander!"
5. A trade evolution follows with the usual evolution scene.

**Admin → Config → Trades**: the Off / On for admin / On for everyone switch, max listings, days, trades per day, the
level cap, badges needed, and the trade-evolution list. **Admin → Trades**: open listings, with Remove (the Pokémon
goes back to its owner).

## 3. Who can trade

- **Signed-in players only** (Google or Discord), as for friends. A guest sees the Trades row with the connect prompt.
- From the **first badge** of any region (admin number), so a new player can't trade away their partner on day one.
- **Your main save only**: Extreme mode stays a solo challenge (its realm has no trades). Small worlds: nothing inside
  a world can be listed (no event reaches inside a world).
- The switch: **Off / On for admin / On for everyone**, Off by default, checked by the server too (the wheel's check).

## 4. Data and admin

Config (a new `game_config` row `trade`, inserted by the migration only if missing, so seeding never clobbers it):

```ts
trade: {
  access: 'off' | 'admin' | 'all'          // 'off'
  maxListings: 4, listingDays: 3, tradesPerDay: 5, levelCap: 50, minBadges: 1,
  boardPicks: 5, boardRerolls: 2,          // the board's picks and NEW PICKS a day (§2.1, added 2026-11-01)
  evolveOnTrade: [[64, 65], [67, 68], [75, 76], [93, 94], [525, 526], [533, 534], [588, 589], [616, 617], [708, 709], [710, 711]],
}
```

Save (`trades`, optional, kept by the schema):

```ts
trades: {
  out:  [{ listing, code, region, mon: PokemonInstance, at, endsAt }]  // listed Pokémon, out of the Box, still yours
  done: string[]                                                       // trade ids already applied (last 50)
}
```

A listed Pokémon stays inside your own save (`out`) until the trade is done: nothing is lost if a call or a tab dies,
and cancelling never depends on the server keeping a copy.

## 5. Server (migration 0044)

The save is written only by its owner, so a trade is a **server inbox**, like raid gifts. The server holds the listing
and decides who got there first; each player's game applies its own half.

`trade_listings`: id, code, realm, owner, from_region, mon {inst, dex, level, shiny}, want {kind, dex?}, visibility,
created_at, ends_at, status (`'open' | 'taken' | 'cancelled' | 'expired' | 'removed'`), taker, taker_mon, taken_at,
owner_applied, taker_applied.

- Indexes on (realm, status, visibility, ends_at) and (owner), (taker).
- RLS with no direct access, as for friends.

Functions (security definer, signed-in, `p_realm`, the switch checked as `wheel_spin` does):

| Function | What it does |
|---|---|
| `trade_post(inst, region, want, visibility)` | Reads the Pokémon from your cloud save (pushed just before, as Versus does: what the page sends isn't trusted). Checks the rules (§1.1), the open-listing cap and badges. Returns the code. |
| `trade_take(code, inst)` | Reads your Pokémon from your cloud save (any region's Box). Checks the want, visibility (friends via `friend_ids_of`), that you've started the listed Pokémon's home region, the daily cap, not your own. Then one conditional `update … where status = 'open' and ends_at > now()`, so two takers can't both win. Returns both Pokémon. |
| `trade_cancel(id)` | Only while open. |
| `trade_board(filter, sort, after)` | Public + friends' open listings, 50 at a time; the browser works out *tradable* for the default sort from its own save. Reads listing rows only, never a save. |
| `trade_picks(me, skip, limit)` | (0108, §2.1) The board's candidates for the player, ranked from what the game says it owns, could give and has unlocked; the listings passed over today last. Listing rows only. |
| `trade_view(code)` | One listing by its link; signed-out players can call it too, rate-limited like `friend_lookup`. |
| `trade_mine()` | Your listings and takes that still need applying (taken, ended), for the check on load / return to the tab. |
| `trade_applied(ids)` | Marks them applied once your save holds them. |

- **Applied exactly once.** Each side records the trade id in `trades.done`, pushes, then calls `trade_applied`. If the
  tab dies in between, the next check returns the trade again and the save already says it's done (raid gifts are
  at-most-once; trades can't be).
- On load the game also tidies up: a listed Pokémon still in a Box on another device (an old copy of the save) is moved
  out; an ended listing gives its Pokémon back.
- Rows that are done on both sides are deleted after 30 days (the existing cleanup job).
- **Delete my data**: your open listings go. A taken trade still owed to the other player keeps their Pokémon, without
  your name.
- **Load**: the board reads small rows (no save), cached a minute in the browser. A save is read only when you post or
  take, one each, as Versus does.

## 6. Engine (pure, `src/engine/trade.ts`)

| Function | What it does |
|---|---|
| `speciesMinLevel(data, dex)` | §1.3's minimum, from evolutions and fixed-level wild pools |
| `arrivalLevel(data, dex, givenLevel)` | `max(min(given, levelCap), speciesMinLevel(dex))` |
| `homeRegionOf(data, dex)` | the region of its generation (a regional form: its form's region), where a traded Pokémon lands |
| `wantable(save, data)` | every species of the regions you've started, legendaries and mythicals out, for the grid |
| `listable(save, data, region, inst)` | null or why not: legendary, fossil, dayCare, last, world |
| `wantMatches(want, mon, ownerHas)` | the three wants (§1.1) |
| `listOut(save, region, inst, listing)` / `listBack(save, listing)` | out of the Box into `trades.out`, and back (back applies the one-copy rule) |
| `receiveTrade(save, data, mon, givenLevel, now)` | places it in its home region's Box (§1.4), evolves it on trade (§1.5), returns `{ save, outcome: 'new' \| 'replaced' \| 'merged' \| 'shiny', evolvedTo? }` |

The UI shows these results and never decides a level or an outcome itself.

### 6b. The mockups (Visual Lab, Home tab)

`design/visual-lab/trades.js` mirrors the functions above on the lab's data (`assets/game.json` evolutions,
`assets/kanto.json` wild pools, a few Johto ones written in), and every screen reads them. The **Trades** preview bar
signs you in or out, starts Johto, fills the daily cap, and plays: a listing taken while you were away, a listing
running out, a shared link (as a friend, signed out, Friends only), the trade scene with a trade evolution.

1. The trainer card's menu with **Friends** and **Trades** (the gold dot on the avatar and the row).
2. The Trades page: the board (search, chips, sort, rows greyed with the reason) and Mine (slots, Done), INFO.
3. A listing's sheet, with the species' minimum and why ("Lv.16 at least: Squirtle evolves at 16").
4. Taking it: the picker (You get Kadabra Lv.30, NEW, STRONGER, → Alakazam, nothing gained), the confirm, the scene,
   the trade evolution, what you got and where it went.
5. New listing: the three steps, the species grid, the summary, POST, the share sheet for a private one.
6. A Pokémon's sheet with **Trade** beside Send to Johto.
7. A friend's card with **Their trades**.
8. The pop-up when a listing was taken, and the toast when one ran out.
9. The **Trade** timeline in the Animations tab (Pikachu for Totodile across regions, a shiny arriving, Kadabra arriving
   then evolving), and Kadabra → Alakazam in its Evolution list.
10. The admin mock beside the phone: Config → Trades and Admin → Trades with Remove.

## 7. To decide at validation

1. **"Any I don't own"** means: not in the Box it would land in right now, or a shiny you don't have (the plan), or not
   in your Pokédex?
2. **Trade evolutions** on arrival (the plan), or only by level as today?
3. **Badges to trade**: from the first badge (the plan), or from the start?
4. **Trades per day** for takers: 5 (the plan), or no cap? It stops alt accounts filling the Pokédex board quickly.
5. **A Home square** for trades (listings done, time left), or only the menu row, the friend cards and the dot (the
   plan)?
6. A wanted species with a **level floor** ("Pikachu Lv.20 or more")? Not in the plan: the level rule makes it matter
   little.
7. **Shiny-only wants** ("a shiny Magikarp")? Not in the plan.

### 7b. Found while making the mockups

8. **A rules pop-up**: the mock shows the feature's rules the first time the page opens and from an INFO button at its
   bottom, as the Day Care and Versus do (`RulesModal`). Keep?
9. **Your own listings on the board**: the mock lists your public and friends-only ones there too, tagged YOURS and
   sorted last. Or only under Mine?
10. **Guests**: the mock shows the four newest public listings under the connect prompt, as a teaser. Or nothing?
11. **Ultra Beasts** aren't flagged legendary in the data (`egg-groups.json` has no `l` on Nihilego to Blacephalon,
    #793–#799 and #803–#806), so the rules let them be traded. Fine, or out with the legendaries?
12. **Above the cap**: with the real data, eleven species arrive above Lv.50, not two: Bisharp 52, Braviary 54,
    Mandibuzz 54, Baxcalibur 54, Dragonite 55, Tyranitar 55, Volcarona 59, Naganadel 60, Dragapult 60, Kingambit 60,
    Hydreigon 64. That follows from §1.3; listed here so nobody is surprised.
13. Two consequences of §1.3, checked on the real data, that need no change: Dragonair's minimum is 25 (wild in the
    Safari Zone), under Dratini's evolution level 30; and a species evolved by an item from one with no
    pre-evolution can arrive very low (Scizor, Steelix, Slowking: Lv.1, like Scyther, Onix and Slowpoke).

### 7c. Settled at validation (2026-10-12)

1. **Any I don't own**: not in the Box it would land in right now, or a shiny when you have no shiny of it (as
   planned).
2. **Trade evolutions only by trade.** The eleven that evolved at Lv.34 here — Kadabra, Machoke, Graveler (and
   Alolan Graveler), Haunter, Boldore, Gurdurr, Karrablast, Shelmet, Phantump, Pumpkaboo — **lose their level
   evolution for good**, whatever the Trades switch: they evolve the moment they arrive in a trade, and never by
   level. The list is the admin's (`trade.evolveOnTrade`): a pair taken off it evolves by level again. Their minimum
   (§1.3) follows the pre-evolution's, as for an item evolution, so a Lv.22 Alakazam is possible.
   The games' **trade-with-a-held-item** evolutions (Politoed, Slowking, Steelix, Scizor, Kingdra, Porygon2,
   Porygon-Z, Huntail, Gorebyss, Rhyperior, Electivire, Magmortar, Dusknoir, Aromatisse, Slurpuff) **keep using
   their item** here, like a stone. Feebas → Milotic stays at Lv.30.
3. **Badges**: from the **2nd badge** (admin number `minBadges`, default 2), every region's badges counted together.
4. **Daily cap**: 5 trades taken a UTC day (admin).
5. **No Home square**: the trainer menu's Trades row, the friend cards and the gold dot.
6. **Rules pop-up** once, the first time the page opens, and an **INFO** button at its bottom. Made a general rule
   for every feature (docs/15 §20).
7. **The switch** Off / On for admin / On for everyone, Off by default, checked by the server too. Made a general rule
   for every feature (docs/15 §20).
8. **Your own listings** show on the board too, tagged YOURS, sorted last.
9. **Guests** see the connect prompt and, under it, the four newest public listings (`trade_board` answers guests
   with public listings only).
10. **Ultra Beasts can't be traded**, like legendaries and mythicals: an admin list (`trade.exclude`), the Ultra Beasts
    by default.
11. **No other wants**: no level floor, no shiny-only want.

## 8. Integration phases (after validation)

1. **Engine, config, save**: `trade.ts`, the schema, defaults, unit tests (levels, minimums, the one-copy outcomes,
   trade evolutions, listing out and back).
2. **Server**: `0044_trades.sql` (table, functions, realm, switch, delete-my-data, cleanup), inlined into `seed.sql`,
   PGlite tests like `friends-sql`.
3. **Client**: `src/lib/trades.ts`, the store (post, take, cancel, the check on load / return, applying once), the
   `/t/:code` route.
4. **UI**: the Trades page, the sheets and pickers, the friend card row, the Pokémon sheet button, the trade animation,
   the pop-up and dots, `/kitchen-sink`, the strings in all ten languages.
5. **Admin, e2e, docs**: Config → Trades, Admin → Trades, `e2e/trades.spec.ts` (two players through a mocked server,
   phone layout), docs/15 rules where the new components are general.

**Hand-over for live** (when it ships): run 0044 (GitHub links then), deploy, switch Trades to On for admin to try it on
live, then On for everyone.

## 9. As built

| Part | Where |
|---|---|
| Rules, levels, landing, outcomes, applying once | `src/engine/trade.ts` (+ `isTradeEvolution` / `tradeEvolutionOf` in `progression.ts`), `tests/engine/trade.test.ts` |
| Config and save | `trade` in `engine/defaults.ts` and `types.ts`; `trades` in the save schema |
| Server | `supabase/migrations/0044_trades.sql`, inlined in `seed.sql`; `tests/trades-sql.test.ts` (PGlite) |
| Client | `src/lib/trades.ts` (calls, parsing, errors, the link kept a week), `src/store/trades.ts` (post, take, cancel, the board's cache, the check, the scene), `tests/trades-client.test.ts` |
| Screens | `src/screens/Trades.tsx` (`/trades`), `src/screens/TradeLink.tsx` (`/t/:code`), `src/components/trades/*` (docs/15 §21), the menu row, TRADE on a Pokémon's sheet, "Their trades" on a friend's card, trade evolutions on the sheet and in the Pokédex |
| Scene | `tradeTimeline` in `src/fx/timelines/trade.ts` (three acts: sending, the link, arriving), its sounds `trade.*` in `src/audio/sfx.ts`, both Pokémon's cries; on `/kitchen-sink/fx` (plain, shiny) and `/kitchen-sink` (every state) |
| Admin | Config → Trades (the switch, the numbers, the trade-evolution and never-traded lists); Admin → Trades (open listings, Remove) |
| End to end | `e2e/trades.spec.ts`: the rules once, a poster posting and finding it taken, a taker trading from the board, a guest, a shared link, the switch off; all on a phone |
| The board's picks (§2.1) | `rankPicks`, `boardPicks`, `rerollPicks`, `picksAsk` in `engine/trade.ts` (`tests/engine/trade.test.ts`); `trade_picks` in `0108_trade_picks.sql` (`tests/trades-sql.test.ts`); `fetchPicks` and the store's `loadPicks` / `newPicks` (`tests/trades-picks-client.test.ts`); the page's `Picks` and `Found`, `NewPicksButton`; `e2e/trades.spec.ts` (the picks, NEW PICKS twice, a search) |

What differs from the sections above, or wasn't in them:

- **"Trade done!" is the scene itself, on Home** (the user's ask, 2026-10-12, after a trade whose animation was never
  seen): no Later / See it step. A listing taken while away waits in the save (`trades.unseen`, read by
  `tradesToWatch`) until its scene has played, so a reload, another device or the cloud copy can't lose it (it used to
  wait in memory). The scene plays back on Home once the run is idle and no other one-time pop-up is due; going back
  Home (and opening the Trades page) with a listing out checks again, at most once a minute (`checkListings`), so a
  trade made while you play shows up between fights rather than only on reload or after 5 minutes away from the tab.
  The gold dot and Mine's NEW tag stay until the scene has played; each trade in Mine's Done list plays its scene again.

- **The check waits for the sign-in's sync** (`syncSettled`): a trade is never applied to a save that is about to
  give way to the cloud copy. It runs again on return to the tab, at most every 5 minutes; with the switch off it
  still runs for a player who has traded, so nothing listed is stranded.
- **A friend's card** reads `trade_board(p_owner => …)`: the board function has an owner filter, so the card shows
  every open listing of theirs you may see, not just those among the board's first 50.
- **"New for me"** and NEW mean the Pokédex of the region it would land in (`newForTrade`): its home region's.
- **The Box picked, and the lock** (2026-10-15, §1.4): `receiveTrade` takes the region; without one and with several
  (`tradeLandings`, a region's Pokédex being `regionSpecies`), the outcome is `pending` and the Pokémon waits in
  `trades.landing` until `chooseLanding` (the store's `land`) places it. Above that region's best it goes on
  `events.worldHome` with `tradedBy` (outcome `locked`); `releaseWorldHome` lets it in later, as any waiting Pokémon.
  The log keeps `region` (where it went). The confirm's pick and the scene's last step share `LandingPick`
  (`landingOptions`, `previewLandings`). No server change: the home region still gates who can take a listing.
- **The day's cap** is shown from the save's log (the trades taken since midnight UTC); the server counts too and
  has the last word.
- **The picker and the confirm** come from `previewTake` (the trade worked out on a copy of the save), so what they
  promise is what `applyTake` then does.
- **Strings**: `ui.trades.*`, `ui.rules.tr.*`, two `ui.time.*` and four evolution lines, in all ten languages.
- **No trades in a small world** (docs/21, which landed meanwhile): inside one, Trades are closed (`tradeClosed` says
  `world`; no row, page or button, and the check and its pop-ups wait until the player is back); a world's Box is
  never offered, its region never counts as started, and nothing received lands there. The server says the same
  (`trade_world`, `trade_in_world`: `trades_world`), from the save's own world and the admin's list.
- **Nicknames go with the Pokémon** (added after the build): a nickname lives on the instance (`nickname`,
  `engine/nickname.ts`), so the listing's copy of it on the server carries it with no change to 0044. The client
  cleans it on arrival (`parseInstance`: control characters out, 12 characters at most); `receiveTrade` gives it to the
  Pokémon that arrives (through a trade evolution); a stronger one that replaces your copy brings its nickname, or
  keeps yours when it has none; one that merges into yours brings nothing. The log keeps both sides' nicknames for
  the scene and the Done list. The board, a listing's sheet and a friend's card still show the species: a nickname is
  only seen by whoever ends up with the Pokémon, who can change it from its sheet.
- **A friends-only listing opened by a non-friend** says "Only Sora's friends can take it" with a button to the
  Friends page, not ADD SORA: adding a friend takes their friend ID, which a listing doesn't carry. The listing's
  sheet has no "Their card" button either; a friend's card lists their trades instead.
- **No save editing from Settings** (added after the build): the server reads the cloud save, so pasting a save in
  would have reached other players. Settings only copies or deletes the save now (the import stays in the admin's Dev
  Tools). Players can't restore a backup either: the Settings backups panel shows to admins only, since a restore
  swaps the save the server reads just like an import. Even there, a backup can't be restored once a trade was done
  since it was set aside (`missesTrades`): each half of a trade is handed to a save once, so going back would return
  the Pokémon given away, a duplicate. Backups that already know every trade, or that only miss a listing that ended,
  still restore.
- **The cloud sync is automatic** (after the above): no "Two saves found" pop-up, whose older save could be picked
  to undo a trade. The save further along in its areas wins, then the one with the bigger Pokédex; on a tie, the one
  that saw a trade the other missed (`missesTrades` again), else the one played last (`decideSync`).
