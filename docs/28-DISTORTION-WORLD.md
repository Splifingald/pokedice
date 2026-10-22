# Distortion World: the portal run

The user's spec of 2026-10-15, for Haunted Hollow's last secret area (docs/26 §2.4, S5). Giratina is breaking into the
world; the player closes its distortion portals from the inside, in one go. Winning opens the area's raid: shiny
Giratina at Lv.100.

**Status: built** on `feat/hh-distortion-world` (from `feature/version_2`). Engine `src/engine/portal.ts` (and
`portalMode.ts`, the area's settings); UI `src/components/Portal.tsx` and `src/screens/area/PortalRun.tsx`, its effects
on the pixel engine (`src/fx/timelines/portal.ts`, `src/fx/glitch.ts`, hosted by `src/components/PortalFx.tsx`: §6); admin
`src/admin/sections/PortalModeBox.tsx`; migration `supabase/migrations/0057_hh_distortion_world.sql` (written by
`scripts/patch-hh-distortion.ts`). Rules for the screens: docs/15 §27.

## 1. Decisions

| Question | Answer |
|---|---|
| Distortion World opens | **100 Pokémon in the world's Pokédex** (was 119: all but Giratina). |
| Where its rules live | **On the area** (`Area.mode`, the `areas.mode` jsonb column): a per-area special mode, every number the admin's (Admin → Areas → Special mode). Only Distortion World has one. |
| Switch | **Off / On for admin / On for everyone**, Off by default (`game_config.portalRun`, docs/15 §20). The server reads it too. **Off: the area plays as before** (rounds, Centers, its raid once cleared), and a run in a save is kept. |
| The way in | Opening the area (Home's CONTINUE there: **ENTER THE DISTORTION**) plays the breach: a big distortion and "Giratina is breaking into this world, you have to close the distortion portals from the inside!" It **holds its end** (the open portal turning) and **waits for a tap** ("Tap to continue ▼"; no SKIP, it plays out); then the pop-up **rises over that end**: the rules and "Are you sure you want to enter? You cannot leave the area unless all your party is K.O." — **TEAM** / **NOT NOW** (back Home) / **READY!** (the user, 2026-10-15). |
| Arriving | **Like a Pokémon Center** (the user, 2026-10-15): arriving at the way in **heals the team and the Box** (the Center's heal and its rules: `arriveAtPortal`), and **until READY! the team can change** in the Team screen as at a Center (`teamSwapsOpen`); TEAM goes there, BACK TO THE DISTORTION (or Home's CONTINUE) comes back to the pop-up at once. The menus are open until READY!. |
| Inside | The team is **fully healed on entry** (READY! heals it again, harmlessly). **No Pokémon Center at all**, so **no team changes** once READY! is pressed. **No way out**: the menus, the top bar, Home and every other page send back to the area, and a reload comes back into the run (its state is in the save). The screen wears a **recurring distortion** (motion levels below). |
| The deck | Endless: **5 wild, 1 find (shuffled), then 1 distortion, always last**; repeat. The round gauge becomes a **gauge of portals closed, 0/10**. |
| Wild Pokémon | The area's wild pool, **foes' dice level 8**: Gengar, Chandelure, Aegislash, Dusknoir, Trevenant, Mismagius, Houndoom, Sableye, Froslass, Gourgeist, Palossand, Mimikyu and Polteageist at **Lv.60–64**, Haunter and Dusclops as **reliefs at Lv.52–55**, every one as likely, Dragapult rare (Lv.68–70); the area shows Lv.52–70 (§3, 2026-10-15). **They can't be caught** (no throw; the preview says so). They wear the **distortion shader**. Normal XP and ₽ (wild Pokémon pay no ₽, as anywhere; the finds do). |
| A distortion | **Pick 1 of 3 boons**, **confirmed** in a small pop-up (BACK spends nothing, CONFIRM takes it: the user, 2026-10-15), drawn by weight as **distinct kinds, only those that can help now**: heal everyone standing by **30 %** of max HP · revive **one K.O. Pokémon** (named; a Revive's HP) · **+10 damage on attacks of one type** (a type of the team's dice, named: "Ghost +10") · **an extra die** for a named Pokémon (one of its types; **8 dice at most**, a Pokémon at 8 is never chosen) · **a rare item**: Hyper Potion 40 %, Revive 40 %, Max Revive 20 %. With nothing that can help, it closes at once. |
| The +10 | A **flat bonus added like the combo's**: (Σ dice + combo + 10) × the attack type's multiplier × a booster. Only when the attack takes that type; nothing on an untyped attack; an immune hit stays 0. It **stacks** (Ghost +20). Shown in the damage recap. |
| The extra die | Joins the Pokémon's typed dice in battle (ahead of a base die). A Mega's own die comes on top, as always. |
| Run bonuses | The boosts and dice are **for the run only**: gone on the victory or a wipe. The heals, revives and items stay as they are. |
| The last portal | **No choice: victory.** The portal again, **shiny Giratina coming out of it, its cry**, "Every portal is closed! Shiny Giratina came through the last one: it is now available in raids." **HEAL & START RAID** (healed as at a Center, then the raid's page) or the green **BACK TO THE WORLD** (the world's Home). The run is **won for good**: the area is **only its raid** from then on (CONTINUE: RAID: GIRATINA, then sealed once caught). No card is dealt there any more, whatever asks (`isAreaSealed`): the map's CONTINUE HERE says "The distortion is sealed" instead (a player's report, 2026-10-21). The team is healed. |
| A wipe | XP, ₽ and items **kept**; portals closed **back to 0**; run bonuses **lost**; team **healed**; back to the world, to try again (no limit). |
| The raid | Shiny Giratina, the world's prize: **only after the run is won**, at **Lv.100, foes' dice level 10, 4 HP bars**, teams **from the world's Box, up to Lv.100** (all on the area's mode). Before, its page is locked ("Close every portal of Distortion World to open this raid"). This replaces the raid at the end of S5's rounds. **Its Origin Forme waits for the last bar** (the user, 2026-10-16; every raid's Giratina, not only this one): Altered through the first bars whatever its HP, then on the last one "Giratina's Origin Forme is unleashed! +1 Dragon die!", its own animation, and it keeps that form to the end, with **one more Dragon die** (3 Ghost + 3 Dragon) where a battle swaps a Ghost one for a Dragon one. |
| Giratina's cry | The game's cries (`src/audio/cries.ts`, Showdown's, one request, none while sound is off). The breach and a portal closing have 8-bit cues of their own (`portal.breach`, `portal.close` in `src/audio/sfx.ts`). |
| Art | Existing art only (the area's picture), plus code: **pixel art on the game's FX engine**, like the legend's entrance (the user's ask of 2026-10-15: the first SVG/CSS effects were underwhelming next to the rest). §6. |

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
  - The way in, as at a Pokémon Center (run.ts, 2026-10-15): `arriveAtPortal` (the team and the Box healed with
    `centerHeal`'s rules when the way in shows; the same save when there is nothing to heal or no way in) and
    `teamSwapsOpen` (the team can change: inside a Center, or at a portal area's way in before READY!; the Team
    screen and the store's `putInTeam` / `removeFromTeam` read it).
- Tests: `tests/engine/portal-run.test.ts` (the deck's order, the way in, its heal on arrival and the team changes
  until READY!, the boons' eligibility and the 8-dice cap, each boon, the +10 in damage, the extra die in battle, the
  victory and the raid, the wipe, the switch off); `tests/portal-fx.test.ts` (the distortion's rhythm and frames, the
  breach's held end); `e2e/portal.spec.ts` (the way in held for a tap, the pop-up over it, the heal, a team change
  through TEAM, READY! shutting it; a boon confirmed, BACK and Esc spending nothing).

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

**The newcomers (2026-10-15).** The user added Haunter and Dusclops (reliefs, weak) and Houndoom, Sableye, Froslass,
Gourgeist, Palossand, Mimikyu and Polteageist, every one as likely, with lower levels allowed to keep the balance, and
chose **today's difficulty**. At the old Lv.65–69 the newcomers made it far harder (the best team 12 % of tries, 67 %
clear; the second 3 %, 23 %): Houndoom and Sableye's Dark hits the Ghost teams hard. Measured on the same three teams
(200 players each), every species at weight 15 (Dragapult 2), the reliefs 8 levels under the rest:

| The strong ones / the reliefs | Dragapult · Chandelure · Aegislash | Gengar · Dusknoir · Mismagius | Golurk · Froslass · Trevenant |
|---|---|---|---|
| **Lv.60–64 / 52–55 (kept)** | **42 % of tries · 100 % clear** | **12 % · 71 %** | 0 % · 3 % |
| Lv.58–62 / 50–53 | 65 % · 100 % | 21 % · 89 % | 0 % · 2 % |
| Lv.56–60 / 48–51 | 72 % · 100 % | 31 % · 96 % | 1 % · 9 % |

With a Lv.80 team (the user's question), at Lv.65–69 the best trios win 81–89 % of tries (Darkrai, Houndoom, Dragapult
and Gengar lead them; Dark types do best against the pool, a team of Ghosts worst). The simulator's player always leads
with its first Pokémon and uses items only between fights, so these numbers lean low.

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
   just before closing a portal raid, so the server sees the win. (Since 0065 no team is capped on the server: the
   game caps it in the fight, all but its dice and rerolls, docs/18 §3.)
4. `configVersion` + 1.

`supabase/seed.sql` inlines 0057 in its schema part (after 0054); its Distortion World patch is a no-op there (the
bundle hasn't got Haunted Hollow), and seed.sql adds the column but never writes `mode` (no bundled area has one).

## 5. Setting it up

The pool of §3 (2026-10-15): run `supabase/migrations/0058_hh_distortion_pool.sql` after 0057 (safe to run again):
https://github.com/Splifingald/pokedice/blob/feature/version_2/supabase/migrations/0058_hh_distortion_pool.sql — it adds
the nine newcomers, sets every species of the area's pool to its weight and levels, and the area to Lv.52–70. Or, for
an export: `tsx scripts/patch-hh-distortion-pool.ts <in.json> <out.json>`, then `pnpm import-bundle`. `supabase/seed.sql`
doesn't carry it (it has no Haunted Hollow).

The portal run itself:

1. Deploy the client (the switch is Off: nothing changes for anyone).
2. Run `supabase/migrations/0057_hh_distortion_world.sql` (after 0052 and 0055; safe to run again):
   https://github.com/Splifingald/pokedice/blob/feature/version_2/supabase/migrations/0057_hh_distortion_world.sql
   (on `feature/version_2`, where it is merged). `supabase/seed.sql` carries it too (inlined in its schema part).
   - Or, for an export: `tsx scripts/patch-hh-distortion.ts <in.json> <out.json>`, then `pnpm import-bundle`.
3. Admin → Areas → Distortion World → **Special mode: portal run**: check the numbers, then the switch **On for admin**
   to try it, **On for everyone** to open it. Publish.

## 6. Its effects (pixel art, 2026-10-15)

The user's words: "The visual effects and animations used for the trick or treats and distortion world are really
underwhelming compared to the rest of the game animations. It should be pixel art Pokémon style and use the other
animations as references." Then: "The distorted animation on Pokémon is pretty good, you should reuse it from time to
time on the UI too in this world." So every effect is now drawn on the game's FX engine (`src/fx`: one canvas pixel to
one art pixel, ordered dithering, stepped colour ramps, 60 fixed steps a second, cues at exact times), legend.ts the
reference, and the wild Pokémon's look (torn sideways, split into hard colour copies) comes back on the page's pieces.
The rules for the screens are in docs/15 §27; every scene is on `/kitchen-sink/fx`, every piece on `/kitchen-sink`.
Then: "Don't switch the effect off with calm animations, it is part of the world's identity." So the lasting effects
(the portal, the Pokémon's, the screen's and the UI's glitches) play as in full under a calm OS; the player's short
setting lightens them; only motion off (the admins' no-animations switch) stills them (`distortionLevel`).

| Effect | What it is | Motion `short` / off (a calm OS: as full) |
|---|---|---|
| The breach (`breachTimeline`) | The area's picture darkens in two pulses, a red point tears, cracks race out, the area breaks into uneven pixel shards tumbling into the tear, the Distortion World opens (dithered rings, Giratina's red-and-gold arms turning, rocks drifting upside-down, far islands), a flash and a quake, the name card. Full screen, 3.9 s; then it holds its end (the portal turning) until a tap, and the way in's pop-up rises over it. | Half the time / its end at once, still, waiting for the tap |
| The portal (`portalLoop`: `PortalScene`, `PortalArt`) | On the rules' banner (and the way-in pop-up on its own, the kitchen sink's; in the game it rises over the breach's end) (the void, its rocks, the portal turning, motes pulled in, sparks on its rim), small by a distortion's boons. | Moving / one still frame |
| A portal closing (`closeTimeline`, `PortalCloseFx`) | After a boon pick, over the page: it collapses with its rim in shards, a flash, a gold seal ring turning and fading. 1.6 s. | 0.9 s / the sound alone |
| The wild Pokémon (`glitch.ts`: `useStageDistortion`, `GlitchSprite`) | On the page's own animated sprite (CSS filters, so nothing lags behind it): a faint violet and teal rim of its shape, motes rising; every 5 s for 0.35 s it is torn in 2–3 bands of rows (2–4 px), tinted violet, with see-through violet, teal and red copies 1–2 px behind. Softened 2026-10-15 (was every 3.4 s for 0.48 s, 2–6 px, a dark aura and a rim on a canvas behind it that didn't follow the animated sprite). | Copies only / the rim, still |
| The screen (`DistortionFx`) | Every 6–10 s a 0.45 s tear: broken scanlines, displaced blocks of the void, the page's colours shifted to violet. Nothing in between (its dithered frame round the screen is gone, 2026-10-15). | Rarer, thinner, no shift / nothing |
| The UI (`useUiGlitch`) | Every 5–9 s one piece of the page (gauge, boons, team cards, action bar, header title, a toast) plays the wild Pokémon's look, as soft, for 0.35 s; one at a time, never inside a pop-up, never on what holds the focus. | Copies only / none |
| The victory (`victoryTimeline`) | Legend.ts's entrance for shiny Giratina: dark pulses, shadow tendrils, heartbeats, its silhouette rising out of the portal in a red-and-gold outline, rays and a gleam, the reveal (flash, rings, roar and its cry, quake), the shiny sparkle, the portal sealed behind it, the name card (SHINY, its raid level); then the screen's words, HEAL & START RAID and the green BACK TO THE WORLD. 6.2 s. | 3.1 s / at its end at once |
| The raid's page and pop-ups (`PortalRaid.tsx`, `.dw-scope`) | The violet night, the void as the page's ground, the portal as its banner, Giratina distorted on its island on the card, the screen's tears and the UI's glitches; its pop-ups with the portal and Giratina as a banner, tearing in as they open. | Lighter tears and glitches / still |
| The raid's stage (`raidBattleStage`, `RaidStageArt`) and a bar breaking (`StageTear`) | The void, rocks drifting upside-down, the portal turning far behind Giratina, floating islands to stand on; Giratina distorted; a tear across the stage when a bar breaks. | One thin band / still, no tear |
| The last bar: the Origin Forme unleashed (`unleashTimeline` in `forms.ts`, the stage's scene `unleash`) | The stage darkens, shadow tendrils out of Giratina, two heartbeats in a red outline, its two forms flickering faster and faster as a black shape in red and gold; the reveal (a flash, gold, red and Dragon rings, a quake, a gleam): the Origin Forme, Dragon motes rising off it, while "Giratina's Origin Forme is unleashed! +1 Dragon die!", the UNLEASHED! banner and its cry are read. 3.2 s. | The flash and the new sprite, held 1.6 s / at once |
| The raid's entrance (`raidEntranceTimeline`, under the raid intro's words) | Pulses, a tear and its cracks, the portal opening, tendrils, heartbeats, shiny Giratina rising out of the portal, rays and a gleam, the reveal (flash, rings, roar, quake), the sparkle, then hovering and tearing in front of the portal. 6.2 s, **no Skip** (the user, 2026-10-15). | In full (an encounter) / straight to the fight |

Sounds: the breach and a closing keep `portal.breach` and `portal.close`; the scenes add the legend's cues
(`legend.pulse`, `legend.shatter`, `legend.heart`, `legend.roar`) and the shiny chime. Nothing changes in the engine, the
flows, the buttons or the words; no migration.

Then, the same day (2026-10-15), the victory and the raid: "On the last page of the distortion animation (the victory)
… make BACK TO THE WORLD a green one, and above it put a button HEAL & START RAID that goes back to the world and opens
the raid page", and "make this raid page themed so it's still in the event theme … Use the distortion effect on this
specific raid pop-up and inside the raid, full-on cool animations too". HEAL & START RAID heals the team and the Box as
a Pokémon Center does and marks the victory seen (the engine's `portalVictoryToRaid`; `tests/engine/portal-run.test.ts`),
then opens the area's raid page (`openRaidIn`); the raid of an area in portal mode wears the Distortion World on its
page, its pop-ups, its stage and its entrance (docs/15 §27, the table above). Its entrance can't be skipped (the user's
answer, the same day). Nothing about raids changes otherwise (rules, numbers, server checks, other raids' look); no
migration. `e2e/portal.spec.ts` covers the two buttons, the heal, the themed page, pop-up and fight, and the entrance
playing out with no Skip.

Then, the same day: the way in waits for a tap at the breach's end and its pop-up rises over it; arriving heals and the
team can change until READY! (§1, the engine's `arriveAtPortal` and `teamSwapsOpen`); a boon is confirmed before it is
taken; its icons are an extra die of its type with a "+" and a rare item turning through its items every 2 s. Still no
migration: nothing on the server changes.

Then, on 2026-10-16, Giratina's Origin Forme in raids (the user: "Change it for the raid only. The origin forme should
trigger on the last hp bar with an animation and text showing 'Giratina origin forme is unleashed' + 1 dragon die.
Giratina gets an additional dragon die instead of the usual replacement here in the raid"). In a raid the boss's HP is
one bar, so the battle's rule (below half HP, back above it) changed form on every bar. Now a raid Pokémon holds its
below-half-HP form (`Battler.formHeld`, set by `createRaid`; `checkHpForms` skips it) until its last bar starts
(`breakBar`, or the start for a raid of one bar), where `unleashForm` (battle.ts) puts it on for good and adds one die
of the type the form brings (`swapDie.to`: Dragon for Giratina) with its typed dice; its log entry is a `form` with
`reason: 'unleash'` and `die`. The same holds for the other below-half-HP forms if one is ever a raid Pokémon (their
names are in strings.csv: `ui.raid.form.<form dex>`). Your own Giratina, in a raid or anywhere, and every battle keep
the old rule. The screen: the stage's `unleash` scene (§6), its words landing at the reveal (the `contact` cue): the
line, the UNLEASHED! banner (`ui.raid.unleash`) and the cry; the battle's history says it too (`ui.hist.unleashed`).
No switch (a rule of a raid that exists, not a new feature), no migration, nothing on the server.
`tests/engine/raid-battle.test.ts` covers it (Altered through the first bars, the last one's Origin Forme with one
more Dragon die and no Ghost lost, a raid of one bar, a raid Pokémon with no such form, a battle's swap unchanged);
the scene is on `/kitchen-sink/fx`.
