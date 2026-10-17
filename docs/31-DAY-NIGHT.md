# Day and night in Johto

The user's ask of 2026-10-17: "a day and night feature in Johto only. While in Johto, at the top left of the header,
an icon shows if it is day or night. The cycle goes from 6 to 6 (6 pm to 6 am = night). Use the real data to know which
Pokémon are found during the day and which during the night. They stay in the same areas. Add a small visual
indicator in battles too."

**Status: built.** Engine `src/engine/dayNight.ts` (and `wildOdds` in `encounters.ts`); the hour `src/store/dayTime.ts`;
UI `src/components/DayNight.tsx`; admin Config → **Day and night** and Areas → wild pool → **Time**; data
`scripts/patch-day-night.ts` (the table, its SQL, its derivation); migration `supabase/migrations/0061_day_night.sql`.
Rules for the screens: docs/15 §30.

## 1. Decisions

| Question | Answer |
|---|---|
| Where | **Johto only** (`DAY_NIGHT_REGIONS`): its areas keep the time, every other region (and every small world) meets every Pokémon at any hour, as before. |
| The halves | **Day 6:00–17:59, night 18:00–5:59** (`dayTimeAt`). Gold, Silver and Crystal's morning and day are both this game's day. |
| Whose clock | **The player's local hour**: the real time (the server's, as the events read it, `serverNow`) in the device's time zone, so winding the device's clock on doesn't bring the night sooner; until the server answers, the device's own clock (the game never waits on it). The engine never reads a clock: the store passes the hour in (`EncounterContext.hour`). |
| What changes | **Only which wild Pokémon come.** A pool row has an optional `time` (`'day'` / `'night'`, the column `area_wild_pool.time_of_day`); in the other half its weight is 0 (`wildPoolAt`), so the same weights share the hour's Pokémon. Untagged rows come at any hour. Trainers, items, Centers, bosses, raids, levels: unchanged. An area whose every row belongs to the other half keeps its whole pool rather than run dry (none does today). |
| Which Pokémon | **The real games' data**, every species in the area it was already in (§2). |
| Switch | **Off / On for admin / On for everyone**, Off by default (`game_config.dayNight`, docs/15 §20). Wild Pokémon are dealt on the player's device, so no server function acts for this feature and none reads the switch. Off: every Pokémon at any hour, no sun or moon anywhere; the times stay in the pools. |
| Its rules | `RulesModal` once, the first time the player is in Johto with it on, queued behind the other one-time pop-ups (`dayNightRulesDue`, `save.dayNight.rulesSeen`): its banner the day's sky and sun beside the night's sky and moon; three rows (day from 6:00 to 18:00, night from 18:00 to 6:00, they stay in their areas); Later / Let's go! both close it. **Its INFO is the top bar's chip**: the feature has no page of its own, so a tap on the sun or the moon shows the same rules (OK). |
| The top bar | **Far left, before the energy**, while in Johto with it on (`DayNightButton`): a sky-blue chip with the sun by day, a night chip with the moon by night. Its name says the time and when it turns ("It's day in Johto until 18:00. Tap for the rules."). Re-read every 30 s. |
| The fights | **A small chip on the stage's top right corner** (`BattleDayTime`), the same sun or moon at a small size, in every fight of a Johto area (wild, trainers, gyms). Not in Versus, not on the plates, never over the HUD. |
| The lists | The area's details (Home), the area's Pokédex and a Pokémon's "where to find" show **a sun or a moon by a species met in one half only** (`speciesTime`, `DayNightTag`), greyed while it's the other half; its share is its share **when it's met** (`wildShare`: now, or in its own half). |

## 2. Which Pokémon, from the real games

`DAY_NIGHT_TAGS` in `scripts/patch-day-night.ts`, derived from PokeAPI's encounter data
(`github.com/PokeAPI/pokeapi`, `data/v2/csv`) by `tsx scripts/patch-day-night.ts --derive <csv-dir>`:

- For each species of a Johto area's pool, its encounters in the **real places the area stands for** (`REAL_PLACES`:
  Routes 30 & 31 are `johto-route-30` and `johto-route-31`, Violet City & Sprout Tower are `violet-city` and
  `sprout-tower`…).
- **Walking, surfing and fishing** only: headbutt trees and rocks keep no time in the games. Swarms and the radio's
  music are left out.
- **HeartGold and SoulSilver first**, else Crystal, else Gold and Silver.
- A species never met in those places (one this game added there) takes **its times across the whole of the real
  game**; one never met in the wild (the starters, Eevee, the Unown) is untagged.
- Met only in the morning or the day → **day**; only at night → **night**; in both → untagged (any hour).

The result, 20 areas (the rest have no time-bound species):

| Area | By day | By night |
|---|---|---|
| Route 29 | Pidgey, Sentret | Hoothoot |
| Routes 30 & 31 | Caterpie, Weedle, Ledyba | Zubat, Hoothoot, Spinarak |
| Violet City & Sprout Tower | Pidgey | Gastly, Hoothoot |
| Route 32 | Hoppip | Wooper |
| Route 33 & Slowpoke Well | Spearow, Hoppip | |
| Azalea Town | Ledyba | |
| Ilex Forest | Caterpie, Metapod | Oddish |
| Route 34 & the Day Care | Pidgey, Snubbull | |
| Goldenrod City | Pidgey | |
| Routes 35–37 | Pidgey, Ledyba, Sunkern | Spinarak |
| National Park | Sunkern | |
| Ecruteak City & the Burned Tower | | Gastly, Haunter |
| Routes 38 & 39 | Pidgey, Farfetch'd | |
| Olivine City & the Lighthouse | | Staryu |
| Cianwood City | Corsola | Staryu |
| Routes 42 & 43 and the Lake of Rage | | Hoothoot, Marill |
| Route 44 & the Ice Path | | Sneasel |
| Victory Road | Sandslash | |
| Mt. Silver | Pidgey, Ledyba, Ledian, Sunkern, Granbull, Corsola | Oddish, Gastly, Haunter, Hoothoot, Noctowl, Ariados, Misdreavus |
| Bell Tower | Pidgey | Gastly, Haunter, Hoothoot, Noctowl |

Every Johto area still meets someone in each half (`tests/engine/day-night.test.ts`). The admin can change any row's
time (Areas → its wild pool → Time: day, night, or — for any time).

## 3. Code

- **Engine** (`src/engine/dayNight.ts`, pure): `dayTimeAt`, `nextTurnHour`, `dayNightOn`, `areaKeepsTime`,
  `regionKeepsTime`, `areaDayTime(data, area, hour)`, `wildPoolAt(area, time)`, `speciesTime`, `wildShare`,
  `dayNightRulesDue` / `markDayNightRulesSeen`. `wildOdds` reads `wildPoolAt(area, areaDayTime(…, ctx.hour))`.
- **Store** (`src/store/dayTime.ts`): `localHour()` (passed into every encounter's context, `store/run.ts`),
  `useDayTime()` (the region's), `useAreaDayTime(areaId)` (an area's).
- **Data**: `WildPoolEntry.time` ↔ `area_wild_pool.time_of_day` (`src/config/mapping.ts`: written only once some row
  has one, so a database before 0061 takes an export); the seed writes the column and inlines 0061;
  `pnpm seed-regions` keeps the times (`withDayNight`).
- **Tests**: `tests/engine/day-night.test.ts` (halves, switch, region, dealing, lists, rules, the bundled pools),
  `tests/day-night-sql.test.ts` (0061 on PGlite, the export patch, the mapping).

## 4. Setting it up

1. Deploy the client (the switch is Off: nothing changes for anyone).
2. Run `supabase/migrations/0061_day_night.sql` (safe to run again; it adds the column, the switch Off and Johto's
   times):
   https://github.com/Splifingald/pokedice/blob/ccr-9a3ea599-y14mbq/supabase/migrations/0061_day_night.sql
   (the same path on the branch it is merged into, once merged). `supabase/seed.sql` carries it too (inlined in its
   schema part, and its Johto pools have the times).
   - Or, for an export: `tsx scripts/patch-day-night.ts <in.json> <out.json>`, then `pnpm import-bundle`.
3. Admin → Config → **Day and night**: **On for admin** to try it, **On for everyone** to open it. Publish.
