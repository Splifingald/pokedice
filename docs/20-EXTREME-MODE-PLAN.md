# Extreme mode — plan (for validation)

Status: **built** on branch `feature/extreme-mode` (from `feature/version_2`), not merged yet. Mockups: a design
canvas, https://claude.ai/artifact/Vq8m9ru7sxYC3HEr27RgRz. Online, it needs migration `0039_extreme_realm.sql` (until it
runs, the Extreme save stays on the device and the main game syncs as before).

## 0. The ask, and the decisions

> A secondary save, **Extreme mode**, open once the player has finished the **second league**. A rules pop-up. Completely
> separate from the normal save: Extreme players can't interact with the others and vice versa, **like a different
> server**. **No Pokémon Centers.** A **K.O. Pokémon takes 12 hours to come back to 1 HP.** Any Pokémon **heals 10 % HP
> per hour while the player is out of the app**, and only then. These are **admin parameters**.

Asked in the Q&A of 2026-10-11 (§9), unless marked *plan*:

| Topic | Decision |
|---|---|
| "Second league" | The **Johto League** (the second region's). League II no longer exists (0036). An admin setting picks the region. |
| Starting an Extreme save | A **fresh new game in Kanto**: the lab and a partner, ₽ and bag at their new-game values. Only the trainer's look and name are offered again (editable). Nothing carries over. |
| Friends | **Same friends, play apart.** One friend ID and one friend list for both saves. Whatever you see of a friend, or do with one, uses their save in the world you're playing: their card, team, Day Care, Versus team, raid team. A friend without an Extreme save shows "Not in Extreme mode" there. |
| Everything else online | **Per world**: save, trainer card, leaderboard, Versus, Day Care visitors, special events, raids. |
| Special events | **On, with their own progress**: each save has its own daily spin, raid and Rebattle tiers; prizes land in that save. A player with both saves gets one spin a day in each. |
| Items | **Potions and Revives work as usual** (the way out of a team that's all K.O.). One admin switch turns them off. |
| Leaving mid-fight | **Heal after the fight**: the fight is kept as it was; the time away still counts and heals once it ends. |
| Sign-in | *Plan:* **not required**, as in the main game. The timers run on the server's clock, which guests already get (`serverTime.ts`). |

## 1. The rules

### 1.1 Opening it

- Extreme mode opens when the **main save** has the unlock region's league done (`leagueDone(save, data, unlockRegion)`,
  in the live block or a parked one). The moment is stamped in the main save (`extremeUnlockedAt`), so it never closes
  again, even if an admin later switches that region off.
- The **rules pop-up** (§4) opens once, at the next calm moment after the league (it queues behind the league-cleared
  pop-up and the new-region prompt, like the other one-time pop-ups). **Later** closes it; **Start Extreme mode**
  goes to the new Extreme save.
- An admin switch (`extreme.enabled`) hides the mode everywhere: no pop-up, no title card, no menu row. An Extreme
  save that already exists is kept and comes back when it's switched on again.

### 1.2 No Pokémon Centers

- The encounter deck never deals a `center` card (`buildDeck` takes `center: 0` in Extreme; `encounterDue` never
  returns `'hurt'`, `'fainted'` or `'round'` → center). The "easy areas send a Center next" rule is off.
- **A wipe no longer heals.** The round is lost as today (back to the area's start, deck dropped, levels/items/₽
  kept), but the team stays as it is: K.O. and on the clock. `applyWipe(…, { heal: false })`.
- The Center's other job, team management, stays on the Team screen, where it already is.

### 1.3 K.O. lasts 12 hours

- When a fight ends, every Pokémon at 0 HP gets `koAt` (server time). It comes back at **`koReviveHp` HP (1)**
  **`koHours` (12) hours later**, whether the app is open or not. Revived during the fight by an item: no timer.
- While down it can't battle (as today at 0 HP), can be moved between team and Box, and shows its countdown
  everywhere it appears: team pips, team cards, the Box, its sheet ("Back at 1 HP in 11 h 42 m").
- A **Revive / Max Revive** clears the timer at once (unless the admin turns items off).
- The check runs where fossils are checked today (`tickFossils`: on load, every minute, on return to the tab).
- **Whole team down**, nobody able in the Box: CONTINUE turns into "Your team is resting" with the first comeback's
  countdown, and two ways out: **Team** (swap in from the Box) and **Poké Mart** (Revives). Never a dead end without a
  timer on it.

### 1.4 Healing only while away

- Every Pokémon above 0 HP, team and Box, heals **`awayHealPctPerHour` (10 %) of its max HP per hour** spent **out of
  the app**, counted to the minute (10 % an hour = 1 % every 6 minutes), rounded down, never above max.
- "Out of the app" = the page hidden or closed. The save keeps `awayFrom` (server time) when the page goes hidden or
  away (`visibilitychange`, `pagehide`, where the save is already flushed today). On load and on return, the time
  since `awayFrom` heals, and `awayFrom` is cleared. Absences under `awayMinMinutes` (2) don't count, so switching
  apps for a second doesn't nibble HP back.
- A Pokémon that came back from K.O. during the absence heals only for the part after its comeback.
- **Server time only**: changing the device clock changes nothing. Until the server time is known (offline), the heal
  waits; `awayFrom` stays put.
- Leaving in the middle of a fight: the fight's HP aren't touched. The heal is applied when the fight ends.
- *Decided while building*: switching to the main save counts as leaving the Extreme one — the time spent playing the
  main game heals the Extreme team, as time away from it.
- A **"While you were away"** card says what happened, once: how long, how much each Pokémon healed, who's back from
  K.O. It only shows when something changed.

### 1.5 A world of its own

- Two saves on the device and in the cloud: **Main** and **Extreme**. One is active at a time; switching reloads the
  page (the stores hold one save's friends, events and Versus in memory, as the delete button already handles).
- Online, every player-facing table but the friend list is split by **realm** (`'main' | 'extreme'`), so an Extreme
  player only ever meets Extreme saves: their own leaderboard (all four boards), Versus opponents, Day Care visitors,
  raid helpers and gifts, the Fortune Wheel's daily spin.
- **Friends are shared**: the same friend ID and list in both worlds, added from either. In Extreme, a friend's card,
  Day Care, Versus and raid team are their Extreme ones; a friend who has no Extreme save is listed greyed, "Not in
  Extreme mode", and can't be visited, fought or brought to a raid. Their main save is never shown in Extreme, and the
  other way round.
- The two saves never exchange anything: no Pokémon, items, ₽, Pokédex or badges either way.

## 2. Admin parameters

One `game_config` row, `extreme`, edited in **Admin → Config → Extreme mode** like the Day Care's. Defaults in
`DEFAULT_CONFIG.extreme`; any missing key falls back to them.

| Key | Default | What it does |
|---|---|---|
| `enabled` | `true` | Off hides the mode everywhere (saves are kept). |
| `unlockRegion` | `'johto'` | The region whose league opens Extreme mode ("the second league"). |
| `centers` | `false` | Pokémon Centers in the deck. |
| `wipeHeals` | `false` | A lost round heals the team, as in the main game. |
| `koHours` | `12` | Hours before a K.O. Pokémon comes back. |
| `koReviveHp` | `1` | HP it comes back with. |
| `awayHealPctPerHour` | `10` | % of max HP healed per hour away. `0` = no healing at all. |
| `awayMinMinutes` | `2` | Shorter absences don't heal. |
| `items` | `true` | Potions and Revives usable. |

The panel shows what the numbers mean, from the engine (no maths in the UI): "A K.O. Pokémon is back at 1 HP after
12 h. From 1 HP to full while away: about 10 h."

Dev tools (admins, DevToolsSection): **Unlock Extreme**, **Switch save**, **Skip 1 h away**, **End K.O. timers**.

## 3. Data model

### 3.1 Engine (`src/engine`, pure)

- `PokemonInstance.koAt?: number` — when it went down (ms, server time). Absent = not on the clock.
- `SaveData.mode?: 'main' | 'extreme'` — unset = main, so every save from before is main.
- `SaveData.extreme?: { awayFrom?: number }` on an Extreme save; `SaveData.extremeUnlockedAt?: number` and
  `extremeRulesSeen?: boolean` on the main one.
- New `src/engine/extreme.ts`: `extremeUnlocked(save, data)`, `tickKo(save, now, data)`, `awayHeal(save, from, to,
  data)` → `{ save, healed: [{id, hp}], back: [id] }`, `koCountdown(inst, now, data)`, `extremeRules(data)` (the
  numbers the pop-up shows). `buildDeck`, `encounterDue`, `applyWipe` read `save.mode` and the config.
- `GameConfig.extreme: ExtremeConfig`; `src/save/schema.ts` accepts the new fields (zod, optional).

### 3.2 On the device

| Key | Holds |
|---|---|
| `pokedice.save` | The main save, as today |
| `pokedice.save.extreme` | The Extreme save |
| `pokedice.slot` | `'main'` or `'extreme'`: which one loads |
| `pokedice.save.backups` / `.extreme.backups` | Each save's backups |

`readSave` / `writeSave` take the slot. Settings (language, theme, sound) are the device's, shared.

### 3.3 Online (migration `0039_extreme_realm.sql`)

- `realm text not null default 'main' check (realm in ('main','extreme'))` on `saves`, `player_cards`,
  `player_card_regions`, `versus_teams`, `versus_battles`, `event_state`, `raid_teams`, `raid_gifts`. Primary keys
  gain `realm` (`saves (user_id, realm)`, …). Existing rows are `main`.
- `friend_codes`, `friendships` and `friend_attempts` stay as they are: friends are the same in both worlds.
- Every function that shows or touches a friend's game, or your own, takes `p_realm text default 'main'`:
  `friend_list` / `friend_profile` (the cards of that realm, and whether the friend has one), `friend_day_cares`,
  `leaderboard()`, `versus_*`, `wheel_spin`, `raid_*`; the `saves_card` trigger writes the card of the save's own
  realm. `friend_code`, `friend_add`, `friend_remove` don't need it. The default keeps clients that haven't updated
  working on the main world.
- `delete_my_data()` (0038) deletes both realms; a new `delete_my_data(p_realm)` deletes one (§5).
- Analytics: the daily ping carries the realm in its snapshot; the admin's player view shows both saves.
- Tested on PGlite like 0033–0038: two friends, one with only a main save, the other with both, see each other only in
  the world they share; no board, Versus list or raid ever mixes the two.

## 4. The rules pop-up

`RulesModal` + `RuleList` (`FeatureRules.tsx`), the same as the Day Care's and Versus's:

- **Banner**: a night picture (Mt. Silver's art) with a crimson EXTREME plate; a NOW OPEN tag on the unlock.
- **Four rows**, numbers from `extremeRules(data)`:
  1. **A world of its own** — "A new save with its own leaderboard, Versus and events. Your friends come along, but you
     only meet their Extreme saves. Your main save stays as it is."
  2. **No Pokémon Centers** — "Nothing heals you on the road, and losing a round doesn't either."
  3. **K.O. lasts 12 h** — "A Pokémon that faints comes back at 1 HP 12 hours later. Revives still work."
  4. **Rest while away** — "Your Pokémon heal 10 % an hour while you're out of the game. Never while you play."
- On the unlock: **Later** / **Start Extreme mode**. From the INFO button (Extreme Home, the title card, Settings):
  **OK**.

## 5. Screens

| Where | What changes |
|---|---|
| **Title** | With both saves: CONTINUE (main) and a crimson **Extreme mode** card under it (trainer, region, badges). Before the first Extreme game: the card says "New game" and opens the rules pop-up first. |
| **Top bar** | An **EXTREME** chip on the trainer button (crimson, a skull icon), so the world in play is never in doubt. |
| **Trainer menu** | A row **Extreme mode** ("Switch to your Extreme save") or **Main game** in Extreme; a confirm, then the reload. |
| **Home** | Same hub. CONTINUE becomes "Your team is resting · back in 3 h 12 m" when nobody can fight (§1.3). No Center ever appears in the round mix of an area's details. |
| **Team / Box / sheets** | K.O. Pokémon: grey, a moon icon and the countdown; the sheet says "Back at 1 HP in 11 h 42 m" and offers Revive. Team pips show the same. |
| **Battle** | No change in the fight. After a wipe: "Your team is out. No Center in Extreme mode: they rest 12 h." |
| **While you were away** | A card on return: time away, HP healed per Pokémon (a green +n bar), who's back from K.O. |
| **Friends** | The same list in both worlds. In Extreme, each row shows the friend's Extreme trainer and team, or greys out with "Not in Extreme mode". |
| **Settings** | An Extreme section: the rules (INFO), **Delete my Extreme save** (two pop-ups, like Delete all my data; deletes only this world). Delete all my data says it deletes both saves. |
| **Admin → Config** | The Extreme mode panel (§2). |

The mockups show the rules pop-up, the title, Home with the chip and a resting team, a K.O. Pokémon's sheet, the
welcome-back card and the admin panel: https://claude.ai/artifact/Vq8m9ru7sxYC3HEr27RgRz.

## 6. Order of work

1. **Engine** — config, types, `extreme.ts`, deck and wipe rules; unit tests (timers to the minute, pro-rata heal,
   K.O. during an absence, clock never from the device).
2. **Two saves on the device** — slots in `storage.ts` and the store, switching with a reload, the title card, the new
   game into Extreme, the unlock and the rules pop-up.
3. **The screens** — top bar chip, countdowns, the resting team, the welcome-back card, Settings.
4. **Online realm** — migration 0039 with its PGlite tests; every RPC passes the realm; sync per slot.
5. **Admin** — Config panel and dev tools; `docs/15-UI-GUIDELINES.md` gets an Extreme section; every new component on
   `/kitchen-sink`; e2e: unlock → rules → new Extreme game, no Center in a whole round, K.O. timer, away heal with a
   mocked server clock, the two worlds' leaderboards apart.

Each step ships on its own behind `extreme.enabled = false` until step 4 is in.

## 7. Risks

- **Realm everywhere** is the large part: every social function changes. The `default 'main'` keeps old clients
  working while it rolls out, and the PGlite tests check each function both ways.
- **Two tabs**, one per world: the slot is per device, so a second tab that loads the other world would write the
  wrong slot. The slot is read once per page load, and a tab that sees `pokedice.slot` change reloads.
- **Shared friends, separate games**: every friend screen has to ask for the right realm, or a main-save card would
  leak into Extreme. One helper in `src/lib/friends.ts` adds the active realm to every call, and the e2e checks a
  friend with only a main save is greyed in Extreme.
- **Away healing and sync**: the save with `awayFrom` that wins the sync is the one that heals; the heal clears
  `awayFrom` before the save is pushed, so it can't be applied twice on two devices.

## 8. Out of scope

Leaderboards across both worlds, moving Pokémon between saves, an Extreme-only Pokédex or areas, Extreme rewards in
the main game.

## 9. Questions asked (2026-10-11)

| Question | Answer |
|---|---|
| Which league opens Extreme mode? | Johto League |
| How separate are friends? | Same friends, play apart |
| Special events in Extreme? | On, with their own progress |
| Healing items in Extreme? | Potions and Revives |
| How does an Extreme save start? | A fresh game in Kanto |
| Leaving the app mid-fight? | Heal after the fight |
