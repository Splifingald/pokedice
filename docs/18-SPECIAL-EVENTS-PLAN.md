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
| Raid party | **You + up to 2 friends, 3 Pokémon each (9 in total)**. Each side has **one Pokémon out at a time** → 3 on the field vs the raid Pokémon + its summons. |
| Raid control | You roll for your side; friend sides auto-play (auto-mode AI). |
| Raid team | Its **own registration**, separate from Versus, **capped at Lv.50**. |
| No friends / guest | **NPC allies** fill empty sides: never legendary, never mythical, never a starter line, never a pseudo-legendary, always fully evolved. |
| Retries | Unlimited during the 24 h; a failed catch keeps the raid open (fight again from full). |
| HP bars & summons | Starts with **2 allies**. Each broken bar grants **summon points (default 2)**, spent whenever a slot next to it is free. **Never more than 2 summons on the field.** All admin. |
| Raid level | Raid Pokémon and summons **Lv.50**. Difficulty from the bars, the summons and a **dice/upgrade level (admin, default 7)**. |
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
- **The rule texts read the admin numbers** (prizes and the rarest one's odds, HP bars, allies, summons per break, the cap beside it, level cap, friends per raid, gift cap, tier levels and gold multipliers), so a rebalance shows up in the pop-up.
- `EventUnlockPopup` in `GameLayout`, queued after Day Care → leaderboard → donation → share (same `*Due` + `run.phase === 'idle'` pattern). The layout: a banner with the admin background + the event's art and title, 2–4 rule sections (icon + heading + one or two lines), then **GO** → `/events/:id`. Seen flag in the save: `eventsSeen: string[]`.

### Admin
A new **Events** section in `AdminApp` (the config is too large for a ConfigSection box):
- Per event: enabled, priority, unlock area (area picker), schedule, banner background (picker with previews), rule sections (choose 2–4 string ids, with a preview).
- Wheel, Raid and Rebattle sub-panels (below), each with a live preview.
- Dev tools: "reset my spin", "rotate my raid now", "force raid species", "grant helper reward", "reset rebattle".

## 2. Event 1 — Fortune Wheel (permanent, priority 5)

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
- **My raid team:** 3 Pokémon, cloned at ≤ Lv.50 (like Versus), registered on the Raid tab. The cloud table `raid_teams` is built server-side from the cloud save, like `versus_teams`. You can change it at any time, including after you've caught today's raid. It stays available to friends.
- **Raids tab layout (user's call, 2026-10-10):** the raid Pokémon card, then START THE RAID right under it, then your raid team, then your group. No explanation of why this raid was picked.
- **Allies:** pick **up to 2 friends** whose raid teams are registered (friend list with their 3 minis + "helped you N times"). Unpicked slots show as **empty** in the group; NPCs never fill them on the tab. Starting with empty slots first shows a pop-up: *"The empty slots in your group will be filled with NPC, invite friends next time!"* (Back / Start). Only then do **NPC trainers** fill them (admin list; default: random fully evolved, non-legendary, non-mythical, non-starter-line, non-pseudo Pokémon at Lv.50 with a trainer class sprite).

### The battle (new `src/engine/raid.ts` + `RaidView`)
- **Display (user's call, 2026-10-10): the classic battle layout.** One foe in front at the top right and one ally in front at the bottom left, with the usual plates. Whoever plays steps to the front: on an ally's turn, that ally and the raid Pokémon; on a foe's turn, that foe and the ally it targets. **Top right:** the foes coming next (the raid Pokémon or its summons), in turn order. **Bottom left:** the allies coming next, with their owner's name. A hit on a foe waiting in the queue brings it to the front for the hit, then it goes back to its place.
- **Background (user's call, 2026-10-10):** the raid is fought in front of **the picture of the area that unlocked it** (Mew: Faraway Island), cut like any battle (`pictureOf(areaId)` + `battleWindow` in `src/fx/areaArt.ts`). The raid card on the Raids page uses the same picture and names the area. A fallback raid (no unlocking area) uses an area where the species lives; the raid definition carries `areaId` for this.
- **Sides:** you, friend A and friend B, one Pokémon out each. A side sends its next Pokémon when its active one is K.O.'d. A side with all 3 down is out. The raid is lost when all 3 sides are out.
- **Turns:** in order of speed over everyone active. On your turn you roll, reroll, pick a **target** (the raid Pokémon or a summon), and attack. Items: one per turn on your own side. Friend and NPC sides use `autoEvents` with target choice (the boss unless a summon is about to K.O. someone). The boss and its summons use `AI_TURN` and target a random active side, **never the same player twice in a row** (across all foe attacks; relaxed when only one side is left).
- **HP bars:** `raid.bars` (default 3), each = 1 × max HP at Lv.50. Colours from `raid.barColors` (default green / yellow / red). A bar break: a screen shake, the bar shatters, the boss roars, it **gains `raid.summonPerBreak` (2) summon points**.
- **Summons:** 2 at the start (`raid.startAllies`). Whenever a slot is free at the start of the boss's turn and it has points, it spends 1 to summon. **Max 2 on the field** (`raid.maxField`). Summons come from the boss's region, fully evolved, random, never sharing a type with the boss, and follow the NPC-ally exclusions (no legendary, mythical, starter line or pseudo-legendary), Lv.50.
- **Dice/upgrade level** of the boss and its summons: `raid.upgradeLevel` (7). Status effects work as usual.
- **Win:** the boss is K.O.'d → summons flee (animation) → **catch** as usual (ball picker, d6 + ball ≥ catch value; the raid catch value is per species in admin, defaulting to the species' value). Caught → the raid is closed for today (the card shows "Caught! Next raid in …"). Failed → the raid stays open; fight again from full.
- **Helper rewards:** only when the raid Pokémon is **caught** (the raid stays open until then), each friend side used in the catching fight gets a reward row (`raid_helps`). On the helper's next login: "Your team helped Alex beat Mew! +1 Ultra Ball". **Max 5 per helper per day** (`raid.helperDailyCap`). Default reward odds: Ultra Ball 40 %, Hyper Potion 25 %, Revive 20 %, Rare Candy 15 % (admin table).
- **Juice:** a raid card with the timer. **An over-the-top opening** before every raid (~6 s, Skip at any time; mocked in the Visual Lab): alarm with hazard tapes · storm with lightning · the silhouette rising with a glowing outline · a pillar of light · white-out reveal with shockwaves, debris, embers and a roar · the name slams down and the HP bars fill one by one · the three trainers cut in on slanted panels with their lead Pokémon · GO!; bar break shatter + flash + shake; summon portal; summons fleeing; the existing catch animation with an extra wobble.

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
| Bronze (bronze diamond) | League I + 10, with some Pokémon swapped | ×1.5 | League + 1 |
| Silver (silver pentagon) | League I + 25 | ×2 | League + 2 |
| Gold (gold hexagon) | everyone Lv.100 | ×3 | max |

The tiers are named Bronze, Silver and Gold and drawn as their medals, with no I / II / III (user's call, 2026-10-10). The Home widget shows the current tier's medal.

- **Teams:** generated per region by a script (`scripts/rebattle-teams.ts`) into `trainers.json`. Each tier is a copy of the E4 member. **Trainers keep three Pokémon at most:** tier 1 swaps one Pokémon for another signature-type pick, tier 2 swaps another, tier 3 is three at Lv.100. The ace goes last. All of them are hand-editable in the admin team editor. Champion slot = **the rival** (`rivalOf`, per starter) where League II had one (Kanto); elsewhere the League II champion.
- **Gauntlet:** the 5 fights back to back, no Center, items allowed. A loss → back to member 1 of that tier; ₽ already won is kept. **Each trainer pays once per tier (user's rule, 2026-10-10):** beaten again after a restart, they give no ₽. The save keeps the paid trainers per tier (`rebattle.paid`, e.g. `kanto:1:lorelei`), the ladder shows "₽ already paid", and the rules pop-up says so. The Events tab shows the 5 portraits with check marks and the tier medallions (bronze / silver / gold).
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
