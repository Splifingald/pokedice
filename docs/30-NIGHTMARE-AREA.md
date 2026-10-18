# Newmoon Island: Darkrai's nightmare

The user's spec of 2026-10-16, for Haunted Hollow's Darkrai secret area (docs/26 §2.4, S4 Newmoon Island; its shiny
Darkrai raid). Darkrai pulls the player into its dream: seven nightmares in a fixed order, its shadow striking the team
after each round, no travel until they wake up. Waking up for good opens the area's raid: shiny Darkrai, Lv.70. Built
as a parallel of the Distortion World's portal run (docs/28): the same architecture (the area's `mode`, a switch, an
engine module, a screen step, pixel-art timelines, a themed raid), less restrictive rules.

**Status: built.** Engine `src/engine/nightmare.ts` (and `nightmareMode.ts`, the area's settings); UI
`src/components/Nightmare.tsx` and `src/screens/area/NightmareRun.tsx`, its effects on the pixel engine
(`src/fx/timelines/nightmare.ts`, `nightmareRaid.ts`, hosted by `src/components/NightmareFx.tsx`: §6); its raid's look
`src/screens/events/NightmareRaid.tsx`; admin `src/admin/sections/NightmareModeBox.tsx`; migration
`supabase/migrations/0060_hh_nightmare.sql` (written by `scripts/patch-hh-nightmare.ts`). Rules for the screens:
docs/15 §29.

## 1. Decisions

| Question | Answer |
|---|---|
| Where | **Haunted Hollow's Newmoon Island** (S4, the secret area whose raid is shiny Darkrai). Sinnoh's Newmoon Island (the mythical's lair, `5e2e78f9…`) is unchanged: it is a lair, not a secret area with a raid; nothing stops the admin from giving any area a nightmare (Admin → Areas). |
| Where its rules live | **On the area** (`Area.mode`, `{ kind: 'nightmare', … }`, the same `areas.mode` column as the portal run): every number the admin's (Admin → Areas → Special mode: nightmare). One special mode per area. |
| Switch | **Off / On for admin / On for everyone**, Off by default (`game_config.nightmare`, docs/15 §20). The server reads it too (its raid's checks). **Off: the area plays as before** (its round, its Center, its raid once cleared); a nightmare in a save is kept. |
| The way in | **Exactly the Distortion World's** (the user, 2026-10-16: "it wasn't triggered as soon as I entered the area"). CONTINUE on Home says **ENTER THE NIGHTMARE** ("7 rounds, no travel until you wake"); it, or any other way into the area while the nightmare hasn't begun, opens the area with **the intro at once**, full screen (`NightmareEntry`, as `PortalEntry`'s breach). Arriving heals the team and the Box as a Center does (`arriveAtNightmare`). The intro holds its end: **Tap to continue ▼**; then its pop-up rises over that end, at the bottom (`NightmareEntryDialog`, as `PortalEntryDialog`): "Into the nightmare", the short rules, "Healed as at a Pokémon Center" with **TEAM** (the team can change until it begins: `teamSwapsOpen`; back from the Team screen the pop-up is up again at once, with no intro: `run.nightmarePopup`), **NOT NOW** (Home) and **BEGIN THE NIGHTMARE** (the Distortion World's READY!: `startNightmare`, round 1's foe next). No other panel. A reload or a trip Home while it's under way never plays the intro again (the area's page carries on); a wipe resets the run, so the next way in plays it again (as the breach). |
| The intro | Full screen, the area sinks into the night, the huge full moon rises, black smoke creeps in, **Darkrai's silhouette passes across the moon**; the line "You feel a shadow breathing down your neck, the nightmare begins"; it holds its end and waits: **Tap to continue ▼**. No skip (as the breach). |
| Its rules | **Short** (the user, 2026-10-16: "no need for that much details"): four one-line rows on the way in's pop-up and from **INFO** at the bottom of the area's page (the same rows, docs/15 §20): "7 rounds of nightmares", "Darkrai's shadow takes 10% HP after each round", "Items after rounds 3 and 6", "No travel until you wake (the shop stays open)". The numbers are the area's (its foes, strike and gifts). `nightmareRulesSeen` is set on BEGIN or NOT NOW. |
| The rounds | **One foe a round, always the same order**, weakest to strongest (§3): Musharna Lv.62 → Sableye 63 → Absol 64 → Zoroark 65 → Hydreigon 66 → Tyranitar 67 → Honchkrow 68. Wild Pokémon of the area's foes' dice level (7), **never caught** (no throw; the preview says "A nightmare: it can't be caught."), never shiny. Normal XP. Fleeing (where the game allows it) brings the same foe back. No Pokémon Center inside. |
| After each round | **Darkrai's strike** (`applyNightmareStrike`): every team member loses **10 % of its max HP, rounded, at least 1, never a K.O.** (it stops at 1 HP; a K.O. one stays K.O.): `max(1, hp − max(1, round(maxHp × 10 / 100)))`. The same rounding as the portal's heal boon. After rounds 1–6 only: the 7th round wakes the player (the waking heals the team anyway). It's due in the save (`strike`) until it lands, so a reload or a trip Home plays it again before the next round. |
| The gifts | **A Revive after round 3, a Max Revive after round 6**, into the bag (the result card says "Something glimmers in the dark: Revive!"). **Once for good** (`gifted`): a wipe and a new try don't give them again, so they can't be farmed. Why these: the Distortion World's rare item boon draws Hyper Potion / Revive / Max Revive; with HP chipped by the strike and no Center, revives matter most, and the better one comes before the last two, hardest rounds. |
| The lock | While the nightmare holds the player (`nightmareLock`), **only travel is shut**: Home's **Areas** button (its map icon becomes a lock, hatched, `aria-disabled`, a tap toasts the reason) with the reason under the bar ("Darkrai's nightmare holds you on Newmoon Island: no travel until you wake up. The Mart stays open."); the green GO TO, every travel (`travelTo`, `enterArea`) and the world strip's **Back to Kanto** (`leaveSmallWorld`) refuse. **The Mart, the Team, the bag, the menus and Home stay usable** (less restrictive than the Distortion World, whose every page sends back to the area). It's in the rules text. |
| The last round | **The waking**: Darkrai's shadow in front of the moon, then **shiny Darkrai** revealed (its cry), the sky paling to dawn; "**You woke up from your nightmare, Darkrai awaits**", "Shiny Darkrai is now available in raids." **HEAL & START RAID** (healed as at a Center, then the raid's page: `nightmareVictoryToRaid`) over the green **BACK TO THE WORLD**. Won for good: the area is **only its raid** from then on (CONTINUE: RAID: DARKRAI). The team is healed. |
| A wipe | **The player wakes up in a cold sweat**: the rounds back to 0, XP, ₽ and items kept (the gifts too), the team healed, the lock lifted; the next way in plays the intro again, then BEGIN whenever (no limit). |
| The raid | Shiny Darkrai: **only once awake**, at **Lv.70, foes' dice level 8, 3 HP bars**, teams from the world's Box **up to Lv.70** (all on the area's mode; it was the world's Lv.60). Before, its page is locked ("Wake up from Newmoon Island's nightmare to open this raid"). |
| Darkrai's cry | The game's cries (`playCry`). The scenes have 8-bit cues of their own (`nightmare.fall`, `.breath`, `.charge`, `.beam`, `.wake` in `src/audio/sfx.ts`) with the legend's (`legend.pulse`, `.heart`, `.roar`) and the shiny chime. |
| Art | Existing art only (the area's picture, sinking into the night), plus code: **pixel art on the game's FX engine**, as the Distortion World's (§6). |
| In the area | **No screen effect** (the user, 2026-10-16: "side screen effects make the screen VERY hard to read, remove them and remove the shadow passing, just put a dark haunted shadow effect on opponent pokemon"): no vignette, no smoke at the edges, no shadow passing over the page or across the moon. **The foes are haunted** instead (§6): a dark rim on the foe's own sprite and black smoke drifting up behind it, in its fights and on its preview. |

## 2. Engine (pure)

- `nightmareMode.ts`: `DEFAULT_NIGHTMARE` (the numbers above), `normaliseNightmare` (the admin's value cleaned:
  levels 1–100, 20 foes at most, a gift a round inside the rounds, defaults for anything odd), `nightmareRunsOn` (the
  switch), `nightmareModeOf(area)`, `nightmareRaidRules`.
- `nightmare.ts`: the state is in the area's progress (`AreaProgress.nightmare`: `active`, `round`, `strike`,
  `gifted`, `won`, `wonSeen`, `tries`), so it's saved and parked with the world.
  - `startNightmare`, `nightmareNext` (`'strike'` or `'foe'`), `nightmareFoe`, `nightmareEncounter` (the round's foe,
    always the same), `winNightmareRound` (the round counts, its gift once, the strike due or the waking),
    `nightmareStrikeHp`, `applyNightmareStrike`, `winNightmare`, `markNightmareWonSeen`, `nightmareVictoryDue`,
    `nightmareWipe` (through `applyWipe`).
  - `inNightmare`, `nightmareLock` (the area the player can't travel from), `nightmareNoCatch`, `canStartNightmare`,
    `nightmareWon`.
  - In `run.ts`: `arriveAtNightmare` (the way in's heal), `teamSwapsOpen` (its way in too), `nightmareVictoryToRaid`;
    two run events for the result card (`nightmare_round`, `nightmare_gift`).
  - The raid: `progressRaidState` opens a nightmare area's raid on `nightmare.won` (never on its round); `raidRules` and
    `raidTeamCap` read the area's `raid` numbers.
- Tests: `tests/engine/nightmare.test.ts` (the order, fixed every try and harder each round; the way in and its heal;
  the strike's numbers, rounding, never a K.O.; the gifts at 3 and 6, once for good; the lock; the waking and the raid;
  the wipe; the switch off), `tests/nightmare-fx.test.ts` (the scenes' beats, the strike's landing time, the haunted
  foe's shadow, the motion rules), `tests/hh-nightmare-sql.test.ts` (0060), `e2e/nightmare.spec.ts`.

## 3. Balance: the order and the numbers

`pnpm nightmare-balance rank [fights]` measures each candidate foe the way the game plays: all at **Lv.65**, the share
of 1-on-1 fights the world's own Pokémon at **Lv.64** (Gengar, Dusknoir, Chandelure, Aegislash, Dragapult, Mismagius,
Golurk, Froslass, Trevenant, Lucario, Dusclops, Banette; tracks 8, foes' dice 7) **lose** to it, 150 fights each:

| Candidate | Lost to it | | Candidate | Lost to it |
|---|---|---|---|---|
| **Musharna** (round 1) | **3 %** | | Kingambit | 79 % |
| **Sableye** (round 2) | **28 %** | | Grimmsnarl | 79 % |
| **Absol** (round 3) | **70 %** | | Weavile | 82 % |
| **Zoroark** (round 4) | **72 %** | | **Tyranitar** (round 6) | **85 %** |
| Mightyena | 75 % | | Krookodile | 86 % |
| **Hydreigon** (round 5) | **76 %** | | **Honchkrow** (round 7) | **87 %** |
| | | | Houndoom, Malamar | 87 % |

Seven picked with strictly rising difficulty, the nightmare's themes, and six of the seven Dark: Musharna (the dream
before it turns: the one that isn't Dark, and by far the weakest for a Ghost team), Sableye (gem eyes in the dark),
Absol (the omen), Zoroark (illusions), Hydreigon (the brutal dragon), Tyranitar, then Honchkrow (the boss of the night,
the hardest), each **a level above the one before** (62 to 68), so both the species and the level rise. The first
idea, by theme alone (Absol, Malamar, Musharna, Honchkrow, Zoroark, Kingambit, Hydreigon), measured nothing like
weakest to strongest (Musharna 3 % third, Malamar 87 % second): every foe has five dice by then, so the order had to be
the fight's.

The whole nightmare (`pnpm nightmare-balance [players] [seed]`): a team goes in healed, fights each round on the battle
AI keeping its XP, takes the strike, gets the gifts, uses its bag between fights (a Revive or Max Revive on a K.O., a
Hyper Potion under 35 %), and buys back 4 Hyper Potions and 2 Revives before each try (the Mart is open); up to 10
tries, 150 players a team:

| Team (Haunted Hollow's own species, tracks 8) | Tries won | Clear within 10 tries | A lost try wins |
|---|---|---|---|
| Dragapult 66 · Chandelure 64 · Aegislash 63 | 40 % | 95 % (2.0 tries) | 4.6 rounds |
| **Lucario 64 · Galvantula 63 · Chandelure 63** (built against Dark) | **100 %** | 100 % | — |
| Gengar 64 · Dusknoir 63 · Mismagius 62 | 0 % | 0 % | 3.1 rounds |
| Golurk 61 · Froslass 60 · Trevenant 60 | 0 % | 0 % | 3.6 rounds |

**Kept: Lv.62–68, foes' dice 7, a 10 % strike.** The best Ghost team clears it as the Distortion World's (40 % of
tries; DW 42 %), and a team built against Dark (Fighting, Bug and Electric: Lucario and Galvantula are the world's own,
docs/26 §2.8) walks through it: the nightmare asks the player to bring the right types, which the rules' list of foes
lets them plan. A pure Ghost team can't win at any setting tried (foes 4 levels lower, dice 6: still 0 %): Dark beats
Ghost and Psychic. The simulator's player always leads with its first Pokémon and uses items only between fights (a
real player also heals in battle and shops mid-nightmare), so these numbers lean low.

## 4. Server (migration 0060)

`supabase/migrations/0060_hh_nightmare.sql`, from `tsx scripts/patch-hh-nightmare.ts --sql`. A patch over 0052 to 0058
and the admin's later edits; safe to run twice (tested on PGlite: `tests/hh-nightmare-sql.test.ts`, and in the chain
`tests/haunted-hollow-sql.test.ts`).

1. Newmoon Island gets its nightmare **only where it has no mode yet** (`areas.mode`, added by 0057; the `alter … if
   not exists` is repeated so it can't fail).
2. `game_config.nightmare` = `{"access":"off"}` when missing (the admin's switch stays).
3. `nightmare_open()` (the switch), `raid_progress_nightmare(key)` (a key's nightmare mode while the switch is on for the
   caller), `raid_progress_nightmare_won(key, realm)` (the caller's cloud save says it's over), and
   `raid_progress_special_locked(key, realm)` (a portal or nightmare raid the caller can't use yet). 0057's
   `raid_progress_set_team` and `raid_progress_close` are redefined on it: a nightmare raid's team is capped at its own
   `teamCap` (70) and both refuse (`events_raid_locked`) until the nightmare is over; the portal's checks are the same as
   0057's. (Since 0065 no team is capped on the server: the game caps it in the fight, all but its dice and rerolls, docs/18 §3.)
4. `configVersion` + 1.

`supabase/seed.sql` carries it too (inlined in its schema part, after 0057; its Newmoon Island patch is a no-op there,
the bundle having no Haunted Hollow).

## 5. Setting it up

1. Deploy the client (the switch is Off: nothing changes for anyone).
2. Run `supabase/migrations/0060_hh_nightmare.sql` (after 0057 to 0059; safe to run again):
   https://github.com/Splifingald/pokedice/blob/feature/version_2/supabase/migrations/0060_hh_nightmare.sql
   (on `feature/version_2` once merged there; before that, the same path on the branch it was pushed to).
   `supabase/seed.sql` carries it too (inlined in its schema part).
   - Or, for an export: `tsx scripts/patch-hh-nightmare.ts <in.json> <out.json>`, then `pnpm import-bundle`.
3. Admin → Areas → Newmoon Island (Haunted Hollow) → **Special mode: nightmare**: check the foes, the strike, the gifts
   and the raid's numbers, then the switch **On for admin** to try it, **On for everyone** to open it. Publish.

## 6. Its effects (pixel art)

Every effect is drawn on the game's FX engine (`src/fx`), legend.ts and the portal run's scenes the reference: one
canvas pixel to one art pixel, ordered dithering, stepped colour ramps, 60 fixed steps a second, cues at exact times.
Its palette (`NM`): the night's blues and purples (`#03040c` to `#9c86e8`), the full moon's creams (`#f3efd6`,
`#fffcea`, its seas `#bdb490`), Darkrai's black smoke (`#050409`) with a lilac edge, its red (`#e0304a`) and its eye's
ice blue (`#5ad8ff`). Unlike the Distortion World's glitches (the user's call for that world only), the nightmare's
lasting effects **follow §8 as every effect does**: a calm OS (reduce motion) stills them (`nightmareLevel`).

| Effect | What it is | Motion `short` / off or calm OS |
|---|---|---|
| The intro (`nightmareIntroTimeline`, `NightmareIntro` in `NightmareEntry`) | As soon as the area opens (§1). The area's picture darkens in two heartbeats and dissolves into the night in an ordered dither from the top; the stars come out; the huge full moon rises with its halo; black smoke banks up and tendrils curl up the sides; Darkrai's silhouette (an ice-blue and violet outline flickering, its smoke trailing) passes across the moon from left to right, slowing in front of it (a breath, a heartbeat, a small quake, the line); the name card ("Darkrai's nightmare", night-blue band with a moon-cream rim and Darkrai's red). 4.4 s, then it holds its end (the moon, stars twinkling, smoke drifting) until the tap; the way in's pop-up rises over that end. | Half the time / its end at once, still, waiting for the tap |
| The moon (`moonLoop`: `MoonScene`) | The rules' banner (INFO), the raid page's: the night, twinkling stars, the moon, the smoke banked below. Nothing crosses it. | Moving / one still frame |
| A haunted foe (`hauntLoop`, `useHaunt`: `BattleStage haunted`, `HauntSprite` on the round's preview) | The round's foe wears a dark shadow: on its own animated sprite, a rim of the smoke's black one art pixel all round and a faint violet edge above and to the sides (zero-blur CSS drop shadows, `hauntCss`: they follow each frame and never cover the sprite), its black rising a pixel higher every 1.2 s (its breath); behind it, on a canvas of its own, a dark pool dithered under its feet and black smoke drifting slowly up from its body (about 3 puffs a second, lit violet). Nothing on the player's side or the HUD; gone while a move plays or once it's down. | No breath, half the smoke / the rim and one still frame of the smoke |
| Darkrai's strike (`nightmareStrikeTimeline`, `NightmareStrikeView`) | On a 2:1 panel over the team's cards: the moon behind, the team's back sprites at the bottom; Darkrai's shadow rises out of the smoke, the dark gathers at its chest (motes pulled in, its eye flickering), then a jagged violet beam with a lilac core strikes each team member at once: a 4-frame hit-stop, each one's two white frames and a shake, dark bursts, a lilac flash (`hud.contact`: the engine takes the HP then, and the cards' HP bars drain, each card flashing and shaking, `.nm-struck`); the shadow sinks back. 2 s, unskippable; "On to round 4" once it's landed. | 1 s, straight to the beams / at once, the cards still |
| The waking (`nightmareWakeTimeline`, `NightmareVictoryView`) | Two dark pulses; Darkrai's shadow drifts in front of the moon and stops there, its eye flickering; two heartbeats (dark-red rings pulsing out from the moon's rim); smoke curling in around it; cold rays and a gleam; the reveal (a flash, rings in ice and violet, the roar and its cry, a quake, a burst of smoke and ice), shiny Darkrai, the shiny sparkle; the smoke sinks and the sky pales to dawn from the horizon (`nightmare.wake`); the name card (SHINY, Lv.70); then the words and the two buttons. 6.2 s. | 3.1 s / at its end at once |
| The screen (`NightmareFx`) | **Darkrai's raid page and fight only** (not the nightmare's area, §1): the dream's vignette (the night thickening towards the edges, dithered, lightest at the bottom where the action bar is) breathing every 4 s, smoke curling in at the left and right edges, and every 12–18 s Darkrai's shadow passing over the page (a big see-through silhouette, right to left, 1.4 s). Over the page, under the dialogs, no taps. | No breathing, the shadow every 25–35 s / the vignette alone, still |
| The UI (`useUiGlitch` with `.ui-shadow`) | With the raid's screen effect only: every 8–13 s one piece of the page darkens as the shadow brushes it: four stepped frames (darker, a black and a violet copy a pixel or two off, back), 0.5 s; one at a time, never in a pop-up, never on the focus. | Two lighter frames / none |
| The rounds' fights (`BattleStage world="nightmare"`, `NightStageArt`) | The night under the full moon in place of the area's picture: the moon behind the foe, smoke drifting up and rising off the foe's rock, moonlit rocks to stand on. | Moving / still |
| The raid's page and pop-ups (`NightmareRaid.tsx`, `.nm-scope`) | The moonlit night (a token scope, `SCOPES.nightmare`, contrast-tested), the night sky as the page's ground (`NightGround`), the moon as its banner, its card on the nightmare's stage with shiny Darkrai before the moon; the screen's vignette; its pop-ups with the moon's cream and Darkrai's red along their edges (`.nm-modal`), the NPC partners' with the moon and Darkrai as a banner, each coming out of the shadow as it opens (`useShadowIn`). | Lighter / still |
| A bar breaking (`StageShadow`) | A dark wave sweeping the raid's stage from the right, its edge lit lilac, four frames. | Two thin frames / nothing |
| The raid's entrance (`nightRaidEntranceTimeline`, `RaidIntro world="nightmare"`) | Two dark pulses, the moon rising, smoke gathering into a column in front of it, two heartbeats, shiny Darkrai's shadow taking shape out of the smoke (stepped, its outline flickering), cold rays and a gleam; the reveal on the raid intro's white-out (2.75 s), the sparkle; then it hovers before the moon. The intro's words over it, its tapes in the night's blue and the moon's cream ("Warning · the nightmare takes shape", "Darkrai steps out of the shadow"). 6.2 s, **no Skip** (as Giratina's). | In full (an encounter) / straight to the fight |
