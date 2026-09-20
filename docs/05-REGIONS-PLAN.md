# Pokédice — Multi-Region Plan (Johto & Hoenn)

> **Status: built.** All six steps are done and on `claude/awesome-albattani-ujgsev`. The balance pass and its
> numbers are in `06-REGION-BALANCE.md`. This document is kept as the record of what was decided and why — where it
> and the code disagree, the code is right.

Integration plan for the second and third regions. Companion to `01-GAME-SPEC.md` (rules), `02-DATA-MODEL.md` (schema)
and `03-BUILD-PLAN.md` (phasing conventions). Kanto stays the reference for every number: when this document is silent,
copy what Kanto does.

**The shape of the feature.** Clear the Indigo League and a prompt offers a new region: Johto. The player keeps their
character and nothing else — new starter, empty Box, empty bag, ₽0, upgrade tracks back to level 1. The map menu gains a
region switcher, so the Kanto save is never lost, just parked. Beat the Johto league and Kanto's Box, bag and ₽ merge
into Johto — and Hoenn is offered on the same terms. Before the first league is won, no region but Kanto is mentioned
anywhere in the UI.

---

## 0. Constraints found in the code (read before planning work)

| Fact | Where | Consequence |
|---|---|---|
| `SaveData` is flat: one `box`, `team`, `inventory`, `gold`, `pokedex`, `comboLevels`, `dieLevels`, `currentAreaId`, `areaProgress` | `src/engine/types.ts:470` | Regions are modelled as **swappable blocks of exactly those fields** — the engine never learns what a region is |
| The engine is pure and reads `data.areas` as one flat list; `linearAreas()` = every non-hidden area in array order | `src/engine/data.ts:105` | `linearAreas` must become **region-scoped**; this is the single highest-risk edit |
| Area unlock = "previous linear area cleared" | `src/engine/run.ts:202` | Works unchanged once the chain is scoped to a region |
| Only ~8 places hardcode 151 | `setup/SetupPage.tsx:62`, `admin/schemas.ts`, `admin/sections/TableSections.tsx:237`, `screens/Help.tsx:197`, `scripts/*` | Cheap to generalise to `data.pokemon.length` |
| PokeAPI (`pokeapi.co`) is **blocked** by the sandbox network policy | `pnpm seed` step 2 | Use the static mirror `raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/…`, verified reachable and byte-identical |
| Chat attachments are capped at 2000px and re-encoded to lossy WebP, so the Pokémon sheets arrive at ~⅔ scale (41px cells against a native 64px) — two separate uploads were byte-identical | `images/1.webp`, `2.webp`, `5.webp` | Sheets cannot be a sprite source over chat, and re-uploading cannot fix it; §1a uses the `pret/pokeemerald` decomp instead |
| `spriters-resource.com` is **blocked** by the sandbox network policy (403 at the proxy) | any sheet URL | Originals cannot be fetched directly either; only the allowlist (raw.githubusercontent, npm, PyPI) is reachable |
| The attached trainer sheets are **lossless PNG at native scale** (HGSS 973×1798, RSE 651×726, flat backgrounds) | `images/3.png`, `4.png` | Usable as-is by a variant of `scripts/trainer-sprites.ts` |

Kanto's shape, for balancing reference: 22 linear areas + 6 hidden/post-game, level band 2→72, `enemyUpgradeLevel`
1→9, `roundsToClear` 1–2, 226 trainers, 151 species, 5 legendaries.

---

## Step 1 — Sprites

### 1a. Pokémon (Gen 1 replaced, Gen 2 and 3 added)

Target, per species, unchanged from today: `front`, `front_shiny`, `back`, `back_shiny`, `mini_1`, `mini_2` in
`public/pokemon/NNN_*.png`, plus `src/data/sprite-metrics.json` (bottom transparent rows, so each sprite stands on its
platform).

**Decided: the `pret/pokeemerald` decomp**, on raw.githubusercontent, is the single source for all 386 — the actual
game assets, lossless, replacing today's FRLG cuts for Kanto so the whole Pokédex shares one art style.

Why not the attached sheets: the chat attachment pipeline caps uploads at 2000px and re-encodes them to lossy WebP, so
the sheets arrive at ~⅔ scale (41px cells against a native 64px) with the 1px black outline blended away. That damage
happens on upload and cannot be undone or re-uploaded around. Spriters Resource is blocked by the sandbox network
policy (403 at the proxy), so the originals cannot be fetched either. PokeAPI's sprite repo is lossless and reachable
but has no GBA box icons, which would cost the minis' two-frame hop.

Per species, `graphics/pokemon/<name>/` in the decomp gives:

| File | What it is | Becomes |
|---|---|---|
| `front.png` | 64×64 indexed PNG | `front` (with `normal.pal`), `front_shiny` (with `shiny.pal`) |
| `back.png` | 64×64 indexed PNG | `back`, `back_shiny`, same palette swap |
| `normal.pal` / `shiny.pal` | 16-colour JASC-PAL | the two palettes; index 0 is the transparent backdrop |
| `icon.png` | 32×64 indexed, two frames stacked | `mini_1` (top), `mini_2` (bottom) |

`scripts/pokemon-sprites.ts` gains a `--fetch` mode: for each species in `src/data/pokemon.json`, download the four
files (cached under `scripts/.cache/`, so re-runs are offline and idempotent), apply each palette, map index 0 to
alpha 0, split the icon into its two frames, and write the same six PNGs into `graphics/pokemon/` that the sheet cut
used to produce. `--publish` then copies them to `public/pokemon/` and writes `sprite-metrics.json`, exactly as today.
Shinies are a palette swap rather than a second image, so a shiny can never drift from its normal form.

Folder names are the slugified English species name (`nidoran_f`, `mr_mime`, `ho_oh`, `farfetchd`, `porygon2`,
`deoxys`); the script asserts all 386 resolve and names any that do not, rather than silently writing a hole.

`pnpm pokemon-sprites --publish` stays the one command that fills `public/pokemon/`, and `scripts/seed.ts`'s
`SPRITE()` helper needs no change. Because the fetch reads `pokemon.json` for its species list, **step 2 runs before
step 1a** — the only ordering change in this plan.

### 1b. Trainers

`scripts/trainer-sprites.ts` gains two sheets:

- `graphics/trainers/hgss.png` (from `images/3.png`, already in the repo) — **measured**: 80×80 cells, 81px column
  pitch from x=1, 98px row pitch from y=18 (the 18px bands are the section labels), 12 × 19 = 228 cells. The labelled
  bands run Ethan/Lyra/Silver, eight "other trainers" blocks, Falkner→Clair, Will→Karen, the Kanto leaders, Lance,
  Red, Team Rocket, Giovanni, then the Frontier Brains — so cells are mapped per band by position, not by one uniform
  grid over the whole sheet.
- `graphics/trainers/rse.png` (from `images/4.png`, already in the repo) — **measured**: 64×64 cells on a 65px pitch
  from (1,1), 10 × 11 = 110 cells on the green backdrop, RSE trainer classes.

Output `public/trainers/classes/johto/*.png` and `…/hoenn/*.png`, and extend `trainerSprite(name, role, region)` with a
name→sprite table per region (same pattern as the Kanto one). Frames the player characters are not used: the player
keeps Red/Green.

**Acceptance:** `public/pokemon` holds 386 × 6 files, every one with a transparent background and non-empty;
`sprite-metrics.json` has 386 entries; the Kitchen Sink screen renders a Gen 2 and a Gen 3 Pokémon front/back/shiny
without visual regression on Kanto; every seeded trainer resolves to an existing sprite file (a test asserts this).

---

## Step 2 — Species data for 152–386

**`scripts/seed.ts` is stale and must not be re-run.** The committed bundle is ahead of it: `items.json` holds 8 items
the seeder never emits (`fire/water/thunder/leaf/moon-stone`, `helix-fossil`, `dome-fossil`, `old-amber`) and
`pokemon.json` holds stone evolutions in a shape it never writes (`level: null, item: 'leaf-stone'`), because
`783a918` synced admin tuning back from Supabase. `pnpm seed` would delete all of it. So Gen 2 and 3 arrive through a
**new, additive** `scripts/seed-regions.ts` that treats `src/data/*.json` as the source of truth:

1. Read the existing bundle. Every existing row is preserved byte-for-byte; the script only appends.
2. Fetch 152–386 from the PokeAPI static mirror
   (`raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/<endpoint>/index.json` — `pokeapi.co` itself is
   blocked), cached under `scripts/.cache/` so re-runs are offline and idempotent. The mirror returns **relative**
   `url` fields, so every link is normalised to an endpoint path before fetching.
3. Build the new species with the seeder's own exported pure helpers — `hpAtLevel`, `catchValueFromRate`,
   `diceCountFromBst`, `composeDice`, `applyDiceSchedule` — so Gen 2 and 3 are balanced by exactly the rules Kanto was.
4. **Cross-generation evolution lines** (Pichu→Pikachu, Cleffa, Igglybuff, Tyrogue, Elekid, Magby, Smoochum, Azurill,
   Wynaut) mean the stage graph spans all three regions. The dice schedule is therefore computed over the merged
   1–386 list, but **applied only to dex ≥ 152**: the babies get the right stage, and no Kanto row moves. Without
   this, adding Pichu would silently re-plan Pikachu and Raichu and shift Kanto's balance.
5. `applyDiceSchedule` needs no change — it reads stage, line length and BST. Spot checks for shapes Kanto lacks:
   babies (3-stage lines), Wurmple's split, Shedinja (a `FAMILY_PLAN` override with a 1 HP floor), Wobbuffet, and the
   pseudo-legendaries (Tyranitar, Salamence, Metagross → 5 dice like Dragonite).
6. **Legendary dice/catch values**: Ho-Oh, Lugia, the beasts, Celebi, the Regis, Latios/Latias, Groudon, Kyogre,
   Rayquaza, Jirachi, Deoxys get the Mewtwo treatment (5 dice, `catchValue` 9) via `LEGENDARIES` in `content.ts`.
7. **Evolution triggers without a day/night cycle or trading** follow Kanto's convention — a stone evolution is
   `{level: null, item}`, everything else gets an assigned level (trade 34, happiness/other 30):

| Trigger | Species | Becomes |
|---|---|---|
| Metal Coat | Onix, Scyther | `item: 'metal-coat'` |
| King's Rock | Poliwhirl, Slowpoke | `item: 'kings-rock'` (a second branch beside their level evolution) |
| Dragon Scale | Seadra | `item: 'dragon-scale'` |
| Up-Grade | Porygon | `item: 'up-grade'` |
| Sun Stone | Gloom, Sunkern | `item: 'sun-stone'` |
| Deepseatooth / Deepseascale | Clamperl | two item branches |
| Happiness → Espeon / Umbreon | Eevee | `sun-stone` / `moon-stone` — keeps all five Eevee branches item-driven, so a levelling Eevee never pre-empts the stones. Day and night become two stones, which is the no-cycle rule applied literally |
| Happiness | Golbat, Chansey, Togepi, the babies | level 30 (babies evolve by levelling, as they should) |
| Beauty | Feebas → Milotic | level 30 |
| Level-up w/ empty slot | Nincada → Ninjask (+Shedinja) | level 20, Shedinja as a second branch |

8. **New items** appended to `items.json`: `sun-stone`, `kings-rock`, `metal-coat`, `dragon-scale`, `up-grade`,
   `deepseatooth`, `deepseascale`, `root-fossil`, `claw-fossil`. Prices and shop gating mirror the Kanto stones;
   fossils use the existing `{kind:'fossil', dex, level, hours}` effect, so `src/engine/fossils.ts` needs no change.
9. `supabase/seed.sql` is regenerated from the merged bundle at the end of step 3 (it is a set of upserts keyed by id,
   so a live database takes it without losing admin edits).

### 2b. The Master Ball

The item already exists (`inShop: false`, so `sellPrice()` is already 0 — **it cannot be sold**, no code change) but is
currently a Silph Co. one-time find. Three changes:

- `effect.bonus` 9 → **10** (`d6 + 10` against a catch value of at most 9: a guaranteed catch, with headroom if catch
  values ever grow).
- It moves to the **Rocket Hideout** loot table as a rare, once-per-save find: `['master-ball', 2, 1, 1, true]` against
  a deck of ~100 copies — roughly a 2% card, and gone from the table once found. Silph Co. keeps its Rare Candy.
- **It resets with the bag**, like everything else — no special case in `switchRegion`. Johto's Rocket HQ and Hoenn's
  Magma/Aqua Hideout each hide one of their own on the same rare terms, so every region has exactly one to find.

**Acceptance:** `pnpm seed` writes 386 species offline from cache; `pnpm test` green; a new test asserts every species
has ≥1 die, ≤`maxDice`, a non-empty sprite path, and that every `evolutions[].item` exists in `items.json`.

---

## Step 3 — Region content and balancing data

`scripts/content.ts` grows a `region` field on `AreaPlan` and two new area lists. Region metadata becomes data, in
`src/data/regions.json` (and a `regions` table alongside `areas`):

```ts
interface Region {
  id: 'kanto' | 'johto' | 'hoenn'
  name: string            // 'Johto'
  orderIndex: number      // 0, 1, 2
  dexRange: [number, number]   // [152, 251] — what the region's Pokédex tab shows
  starters: number[]      // [152, 155, 158]
  starterLevel: number
  /** Beating this area's gyms is "the league is done": it unlocks the next region. */
  leagueAreaKey: string
  /** Off = the region is invisible everywhere (no prompt, switcher chip, dex tab or board). Kanto is always on. */
  enabled: boolean
  /** Region unlocked by finishing this region's league; null for the last one. */
  nextRegion: string | null
}
```

Every `Area` gains `regionId`; `linearAreas(data, regionId)` filters on it. Kanto's 28 areas get `regionId:'kanto'`
and its `leagueAreaKey` is `indigo-plateau` (the first one — Victory Road II / Indigo Plateau II stay Kanto post-game).

### Johto — routed and balanced on HGSS

25 linear areas, band **Lv.2 → Lv.55**, `enemyUpgradeLevel` 1→9 on Kanto's curve, `roundsToClear` 2 for the first two
areas then 1 (Safari-like areas 2). Starters 152/155/158 at Lv.5. Rival = Silver.

Route 29 · Routes 30–31 · **Violet City / Sprout Tower (Falkner)** · Route 32 · Union Cave · Route 33 & Slowpoke Well ·
**Azalea Town (Bugsy)** · Ilex Forest · Route 34 & Day Care · **Goldenrod City (Whitney) + Game Corner** · Routes 35–37
· National Park · **Ecruteak City / Burned Tower (Morty)** · Routes 38–39 · **Olivine Lighthouse (Jasmine)** · Routes
40–41 · **Cianwood City (Chuck)** · Routes 42–43 & Lake of Rage · **Mahogany Town / Rocket HQ (Pryce)** · Route 44 & Ice
Path · **Blackthorn City (Clair)** · Dragon's Den · Victory Road · **Indigo Plateau — Will, Koga, Bruno, Karen, Lance**
(Lv.45–55) · post-league **Mt. Silver** (Lv.55–70, catch-all pool, Red as the final trainer).

Hidden areas: **Whirl Islands** (Lugia, Lv.45), **Bell Tower** (Ho-Oh, Lv.45), **Ruins of Alph** (Unown; the only
source), **Ilex Shrine** (Celebi). Unlock conditions reuse `{kind:'pokedex'|'level'|'area'}` exactly as Kanto's
secrets do.

### The roaming beasts

Raikou, Entei and Suicune get **no area of their own** — they roam, as they do in the originals. Once **both Ho-Oh and
Lugia have been caught**, every wild encounter anywhere in Johto has an independent chance of turning up a beast
instead of its rolled species. Each beast can be caught **once**; after that it stops appearing. Flee from one or lose
the catch throw and it goes back into the pool, so it can be met again.

Config, so the rate is tunable without a redeploy (`game_config`, defaults shown):

```jsonc
"roamers": {
  "regionId": "johto",
  "requires": [249, 250],        // both caught — not merely defeated
  "chance": 0.02,                // each, per wild encounter: ~6% for at least one while all three roam
  "level": 40,
  "dex": [243, 244, 245]
}
```

Implementation sits in `src/engine/encounters.ts`, in the wild branch only: after a wild encounter is rolled, if the
region matches and every `requires` dex is in the Pokédex, roll each uncaught roamer in turn at `chance` and replace
the encounter with that legendary on a hit. It is a `boss`-kind encounter so the existing legendary catch flow, the
single-copy rule in `catchTarget` and the "one of a kind" guard all apply unchanged. Because the gate is *caught*
rather than *defeated*, a player who knocks Lugia out and misses the throw does not unlock the roamers.

**Acceptance:** a seeded test asserts no roamer appears before both birds are in the Pokédex, that the rate matches
`chance` over 100k rolls within tolerance, that a caught roamer never appears again, and that a fled one does.

Special events: Game Corner in Goldenrod (the existing `casino` card, prize Pokémon Abra/Dratini), Bug-Catching Contest
in National Park (a `casino`-style one-off, or plain trainer gauntlet if it needs new UI — decide in step 4), Day Care
on Route 34 (already a global feature — see §4 for whether it is per-region), Red Gyarados at Lake of Rage as a
guaranteed-shiny boss (`legendary_boss[].shiny`, ticked in the area's data and in Admin → Areas: the legendary is shiny
on its challenge card, in the fight, at the throw and in the Box, and nothing else about it changes).

Fossils: Gen 2 adds no fossil Pokémon. The Kanto fossils are **not** in Johto's dex, so no fossil loot in Johto —
Union Cave's loot tier goes to evolution stones instead.

### Hoenn — routed and balanced on Emerald

26 linear areas, band **Lv.2 → Lv.58**, post-game to Lv.75. Starters 252/255/258. Rival = May/Brendan (the opposite
character, same `rivalOf` mechanism Kanto uses).

Route 101 · Routes 102–103 · Petalburg Woods & Route 104 · **Rustboro (Roxanne)** · Route 116 & Rusturf Tunnel ·
**Dewford / Granite Cave (Brawly)** · Routes 105–107 · Slateport & Route 110 · **Mauville (Wattson) + Game Corner** ·
**Route 111 Desert & Mirage Tower** · Route 112 / Fiery Path / Mt. Chimney · **Lavaridge (Flannery)** · Routes 113–115
& Meteor Falls · **Petalburg (Norman)** · Route 118–119 & Weather Institute · **Fortree (Winona)** & Routes 120–121 ·
Safari Zone · Mt. Pyre & Routes 122–123 · Magma/Aqua Hideout · Lilycove & Route 124 / Shoal Cave · **Mossdeep (Tate &
Liza)** · Routes 125–128 & Seafloor Cavern · **Sootopolis / Cave of Origin (Juan)** · Victory Road · **Ever Grande —
Sidney, Phoebe, Glacia, Drake, Wallace** (Lv.50–58) · post-league **Battle Frontier grounds** (Lv.60–75, catch-all).

Hidden: **Seafloor Cavern** (Kyogre) and **Cave of Origin / Terra Cave** (Groudon) — both catchable, as asked;
**Sky Pillar** (Rayquaza, gated on both of the above); **Desert Ruins / Island Cave / Ancient Tomb** (Regirock,
Regice, Registeel); **Southern Island** (Latias + Latios); **Birth Island** (Deoxys) and **Faraway Island** (Jirachi)
at the dex thresholds Kanto uses for Mew.

Fossils: **Root Fossil** and **Claw Fossil** as `unique_find` loot in Route 111 Desert / Mirage Tower only — the sole
source of Lileep and Anorith, per the brief.

Banners: the 20 existing 118×16 scenes cover most of it (`plains`, `forest`, `cave`, `city`, `ocean`, `dunes`,
`volcano`, `swamp`, `snow_mountains`, `sky`, `haunted`, `factory`…). Four to draw in the same style for places they
can't fake: `ruins` (Alph/Regi chambers), `lighthouse`, `tower` (Bell/Sky Pillar), `underwater`. Same 118×16 strips in
`graphics/banners`, published by `scripts/art.ts`, `#flip` available for reuse.

**Acceptance:** `pnpm seed` emits ~80 areas across 3 regions and ~600 trainers; a test asserts each region's chain is
contiguous, every `gyms[]` id resolves, every legendary appears in exactly one `legendaryBoss` and in no wild pool, and
every species 1–386 is reachable in its own region's pools (the catch-all late-game area is the backstop).

---

## Step 4 — The region-change feature (code)

### Save shape

Minimal-blast-radius design: the top-level `SaveData` fields keep meaning **"the active region"**, so no engine or
screen code that reads `save.box` changes. Two fields are added:

```ts
type RegionId = 'kanto' | 'johto' | 'hoenn'

/** The per-region block — exactly the fields a region owns. */
interface RegionSave {
  gold: number
  box: PokemonInstance[]
  team: string[]
  inventory: Record<string, number>
  pokedex: number[]
  comboLevels: Record<ComboKey, number>
  dieLevels: Record<PokeType, number>
  currentAreaId: string
  areaProgress: Record<string, AreaProgress>
  dayCare?: DayCareState
}

interface SaveData {
  …
  region: RegionId                        // absent on old saves = 'kanto'
  parked: Partial<Record<RegionId, RegionSave>>   // the regions you are not in
  /** Regions whose stuff has already been merged forward, so a merge never doubles. */
  merged?: RegionId[]
}
```

- **Switch region** = pop the target block out of `parked`, push the current fields in, swap. One pure function,
  `switchRegion(save, to)` in a new `src/engine/regions.ts`, plus `run` reset (`initialRun()`) and a guard that refuses
  mid-battle.
- **Start a region** = `newSave`-like block from a chosen starter at `region.starterLevel`, empty everything else,
  upgrade tracks at 1.
- **Merge** = on clearing region N's `leagueAreaKey`, fold every earlier region's `box` + `inventory` + `gold` into the
  active block (their `parked` entries keep a copy of the Pokédex and progress so switching back still shows the
  region). `releaseDuplicates` already keeps one copy per species at the highest level, so colliding species resolve
  themselves; `comboLevels`/`dieLevels` take the **max** of the merged regions.
- **Migration**: `save.version` 1 → 2 in `src/save/schema.ts` — wrap an old save as `{region:'kanto', parked:{}}`.
  Zod schema and `parseSave`'s integrity repair run per block.

### Turning a region on and off

Each region carries an `enabled` flag, so an unfinished or misbehaving region can be withdrawn without a redeploy —
the same lever `game_config` already gives everything else. It lives on the region row (`regions.enabled`, mirrored in
`src/data/regions.json`) and is editable in Admin → Config.

- A disabled region is **invisible**: no unlock prompt, no chip in the region switcher, no Pokédex tab, no
  leaderboard. `regionsFor(data, save)` is the single accessor every screen uses, and it filters on the flag.
- A player **already in** a disabled region is not stranded, which is the case that matters: they are moved back to
  their most recent enabled region on load, with a toast, and their block stays parked untouched. Turning the region
  back on returns everything exactly as it was.
- Kanto cannot be disabled — it is the region a new save starts in. The admin form refuses it.

### Cheats

The cheats are how a region gets tested without playing 20 hours to reach it, so they grow with the feature. Admin →
Analytics → player → Cheats (`src/admin/sections/PlayerCheats.tsx`, editing the cloud save through `playerSave.ts`)
and the local Dev Tools (`src/admin/sections/DevToolsSection.tsx`) both gain:

| Cheat | What it does |
|---|---|
| **Unlock region** | Marks a region unlocked and creates its block if absent, so the switcher offers it. Does not move the player. |
| **Switch to region** | `switchRegion(save, id)` — parks the current block and activates another, with the mid-run guard. |
| **Complete league** | Marks the current region's `leagueAreaKey` cleared with every gym beaten: the unlock prompt for the next region fires exactly as it would in play. |
| **Merge previous regions** | Runs the merge early, to test the Box and bag collision path (duplicate species, upgrade-track max) without beating two leagues. |
| **Unlock every area** | The existing cheat, scoped to the active region instead of the whole area list. |
| **Give item** | Extended to the new stones and fossils, so evolution and fossil paths are testable in any region. |
| **Catch legendary / roamer** | Puts a legendary straight in the Box, and flips the roamer gate (both birds caught) so the beasts start appearing. |

`adminAddPokemon` / `adminRemovePokemon` already operate on the active block, so they keep working unchanged once the
save is region-aware. Every new cheat goes through the same `apply()` path, which re-fetches the latest cloud save
before editing and stamps `adminEditAt` so the edit wins the next sync.

**Acceptance:** a test drives each cheat over a save and asserts the invariants hold afterwards (`parseSave` still
accepts it, no duplicate species, the active block is consistent), plus the disabled-region rescue path.

### Engine

- `linearAreas(data, regionId)` and `isAreaUnlocked` / `badgeCase` / `clearIfDone` / `finishRound` scoped to the
  active region's chain. `data.areas` stays one flat list.
- New `RunEvent`s: `{kind:'league_done', regionId}` and `{kind:'region_unlocked', regionId}`, raised by `clearIfDone`
  when the cleared area is the region's `leagueAreaKey`.
- **Branching evolutions prefer an unowned species** (replaces the uniform pick in `progression.ts:gainXp`): given the
  ready branches, filter to those whose `toDex` is not in the active `pokedex`; pick uniformly among those, or among
  all of them if the player owns every branch. `gainXp` takes an optional `owned: Set<number>`; every caller passes
  `save.pokedex`. Covers Eevee, Tyrogue, Wurmple, Nincada, Clamperl, Poliwhirl, Slowpoke, Gloom, Snorunt.

#### Cross-generation evolutions wait for their generation

Kanto species carry branches that were added in later games — the seeder grafts them on, because they belong to the
same Pokémon:

| From | Into | How |
|---|---|---|
| Golbat #42 | Crobat #169 | Lv.30 |
| Chansey #113 | Blissey #242 | Lv.30 |
| Eevee #133 | Espeon #196 / Umbreon #197 | Sun Stone / Moon Stone |
| Gloom #44 | Bellossom #182 | Sun Stone |
| Poliwhirl #61 | Politoed #186 | King's Rock |
| Slowpoke #79 | Slowking #199 | King's Rock |
| Onix #95 | Steelix #208 | Metal Coat |
| Scyther #123 | Scizor #212 | Metal Coat |
| Seadra #117 | Kingdra #230 | Dragon Scale |
| Porygon #137 | Porygon2 #233 | Up-Grade |

Most are already fenced off by their item — the Sun Stone, King's Rock, Metal Coat, Dragon Scale and Up-Grade are
Johto and Hoenn finds. Three were not: **Crobat** and **Blissey** need only a level, and **Umbreon** needs the Moon
Stone, which is Kanto's own. So a first playthrough could turn up a Gen 2 Pokémon, which breaks the rule that no
region is mentioned before the first one is done, and puts a #169 in a Pokédex that ends at #151.

`evolutionGate(save, data)` in `engine/regions.ts` is the rule: an evolution into a species whose `dexRange` belongs to
a region you have not unlocked does not happen. It is a predicate on the target's dex, threaded as `allowDex` through
`gainXp` and `stoneEvolution`, and every caller in `engine/run.ts` passes it — so battle XP, Rare Candies, stones and
the Day Care all obey one rule, and the campaign simulator inherits it by going through the same code. A species in no
region's range is always allowed, so the gate can never be what makes something unobtainable.

The gate is on **where you are standing**, not on what you have unlocked: a region shows its own generation and the
ones before it, and nothing else. A Golbat evolves into a Crobat in Johto or any later region, and never in Kanto —
not even once Johto is done, because the Kanto Pokédex still ends at #151 and its Box is Kanto's.

The display follows the same predicate, or it would promise an evolution that will not happen: `PokemonSheet`'s
"Evolves into" row and its `EVOLVE` milestone list only the branches the save may see, and the milestone disappears
entirely when every branch is locked. A stone whose only branch is a later generation's stops offering itself in the
bag. **That is what locking a milestone behind a region unlock looks like** — the gate is on the evolution, and the
milestone is derived from it, rather than a separate flag to keep in sync.

Stat milestones (`ADD_DIE`, `ADD_HP`, `ADD_REROLL`, `REPLACE_DIE`) are *not* region-gated. `effectiveStats(species,
level, data)` is deliberately a pure function of species and level — "nothing about the dice set is stored in the
save" — and gating those would mean threading the save through it and its ~36 call sites, making a Pokémon's power
depend on progress. Worth doing only if a region is ever meant to *strengthen* Pokémon you already own.

### UI

- **League-cleared modal** (reuse `Modal` + the `Dialogue`/`OakTip` voice): fires on `league_done`, explains that the
  new region starts fresh and the old one stays reachable. Dismissible; the offer stays available from the map.
- **Region switcher** in the map header (`src/screens/MapScreen.tsx` + `components/Hud.tsx`): a row of region chips,
  rendered **only when more than one region is unlocked** — before that, nothing anywhere says the word "Johto".
- **Starter pick for a new region**: reuse `screens/NewGame.tsx`'s picker as a `<StarterPicker>` component.
- **Pokédex** (`screens/Pokedex.tsx`): a tab per unlocked region over `region.dexRange`, plus the running total. No tab
  exists for a region that is not unlocked.
- **Leaderboard — one board per region.** A region's board unlocks with the region, and the board on screen is always
  the **currently selected region's**: switch region on the map and the leaderboard follows, no extra picker. The three
  tabs (level / progress / dex) stay, scoped to that region's numbers, so a Johto board ranks Johto Boxes, Johto dex
  completion and Johto frontier only.
  - SQL (`supabase/migrations/0016_leaderboard_regions.sql`): `leaderboard()` returns an extra `region text` and emits
    **one row per region a player has played** — the active block plus every entry in `data->'parked'` — instead of one
    row per save. Old saves with no `region` key report as `kanto`, so nothing is lost.
  - Client (`src/lib/leaderboard.ts`): `LeaderboardRow` gains `region`; `rankLeaderboard(rows, tab, data, regionId)`
    filters before ranking, `frontierArea` resolves against that region's chain, and the dex total in the score label
    comes from the region's `dexRange` rather than the global species count.
  - `LeaderboardTutorial` and Prof. Oak's one-time nudge stay tied to the first region.
- **Analytics**: `progressKey` sums cleared areas across all regions; snapshots gain `region`.
- **Help** (`screens/Help.tsx`): the "all 151" line becomes region-aware; the region rules get a short section, shown
  only once a second region exists.

**Acceptance:** a Vitest suite drives a save through clear-Kanto → prompt → start Johto (fresh box, ₽0, Master Ball
kept) → switch back to Kanto (stuff intact, no progress lost) → clear Johto → Kanto's Box and bag are in Johto, once,
with no duplicate species; the leaderboard rows for a two-region save rank separately per region and follow the
switcher; an old v1 save loads and lands in Kanto unchanged; a Playwright smoke test walks the switcher.

---

## Step 5 — Balancing implementation

Kanto's curve is the target for both regions: the same XP curve, the same `goldMultiplier`, `enemyUpgradeLevel`
climbing 1→9 across the chain, foes' level bands ~85–100% of the player's expected team average, `roundsToClear` 1
(2 in the opening and Safari-like areas), Centers at weight 12 and items at 10 in every deck.

Because each region starts from zero with upgrade tracks at level 1, **a region's difficulty curve is a copy of
Kanto's, stretched to its own length** — not a continuation of it. Concretely: level bands are set as a fraction of the
region's league level (Johto 55, Hoenn 58, Kanto 55 at Indigo Plateau I), area by area, from Kanto's fractions; loot
tiers 1–5 map onto the same fractions; trainer team sizes follow Kanto's progression (1 → 3).

Shop gating (`items.shopBadges`) is per badge count, which resets with the region — so it works unchanged.

---

## Step 6 — Simulation and iteration

The headless campaign runner already exists and is region-blind once `linearAreas` is scoped:

- `pnpm balance` gains a `--region` flag; run N=200 seeded campaigns per region, per starter.
- Watch the same signals the Kanto pass used: encounters-to-clear per area, wipe rate (target < 15% outside gyms),
  gold income vs. upgrade costs, team average level vs. area band on arrival, and time-to-league.
- The admin **Simulator** (`src/admin/sections/simulator/`) gets a region selector on the Campaign and Area tabs.
- Iterate on `scripts/content.ts` numbers only — never on engine code — and re-run until each region's curve matches
  Kanto's within tolerance. Commit the regenerated `src/data/*.json` + `supabase/seed.sql` together.

**Acceptance:** for each region and starter, a 200-seed campaign finishes the league with wipe rate and
encounters-per-area inside Kanto's envelope, and the report is committed under `docs/`.

---

## Decisions taken

1. **Sprite source** — the `pret/pokeemerald` decomp for all three generations: the real game assets, lossless,
   shinies by palette swap, and the two-frame GBA box icons kept (§1a).
2. **Upgrade tracks** — reset with everything else on a region change; the merge takes the max across merged regions.
3. **Day Care** — per-region: each region has its own, and residents stay in the region they were left in. Energy
   stays global. Eggs hatch from the region's **own** generation only (`eggSpecies(data, regionId)`): the first forms
   of its evolving lines, starters excluded, never a previous or a later region's.
4. **Master Ball** — resets with the bag; one to find per region (§2b).
5. **Leaderboards** — one per region, unlocked with the region, following the region switcher (§4).
6. **Kanto post-game** (Victory Road II / Indigo Plateau II) stays Kanto content, reachable any time via the region
   switcher, and is *not* required to unlock Johto.
7. **The roaming beasts** have no area: after both Ho-Oh and Lugia are *caught*, each has a configurable 2% chance of
   replacing any Johto wild encounter, and can be caught once (§3, Johto).
8. **Regions can be switched off** from Admin → Config, and the cheats cover unlocking, switching, completing a league
   and merging, so a region is testable without playing to it (§4).
