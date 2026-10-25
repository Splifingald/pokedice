# Special Events — plan (for validation)

Status: **draft, awaiting the user's go-ahead.** Branch `feature/version_2`.
Order of work, as asked: questions (done) → this plan → Visual Lab mockups → implementation.

## 0. Decisions taken in the Q&A (2026-10-10)

| Topic | Decision |
|---|---|
| Home slot | The "Special events" widget becomes a **vertical stack of event cards**, most important first, "+N" when crowded. Tap → Events screen (one tab per event). |
| Unlocks | Locked teaser "Special events – soon" from the **3rd Kanto badge**. Each event goes live when its unlock **area is cleared**. |
| Daily clock | **Server UTC midnight** (Supabase). |
| Shared events | The framework supports shared schedules (start/end in admin) now; nothing shared ships yet. |
| Wheel gold | **₽10** as written (admin-editable). |
| Wheel look | **Equal slices**, real odds hidden on the wheel but shown in an **info pop-up**. |
| Raid party | **You + up to 2 friends, 3 Pokémon each (9 in total)**. Each side has **one Pokémon out at a time** → 3 on the field vs the raid Pokémon, alone (no summons since 2026-10-13). |
| Raid control | You roll for your side; friend sides auto-play (auto-mode AI). |
| Raid team | Its **own registration**, separate from Versus, **capped at Lv.50** (since 2026-10-18 the dice and rerolls stay its own level's). |
| No friends / guest | **NPC allies** fill empty sides: never legendary, never mythical, never a starter line, never a pseudo-legendary, always fully evolved. |
| Retries | Unlimited during the 24 h; a failed catch keeps the raid open (fight again from full). |
| HP bars | **3 bars of 2.2 × its HP**. Its summons (2 at the start, more per broken bar) were dropped on 2026-10-13, "raids are not well understood": its bars grew instead. All admin. |
| Raid level | Raid Pokémon **Lv.50**. Difficulty from the bars, its **type matchups** (below) and a **dice/upgrade level (admin, default 8)**. |
| Type matchups (2026-10-13) | Raids only, all admin: the sides' **super-effective** hits on it do **×1.3** (not ×2), resisted ones **×0.5**, immunities ×0; **its** resisted hits do **×0.7** and **nobody is immune to it: ×0.5**; its super-effective hits stay ×2. |
| Emptied areas | Keep **normal rounds**. Clearing the area plays "Raid unlocked: Mew!" and adds it to your raid pool. |
| Helper rewards | Pop-up on the helper's next login, **max 5 per day** (admin). |
| Fallback pool | Pseudo-legendaries **plus "boss feel" extras**, region-gated, 30 % shiny. |
| Elite rebattle | **Victory Road II and League II are deleted** in every region. Rebattle = a separate event built on the League I teams. |
| Rebattle format | **Full gauntlet per tier** (E4 + Champion back to back), items only, a loss restarts the tier (₽ from the wins is kept). Champion slot = **the rival** (per starter) where League II had one. |
| Rebattle gold | Normal trainer gold **×1.5 / ×2 / ×3** by tier, paid per win. |
| Old saves | Everything earned is kept. A save standing in a deleted area goes back to the previous area. **No Rebattle tier is credited.** |
| Unlock pop-up | A **banner at the top** (an existing in-game background, picked in admin), then the **2–4 rule sections**, then a button straight to the event. |

## 1. Event framework

### Data (game_config key `events`, defaults in `src/engine/defaults.ts`)
```ts
type EventKind = 'wheel' | 'raid' | 'rebattle' | 'seasonal'
interface EventDef {
  id: string; kind: EventKind; enabled: boolean
  priority: number                 // 1 = top. Defaults: seasonal 1, raid 3, rebattle 4, wheel 5
  schedule: { type: 'permanent' } | { type: 'individual', hours: number } | { type: 'shared', start: string, end: string }
  unlock: { kind: 'areaCleared', areaId: string } | { kind: 'leagueBeaten' } | { kind: 'none' }
  banner: { background: string; sprite?: string }   // any existing battle/area background
  rules: string[]                  // 2–4 string ids from strings.csv (text stays in the CSV, see localization rule)
}
```
- `src/engine/events.ts` (pure): `eventsUnlocked(save, data)`, `activeEvents(save, data, now)` sorted by priority, `eventNeedsAttention()` (gold dot: free spin waiting, new raid, rebattle tier open), `eventUnlockDue()` for the pop-up queue.
- Events teaser visible from the 3rd Kanto badge (`events.teaserBadges`, default 3).

### Server time (UTC)
- New migration `00xx_events.sql`: table `event_state(user_id, wheel_day date, raid jsonb, raid_history jsonb, rebattle jsonb, updated_at)` + security-definer RPCs. `server_day()` returns the current UTC date and seconds to midnight.
- Signed-in players: every daily decision (spin allowed, raid of the day) is checked by an RPC.
- **Everyone, guests included, reads the real time online:** `server_day()` is callable without sign-in (anon RPC), with the HTTP `Date` header of the site as a fallback. The client keeps the offset to its own clock. Changing the device clock does nothing. Offline → event cards show "Connect to the internet" until the time is known. Guests' spin/raid state still lives in their local save (as all guest progress does).

### Home + Events screen
- **One square widget per open event** in the Home grid, after the Secret area, Day Care and Versus, in priority order, each with its own icon (user's call, 2026-10-10, replacing the stack):
  - **Raid:** the raid Pokémon of the day, the time left, the number of tries, and a CAUGHT tag once caught.
  - **Rebattle:** the next Elite Four member or Champion to fight, with the tier and the fight number.
  - **Wheel:** a horizontal carousel of the prizes, scrolling on its own (the prize art only and larger, with no ₽ or quantity values), and the spin status.
  - Before the first event: one locked teaser square.
- Route `/events/:id`: **one page per event, no tabs between events** (user's call, 2026-10-10): each Home widget opens its own event. The page opens on the event's title banner (its picture, the title, the live status) with a back button to Home.

### Unlock pop-up
- **The rule texts read the admin numbers** (prizes and the rarest one's odds, HP bars, the raid's type matchups, level cap, friends per raid, gift cap, tier levels and gold multipliers), so a rebalance shows up in the pop-up.
- `EventUnlockPopup` in `GameLayout`, queued after Day Care → leaderboard → donation → share (same `*Due` + `run.phase === 'idle'` pattern). The layout: a banner with the admin background + the event's art and title, 2–4 rule sections (icon + heading + one or two lines), then **GO** → `/events/:id`. Seen flag in the save: `eventsSeen: string[]`.

### Admin
A new **Events** section in `AdminApp` (the config is too large for a ConfigSection box):
- Per event: enabled, priority, unlock area (area picker), schedule, banner background (picker with previews), rule sections (choose 2–4 string ids, with a preview).
- Wheel, Raid and Rebattle sub-panels (below), each with a live preview.
- Dev tools: "reset my spin", "rotate my raid now", "force raid species", "grant helper reward", "reset rebattle".

## 2. Event 1 — Fortune Wheel (permanent, priority 5)

> **Since 2026-10-25 the wheel takes tickets** (the user's design; this replaces "once per UTC day" and the server draw
> below, which stays as history):
>
> - **Tickets.** A spin costs one. One free ticket every **12 h**, **4** held at most (at 4 the clock stops, as the
>   Underground's free kits do); more for **₽200** each while fewer than 4 are held. A save that never spun starts
>   with a full stack. Config `events.wheel.tickets: { everyHours, cap, price, maxAverage }`; the save keeps
>   `events.wheelTickets` and `events.wheelTicketAt` (when the next free one comes, on the server's clock).
> - **Drawn on the device**, for guests and signed-in players alike, on the server's clock (engine/wheel.ts,
>   store/wheel.ts), like the Underground's walls: the tickets, the purse and the prize all live in the save, so a
>   server draw guarded nothing a save can't. `wheel_spin()` stays in the database for older builds; the game no
>   longer calls it, so this change has no SQL to run.
> - **Slices** (`events.wheel.slices`, the old `prizes` key is ignored so the new defaults reach every player): 3 × ₽50,
>   2 × ₽100, 2 Great Balls, ₽150, 2 Ultra Balls, a Rare Candy, ₽500, ₽1,000 — ₽118 a spin on average.
> - **The jackpot slice** (`events.wheel.jackpot`, one slice, won exactly its % whatever the others add up to):
>   **Porygon** Lv.30 at **10 %**; once Porygon is caught, a **shiny Porygon** at **1 %**; once a shiny Porygon is
>   owned, a **Master Ball** at **0.25 %** for good. The stage is read from the Pokédex, the shiny Pokédex and the Boxes
>   (`jackpotStage`), never stored, so a Porygon won at the old Game Corner counts. A Pokémon joins as a catch.
> - **₽150 a spin at most on average**, at every stage: ₽ as is, items at their Mart price, a Pokémon at its stage's
>   `value` (Porygon ₽300, shiny Porygon ₽3,000). The defaults: ₽136, ₽147, ₽120 (`wheelAverage`;
>   tests/engine/wheel.test.ts holds them to it, and the admin's wheel tab turns red above the cap). Cash Flow still
>   boosts the ₽ slices while it runs.
> - **The page:** the tickets chip (held / 4 and the next free one), the jackpot of the moment, the wheel, Info, SPIN,
>   and BUY A TICKET under it. Its rules once on the first open since the change (`events.wheelRulesSeen`; a new player
>   sees them in the unlock pop-up instead), and the banner's Info shows them again. Home's square counts the tickets
>   and fills its gauge toward the next free one.
> - **The Game Corner** (the slot machine on the area cards, Rocket Hideout and the other Game Corner areas) has its
>   own switch since then, `slotMachine.access`, **Off** by default: no Game Corner card is dealt, and Porygon comes from
>   the wheel. Admin → Config → Game Corner turns it back on.

- **Unlock:** Kanto Celadon City cleared (the area that reveals the Game Corner / Rocket Hideout).
- **Once per UTC day.** `wheel_spin()` RPC: checks `wheel_day < today`, rolls the slot on the server from the admin odds, stores the day and returns the slot index. The client animates to that slot and grants the reward into the save. Guests roll locally, but only once the online time is known.
- **Config** `wheel.slices: {reward: {kind:'gold', amount} | {kind:'item', itemId, qty}, odds}[]`. Default (100 %):

| Slices | Reward | Odds per slice |
|---|---|---|
| 4 | ₽10 | 12.5 % |
| 2 | Poké Ball | 12.5 % |
| 1 | Great Ball | 12.5 % |
| 1 | Ultra Ball | 10 % |
| 1 | Master Ball | 2.5 % |

  The admin warns when the odds don't sum to 100 and normalises them. The wheel is generated from the list: 9 equal slices with the defaults (4 + 2 + 1 + 1 + 1), spread out so that identical rewards don't sit side by side.
- **UI:** the wheel drawn at screen resolution (clean slice edges, gold rim with pegs), the prize art upright on each slice at a whole-number scale and the amounts in Jersey 20, so nothing blurs. No prize list under it: the wheel shows them. Below the wheel: a blue **Info** button (the odds pop-up) next to SPIN. When spent: "Come back tomorrow · Next spin in 7 h 12".
- **Juice (mocked in the Visual Lab):** marquee bulbs on the fixed outer ring (slow chase when idle, racing while spinning, all blinking on a win) and rotating rays behind the wheel; a wind-up creak backwards, a whoosh, ~5.6 s of out-quart with motion blur at speed and sparks off the pegs at each tick (pitch falling), a last-slice teeter; on landing a clack and a shake, the winning slice blinks while the others go dark, the prize pops out of its slice and grows in the middle, coins and stars burst; Ultra / Master Ball = jackpot (white flash, purple-white rays, coin shower, fanfare); then the reward card.

## 3. Event 2 — Raid Battles (individual, 24 h, priority 3)

### Unlock and rotation
- **Unlock:** Kanto Safari Zone cleared.
- **There's always a raid.** It rotates at UTC midnight. `raid_today()` RPC: the first call of the day picks the raid from the candidate list the client sends (validated against the cloud save), stores it, and returns the same raid all day.
- **Picking order** (`pickRaid` in `src/engine/raid.ts`, deterministic from user id + date):
  1. **Available legendaries:** in your raid pool (their area is cleared), not owned → random.
  2. None available, **all pool legendaries owned** → their **shiny** versions you don't own.
  3. Otherwise (the rest are still locked behind areas) → the **fallback pool**, 30 % shiny.
  - Never the same species as any raid in the **last 72 h** (relaxed only if nothing else is left).
- **The raid pool is not listed on the Raids tab.** Instead the **Pokédex** says it under "Where to find it": a pool species shows "Clear Faraway Island to unlock its raid" (or "In your raid pool", with GO to the raids); a fallback species shows that it can come up when the pool is empty.
- **Raid pool (default, 23):** Mew, Celebi, Jirachi, Deoxys, Rayquaza, Latios, Phione, Manaphy, Shaymin, Arceus, Cresselia, Victini, Keldeo, Meloetta, Genesect, Diancie, Hoopa, Volcanion, Meltan, Magearna, Marshadow, Zeraora, Zarude. All of them are bosses in today's areas (Faraway Island, Ilex Shrine, Birth Island ×2, Sky Pillar, Southern Island II, Seabreak Path ×2, Flower Paradise, Hall of Origin, Fullmoon Island, Liberty Garden, Moor of Icirrus, Castelia Café, P2 Lab, Diamond Domain, Hoopa's Ring, Nebel Plateau, Mystery Box, Magearna's Workshop, Ten Carat Hill, Blush Mountain, Forest of Focus). Admin can add or remove species.
- **Fallback pool (default), each gated by its region being reached:** Dragonite, Tyranitar, Salamence, Metagross, Garchomp, Hydreigon, Goodra, Kommo-o, Dragapult, Baxcalibur + Gyarados, Snorlax, Lapras, Volcarona, Lucario, Aegislash, Kingambit. Editable.

### Area changes
- For each pool species, `legendaryBoss` loses it and the area gets `raidUnlock: dex[]`.
- Areas left with no content (`roundsToClear: null`) get **2 normal rounds** (wild decks already exist or get built from their encounter list).
- On clear: a "Raid unlocked!" moment (the legendary's silhouette flies up into the Events card). The species joins the save's `raidPool`.
- Mew already caught: the area still clears and the species still joins the pool (it then only comes back as a shiny raid).
- Old saves that already beat or caught these legendaries: they're added to `raidPool` on load.

### Teams
- **My raid team:** 3 Pokémon, cloned at ≤ Lv.50 (like Versus), registered on the Raid tab. **The cap leaves the dice and rerolls alone** (the user's rule, 2026-10-18): a Lv.80 Pokémon in a Lv.50 raid fights and shows at Lv.50 (its HP, its level) with its Lv.80 dice and rerolls (`raidSeedLevels`, engine: a battler seed's `diceLevel`). Friends' teams alike: since 0065 the server keeps their own levels and the game caps them in the fight (a team registered before keeps its capped ones until its owner registers it again). The editor shows "Lv.50 (80)".
  - Setting it up: run `supabase/migrations/0065_raid_true_levels.sql` in Supabase → SQL Editor (also inlined in `supabase/seed.sql`): https://github.com/Splifingald/pokedice/blob/feature/version_2/supabase/migrations/0065_raid_true_levels.sql
- **Registration:** The cloud table `raid_teams` is built server-side from the cloud save, like `versus_teams`. You can change it at any time, including after you've caught today's raid. It stays available to friends. Its editor (the progression raids' too) lists the Box with a search and two dropdowns (user's request, 2026-10-16): **sort** by Recommended (the default), Highest level, Pokédex No. or Name (A–Z), and **type** (All types, or one of the types the list holds). Picks the search or the type hides stay picked.
- **Recommended (user's rule, 2026-10-16):** a Pokémon at Lv.50 or more (a raid capped lower: at its cap) with a typed die that hits the raid Pokémon super effectively on the type chart (`raidRecommended`, engine). It wears a **green thumb** in the editor (its row and its slot), on your raid team, on your friends' teams in the group and its picker, and on the NPC trainers' Pokémon in their pop-up; a line under the dropdowns says the rule. The Recommended sort lists them first by Pokédex No., then the rest strongest first.
- **Raids tab layout (user's call, 2026-10-10):** the raid Pokémon card, then START THE RAID right under it, then your raid team, then your group. No explanation of why this raid was picked.
- **Allies:** pick **up to 2 friends** whose raid teams are registered (friend list with their 3 minis + "helped you N times"). Unpicked slots show as **empty** in the group; NPCs never fill them on the tab. Starting with empty slots first shows a pop-up: *"The empty slots in your group will be filled with NPC, invite friends next time!"* (Back / Start). Only then do **NPC trainers** fill them (admin list; default: random fully evolved, non-legendary, non-mythical, non-starter-line, non-pseudo Pokémon at Lv.50 with a trainer class sprite).

### The battle (new `src/engine/raid.ts` + `RaidView`)
- **Display (user's call, 2026-10-10): the classic battle layout.** The raid Pokémon in front at the top right and one ally in front at the bottom left, with the usual plates. The ally whose side plays steps to the front and stays there while the raid Pokémon strikes back. **Bottom left:** the allies coming next, with their owner's name. (Until 2026-10-13 the summons waited at the top right, and you tapped one to aim at it.)
- **Background (user's call, 2026-10-10):** the raid is fought in front of **the picture of the area that unlocked it** (Mew: Faraway Island), cut like any battle (`pictureOf(areaId)` + `battleWindow` in `src/fx/areaArt.ts`). The raid card on the Raids page uses the same picture and names the area. A fallback raid (no unlocking area) uses an area where the species lives; the raid definition carries `areaId` for this.
- **Sides:** you, friend A and friend B, one Pokémon out each. A side sends its next Pokémon when its active one is K.O.'d. A side with all 3 down is out. The raid is lost when all 3 sides are out.
- **Turns (user's redesign, 2026-10-13):** a fixed order, speed plays no part. Each round, the sides still in play in order — **you first**, then side 2, then side 3 — and **the raid Pokémon strikes back right after each one**, at the side that just played (or, when that side has just gone out, at the next one still in). So it hits them one by one: you → it hits you → side 2 → it hits side 2 → side 3 → it hits side 3. On your turn you roll, reroll and attack it — or **switch** to another of your raid team, which costs the turn as in a battle (user's request, 2026-10-11). Items: one per turn on your own side. A **speed button** under the fight plays the ally sides' turns 1.5× faster; the raid Pokémon's turns and yours keep their pace (same request). Friend and NPC sides use `autoEvents`; the raid Pokémon uses `AI_TURN`.
- **HP bars:** `raid.bars` (default 3), each `raid.barHp` (default 2.2) × its max HP at Lv.50. Colours from `raid.barColors` (default green / yellow / red). A bar break: a screen shake, the bar shatters, the boss roars.
- **Type matchups** (raids only, `raid.sideTypes` and `raid.bossTypes`, user's design 2026-10-13): what a super-effective, a resisted and a blocked hit land at instead of ×2, ×½ and ×0. The sides' attacks: ×1.3 / ×0.5 / ×0. The raid Pokémon's: ×2 / ×0.7 / ×0.5 — nobody is immune to it. The battle readout and its "super effective" banners read the same numbers.
- **Dice/upgrade level** of the boss: `raid.upgradeLevel` (8). Status effects work as usual.
- **No summons** (since 2026-10-13): until then it started with 2 beside it and called more with points from each broken bar (2 on the field at most); players found it hard to follow.
- **Win:** the boss is K.O.'d → **catch** as usual (ball picker, d6 + ball ≥ catch value; the raid catch value is per species in admin, defaulting to the species' value). Caught → the raid is closed for today (the card shows "Caught! Next raid in …"). Failed → the raid stays open; fight again from full.
- **Helper rewards:** only when the raid Pokémon is **caught** (the raid stays open until then), each friend side used in the catching fight gets a reward row (`raid_helps`). On the helper's next login: "Your team helped Alex beat Mew! +1 Ultra Ball". **Max 5 per helper per day** (`raid.helperDailyCap`). Default reward odds: Ultra Ball 40 %, Hyper Potion 25 %, Revive 20 %, Rare Candy 15 % (admin table).
- **Juice:** a raid card with the timer. **An over-the-top opening** before every raid (~6 s, Skip at any time; mocked in the Visual Lab): alarm with hazard tapes · storm with lightning · the silhouette rising with a glowing outline · a pillar of light · white-out reveal with shockwaves, debris, embers and a roar · the name slams down and the HP bars fill one by one · the three trainers cut in on slanted panels with their lead Pokémon · GO!; bar break shatter + flash + shake; the existing catch animation with an extra wobble.

### Leaderboard: Raids won (user's request, 2026-10-10)
- A **fifth leaderboard tab, "Raids"**, after Max level, Progression, Pokédex and Shiny: the number of raids won, where **won means the raid Pokémon was caught**. A raid beaten but not caught doesn't count. No Hall of Fame (no maximum).
- Server: each catch is recorded in `event_state.raids_won` by the RPC that closes the raid (`raid_close(caught)`), so the count can't be raised from the client save. `player_cards` gets `raids_won`, and `leaderboard()` returns it with a `raids` sort. Guests appear on no board, as today.

### Admin (Raid panel)
Pool and fallback lists with region gates; shiny chance (30 %); repeat window (72 h); bars and colours; start allies; points per break; max on field (2); boss level (50); upgrade level (7); team level cap (50); max friends per raid (2); per-species catch values; NPC ally rules or list; helper reward table and daily cap; and a simulator button (win rate of N sample teams vs a chosen raid, using `pnpm balance` machinery).

## 4. Event 3 — Elite Rebattle (individual, priority 4)

- **Removal:** delete Victory Road II + League II (or the region's equivalent) in Kanto, Johto, Sinnoh, Unova, Kalos, Alola (Mount Lanakila II + League II) and Galar (Wild Area II + Champion Cup II). Hoenn and Paldea have none. **Johto's Mt. Silver** is re-chained right after Indigo Plateau. Their trainers are kept as data for the Champion slot, then removed once copied.
- **Save migration:** progress for the deleted areas is dropped. Pokémon, items and ₽ are untouched. If the current area was one of them → the region's League I area. Nothing is credited to Rebattle.
- **Unlock:** a region's tier 1 opens when that region's League I Champion is beaten. Tier n+1 opens when tier n is beaten. The event card shows while any unlocked region has an unbeaten tier.
- **Tiers** (`rebattle.tiers`):

| Tier (medal) | Levels | Gold | Foe upgrade level |
|---|---|---|---|
| Bronze (bronze diamond) | League I + 10 | ×1 | League + 1 |
| Silver (silver pentagon) | League I + 20 | ×1.5 | League + 2 |
| Gold (gold hexagon) | League I + 30 | ×2 | League + 3 |
| Diamond (blue circle) | everyone Lv.100 | ×3 | max |

The tiers are named Bronze, Silver, Gold and Diamond and drawn as their medals, with no I / II / III (user's call,
2026-10-10; Diamond added 2026-10-11, the levels and ₽ re-spread over four tiers). The Home widget shows the current
tier's medal. The live database got the four tiers from `supabase/migrations/0041_rebattle_diamond.sql` and the
roster teams from `0043_rebattle_rosters.sql` (`pnpm rebattle-sql`, both applied 2026-10-11); saves keep their place
(a player past the old Gold, Lv.100, now faces Diamond).

- **Teams:** generated per region by a script (`scripts/rebattle-teams.ts`) into `trainers.json`. Each tier is a copy of the E4 member. **Trainers keep three Pokémon at most:** League I's ace, last, in every tier, and two from the member's **roster in the games** (`ROSTERS`: their five or six, plus their League I ones), a different pair each tier, so every rematch brings a different team (user's call, 2026-10-11). The pairs go round before one comes back: a member with only three to choose from (Kanto's Bruno, Agatha and Lance, Unova's and Kalos's Elite Four…) fights Diamond with Bronze's pair at Lv.100. A member with fewer than three (Emerald's Phoebe and Glacia) is topped up with Pokémon of their type from their region. All of them are hand-editable in the admin team editor. Champion slot = **the rival** (`rivalOf`, per starter) where League II had one (Kanto); elsewhere the League II champion.
- **Gauntlet:** the 5 fights back to back, no Center, items allowed. A loss → back to member 1 of that tier; ₽ already won is kept. **Each trainer pays once per tier (user's rule, 2026-10-10):** beaten again after a restart, they give no ₽. The save keeps the paid trainers per tier (`rebattle.paid`, e.g. `kanto:1:lorelei`), the ladder shows "₽ already paid", and the rules pop-up says so. The Events tab shows the 5 portraits with check marks and the tier medallions (bronze / silver / gold / diamond).
- **Juice:** a tier medallion stamp, a "Hall of Fame"-style finale per tier, a rising-pitch walk-in for each member.

## 5. Visual Lab mockups (next step, before code)

`design/visual-lab/events.js` + links from `home.js`, with a preview-save switch: *Teaser*, *Wheel only*, *Wheel + Raid*, *All three*:
1. Home with the events stack (1, 2 and 3 cards; teaser state).
2. The unlock pop-up (banner + rules + GO) for each event.
3. Wheel: idle, spinning (playable, with sound), the reward, spent with a countdown, the odds pop-up.
4. Raid tab: today's raid card, my raid team, the friend picker with NPC fill.
5. Raid battle: 3 sides vs boss + 2 summons; target pick; bar break; summon; the boss K.O. + fleeing; the catch; a playable mini loop.
6. Helper reward pop-up.
7. Rebattle tab: tiers per region, gauntlet progress, medallion.
8. A light mock of the admin Events panel (wheel editor with live wheel, raid params).

Then republish the Visual Lab artifact (same URL) for review.

Mockups built in `design/visual-lab/events.js` (2026-10-10), published as the "Pokédice Special Events" artifact: https://claude.ai/artifact/YQBKNUaEzpGaUojcga8cfA. Not merged into the main Visual Lab artifact, which another branch republished with a Backgrounds tab.

## 6. Implementation phases (after the mockups are approved)

1. **Framework:** `events` config + defaults, `events.ts`, Events stack on Home, `/events` screen, unlock pop-up queue, admin Events section shell, migration + `server_day()`, strings in `strings.csv` (en/fr/es/de).
2. **Wheel:** engine, RPC, UI + juice, admin editor, tests.
3. **Elite Rebattle:** the area deletion + save migration, the team generator, the gauntlet flow, gold multipliers, admin, tests + `pnpm balance` check of tier win rates.
4. **Raids, data:** the legendaries leave their areas, rounds for emptied areas, `raidPool` save field + migration, `pickRaid`, `raid_today()`.
5. **Raids, battle:** the multi-side engine (the biggest piece), `RaidView`, summons and bars, catch, sims for balance (target: about 50–70 % wins with an average team + 2 NPC sides).
6. **Raids, social:** `raid_teams`, the friend picker, `raid_helps` + the login pop-up + the daily cap.
7. **Polish:** juice pass, e2e (phone layout, axe, fonts), full SQL hand-over script for Supabase.

Each phase ends with tests, `e2e/layout.spec.ts` green and a commit on `feature/version_2`.

## 7. Resolved after review (2026-10-10)

1. Wheel unlocks on **Celadon City** cleared, not the hidden Rocket Hideout.
2. Real time is read online for everyone (anon RPC / `Date` header); offline waits.
3. Summons follow the NPC-ally exclusions.
4. Helper rewards only on a **catch**.
5. Losing the Victory Road II levelling stretch is fine.
