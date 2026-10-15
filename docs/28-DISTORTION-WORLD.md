# Distortion World: the portal run

The user's spec of 2026-10-15, for Haunted Hollow's last secret area (docs/26 §2.4, S5). Giratina is breaking into the
world; the player closes its distortion portals from the inside, in one go. Winning opens the area's raid: shiny
Giratina at Lv.100.

**Status: built** on `feat/hh-distortion-world` (from `feature/version_2`). Engine `src/engine/portal.ts` (and
`portalMode.ts`, the area's settings); UI `src/components/Portal.tsx` and `src/screens/area/PortalRun.tsx`; admin
`src/admin/sections/PortalModeBox.tsx`; migration `supabase/migrations/0057_hh_distortion_world.sql` (written by
`scripts/patch-hh-distortion.ts`). Rules for the screens: docs/15 §27.

## 1. Decisions

| Question | Answer |
|---|---|
| Distortion World opens | **100 Pokémon in the world's Pokédex** (was 119: all but Giratina). |
| Where its rules live | **On the area** (`Area.mode`, the `areas.mode` jsonb column): a per-area special mode, every number the admin's (Admin → Areas → Special mode). Only Distortion World has one. |
| Switch | **Off / On for admin / On for everyone**, Off by default (`game_config.portalRun`, docs/15 §20). The server reads it too. **Off: the area plays as before** (rounds, Centers, its raid once cleared), and a run in a save is kept. |
| The way in | Opening the area (Home's CONTINUE there: **ENTER THE DISTORTION**) plays the breach: a big distortion and "Giratina is breaking into this world, you have to close the distortion portals from the inside!" Then a pop-up with the glowing portal behind it, the rules and "Are you sure you want to enter? You cannot leave the area unless all your party is K.O." — **NOT NOW** (back Home) / **READY!** |
| Inside | The team is **fully healed on entry**. **No Pokémon Center at all**. **No way out**: the menus, the top bar, Home and every other page send back to the area, and a reload comes back into the run (its state is in the save). The screen wears a **recurring distortion** (motion levels below). |
| The deck | Endless: **5 wild, 1 find (shuffled), then 1 distortion, always last**; repeat. The round gauge becomes a **gauge of portals closed, 0/10**. |
| Wild Pokémon | The area's wild pool (Gengar, Chandelure, Aegislash, Dusknoir, Trevenant, Mismagius, Dragapult rare), **Lv.65–70, foes' dice level 8**. **They can't be caught** (no throw; the preview says so). They wear the **distortion shader**. Normal XP and ₽ (wild Pokémon pay no ₽, as anywhere; the finds do). |
| A distortion | **Pick 1 of 3 boons**, drawn by weight as **distinct kinds, only those that can help now**: heal everyone standing by **30 %** of max HP · revive **one K.O. Pokémon** (named; a Revive's HP) · **+10 damage on attacks of one type** (a type of the team's dice, named: "Ghost +10") · **an extra die** for a named Pokémon (one of its types; **8 dice at most**, a Pokémon at 8 is never chosen) · **a rare item**: Hyper Potion 40 %, Revive 40 %, Max Revive 20 %. With nothing that can help, it closes at once. |
| The +10 | A **flat bonus added like the combo's**: (Σ dice + combo + 10) × the attack type's multiplier × a booster. Only when the attack takes that type; nothing on an untyped attack; an immune hit stays 0. It **stacks** (Ghost +20). Shown in the damage recap. |
| The extra die | Joins the Pokémon's typed dice in battle (ahead of a base die). A Mega's own die comes on top, as always. |
| Run bonuses | The boosts and dice are **for the run only**: gone on the victory or a wipe. The heals, revives and items stay as they are. |
| The last portal | **No choice: victory.** The portal again, **shiny Giratina coming out of it, its cry**, "Every portal is closed! Shiny Giratina came through the last one: it is now available in raids." Back to the world's Home. The run is **won for good**: the area is **only its raid** from then on (CONTINUE: RAID: GIRATINA, then sealed once caught). The team is healed. |
| A wipe | XP, ₽ and items **kept**; portals closed **back to 0**; run bonuses **lost**; team **healed**; back to the world, to try again (no limit). |
| The raid | Shiny Giratina, the world's prize: **only after the run is won**, at **Lv.100, foes' dice level 10, 4 HP bars**, teams **from the world's Box, up to Lv.100** (all on the area's mode). Before, its page is locked ("Close every portal of Distortion World to open this raid"). This replaces the raid at the end of S5's rounds. |
| Giratina's cry | The game's cries (`src/audio/cries.ts`, Showdown's, one request, none while sound is off). The breach and a portal closing have 8-bit cues of their own (`portal.breach`, `portal.close` in `src/audio/sfx.ts`). |
| Art | Existing art only, plus code: the portal is an SVG (rings, Giratina's red streaks turning in steps), the shader is SVG displacement + hard offset copies, the screen's distortion is CSS. |

## 2. Engine (pure)

- `portalMode.ts`: `DEFAULT_PORTAL_RUN` (the numbers above), `normalisePortal` (the admin's value cleaned, defaults
  for anything odd), `portalRunsOn` (the switch), `portalModeOf(area)`, `portalRaidRules`.
- `portal.ts`: the run's state is in the area's progress (`AreaProgress.portal`: `active`, `closed`, `deck`, `offers`,
  `boosts`, `dice`, `won`, `wonSeen`, `tries`), so it's saved and parked with the world.
  - `startPortalRun` (heals the team, deals the first cycle), `portalCycle` (the distortion at index 0: drawn last),
    `drawPortalCard`, `portalEncounter` (a wild Pokémon from the pool, a find from the loot), `openDistortion`
    (the last one → `winPortal`; else `drawOffers`), `eligibleOffers`, `pickDistortion`, `portalWipe` (through
    `applyWipe`), `markPortalWonSeen`, `portalVictoryDue`.
  - `inPortalRun`, `portalLock` (the area the player can't leave), `portalNoCatch`, `canStartPortal`, `portalWon`.
  - In battle: `portalLevels` (the boosts as `UpgradeLevels.typeFlat`), `portalDiceFor` (a seed's `extraDice` and
    `diceCap`, joined by `withExtraDice` in `makeBattler`); `computeDamage` adds `typeFlat` and reports `flat`.
  - The raid: `progressRaidState` opens a portal area's raid on `portal.won` (never on its rounds); `raidRules` and
    `raidTeamCap` read the area's `raid` numbers.
  - `portalRulesDue` (run.ts): the rules pop-up, once.
- Tests: `tests/engine/portal-run.test.ts` (the deck's order, the way in, the boons' eligibility and the 8-dice cap,
  each boon, the +10 in damage, the extra die in battle, the victory and the raid, the wipe, the switch off).

## 3. Balance

`pnpm portal-balance [runs] [seed]` (`scripts/portal-balance.ts`) plays the run end to end on the battle AI: a team
goes in healed, fights every wild card (keeping its XP), picks up finds, takes a boon at each distortion (revive, a
heal when hurt, a die, a boost, an item), uses its bag between fights (4 Hyper Potions and 2 Revives to start), until
the last portal or a wipe. With the content's numbers (wild Lv.65–70, foes' dice 8) and the world's tracks at 8 (where
the campaign simulator has them by Windy Cliffs, docs/26 §2.4), 60 players per team, up to 10 tries:

| Team (the world's own species) | Tries won | Clear within 10 tries | Tries to clear | A lost try closes |
|---|---|---|---|---|
| Dragapult 68 · Chandelure 66 · Aegislash 65 | 52–54 % | 100 % | 1.9 | 3.6 portals |
| Gengar 66 · Dusknoir 65 · Mismagius 64 | 14–15 % | 72–77 % | 3.3–3.5 | 1.5 portals |
| Golurk 62 · Froslass 61 · Trevenant 60 | 3 % | 27–30 % | 5.2–5.3 | 1.2 portals |

One more track level matters most: at 9, the second team wins 79 % of tries and the third 26 %; at 10, all three clear
almost every time. Foes' dice at 7 instead of 8 only lifts the best team (69 %). **Kept as they were (Lv.65–70, dice
8)**: a strong Lv.60–70 team clears it in one to four tries, a weaker one has the world's last days to level up and buy
tracks. Each try is about 35–50 fights for a winner (10 cycles of 5), so XP and finds carry over to the next try.

## 4. Server (migration 0057)

`supabase/migrations/0057_hh_distortion_world.sql`, from `tsx scripts/patch-hh-distortion.ts --sql`. A patch over
0052/0055 and the admin's later edits; safe to run twice (tested on PGlite: `tests/hh-distortion-sql.test.ts`, and with
0052 and 0055 in `tests/haunted-hollow-sql.test.ts`).

1. `areas.mode jsonb` (new column). Distortion World gets its portal run **only where it has no mode yet**, and its
   Pokédex condition goes **119 → 100 only where it is still 0052's 119** (an admin's other count stays).
2. `game_config.portalRun` = `{"access":"off"}` when missing (the admin's switch stays).
3. `portal_run_open()` (the switch, like `general_open`), `raid_progress_portal(key)` (a key's portal mode while the
   switch is on for the caller), `raid_progress_portal_won(key, realm)` (the caller's cloud save says the run is won).
   `raid_progress_set_team` (0046's) caps a portal raid's team at its own `teamCap` (100) and refuses
   (`events_raid_locked`) until the run is won; `raid_progress_close` (0045's) refuses too. The game sends its save
   just before closing a portal raid, so the server sees the win.
4. `configVersion` + 1.

`supabase/seed.sql` inlines 0057 in its schema part (after 0054); its Distortion World patch is a no-op there (the
bundle hasn't got Haunted Hollow), and seed.sql adds the column but never writes `mode` (no bundled area has one).

## 5. Setting it up

1. Deploy the client (the switch is Off: nothing changes for anyone).
2. Run `supabase/migrations/0057_hh_distortion_world.sql` (after 0052 and 0055; safe to run again):
   https://github.com/Splifingald/pokedice/blob/feature/version_2/supabase/migrations/0057_hh_distortion_world.sql
   (on `feature/version_2`, where it is merged). `supabase/seed.sql` carries it too (inlined in its schema part).
   - Or, for an export: `tsx scripts/patch-hh-distortion.ts <in.json> <out.json>`, then `pnpm import-bundle`.
3. Admin → Areas → Distortion World → **Special mode: portal run**: check the numbers, then the switch **On for admin**
   to try it, **On for everyone** to open it. Publish.
