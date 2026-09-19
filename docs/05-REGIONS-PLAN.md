# Pokédice — Multi-Region Plan (Johto & Hoenn)

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
| The attached Gen 2 / Gen 3 Pokémon sheets are **lossy WebP at ~40px cells** (native is 64px, and flat background colours have compression noise) | `images/1.webp`, `2.webp`, `5.webp` | They cannot yield sprites matching today's quality — see §1 for the two options |
| The attached trainer sheets are **lossless PNG at native scale** (HGSS 973×1798, RSE 651×726, flat backgrounds) | `images/3.png`, `4.png` | Usable as-is by a variant of `scripts/trainer-sprites.ts` |

Kanto's shape, for balancing reference: 22 linear areas + 6 hidden/post-game, level band 2→72, `enemyUpgradeLevel`
1→9, `roundsToClear` 1–2, 226 trainers, 151 species, 5 legendaries.

---

## Step 1 — Sprites

### 1a. Pokémon (Gen 1 replaced, Gen 2 and 3 added)

Target, per species, unchanged from today: `front`, `front_shiny`, `back`, `back_shiny`, `mini_1`, `mini_2` in
`public/pokemon/NNN_*.png`, plus `src/data/sprite-metrics.json` (bottom transparent rows, so each sprite stands on its
platform).

Two viable sources, and the choice changes the work:

- **A — PokeAPI sprite repo (recommended).** `raw.githubusercontent.com/PokeAPI/sprites` serves the same Gen 3 art,
  lossless, already cut and background-free: `versions/generation-iii/emerald/{dex}.png` + `/shiny/`,
  `versions/generation-iii/firered-leafgreen/back/{dex}.png` + `/back/shiny/`, all verified 200 for 152–386. Minis come
  from `versions/generation-vii/icons/{dex}.png`. A new `scripts/pokemon-sprites.ts --fetch` mode downloads, trims,
  pads to 64×64 and writes the same six files. Deterministic, cached, no sheet geometry to reverse-engineer.
  Caveat: the Gen 7 icons are a different style from today's 32×32 GBA box icons — either accept the swap for all three
  generations (consistent), or keep GBA icons only where a sheet provides them.
- **B — the attached sheets.** Extend `scripts/pokemon-sprites.ts` with the Polar Koala layout. Fast to write (the
  flood-fill background clear and the publish path already exist) but the output is upscaled-from-40px and
  colour-noised; Kanto would get *worse* than it is today. Only worth it if the original full-size PNG sheets are
  supplied.

Either way: `pnpm pokemon-sprites --publish` stays the one command that fills `public/pokemon/`, and
`scripts/seed.ts`'s `SPRITE()` helper needs no change.

### 1b. Trainers

`scripts/trainer-sprites.ts` gains two sheets:

- `graphics/trainers/hgss.png` (from `images/3.png`) — labelled rows: Ethan/Lyra/Silver, eight "other trainers" blocks,
  then Falkner→Clair, Will→Karen, the Kanto leaders, Lance, Red, Team Rocket, Giovanni, Frontier Brains. Cell pitch
  reads as ~74px on a blue/green backdrop; cut per labelled band, not one uniform grid.
- `graphics/trainers/rse.png` (from `images/4.png`) — 10 columns × ~65px on the green backdrop, RSE trainer classes.

Output `public/trainers/classes/johto/*.png` and `…/hoenn/*.png`, and extend `trainerSprite(name, role, region)` with a
name→sprite table per region (same pattern as the Kanto one). Frames the player characters are not used: the player
keeps Red/Green.

**Acceptance:** `public/pokemon` holds 386 × 6 files, every one with a transparent background and non-empty;
`sprite-metrics.json` has 386 entries; the Kitchen Sink screen renders a Gen 2 and a Gen 3 Pokémon front/back/shiny
without visual regression on Kanto; every seeded trainer resolves to an existing sprite file (a test asserts this).

---

## Step 2 — Species data for 152–386

`scripts/seed.ts` becomes generation-aware:

1. `API` gets a mirror fallback: `https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2` (same JSON
   shape, `index.json` suffix), kept behind the existing `scripts/.cache/` so re-runs are offline and idempotent.
2. `KANTO = 151` → `DEX_MAX = 386`; `fetchSpecies()` loops 1..386. Evolution chains, the type chart (Gen 6+, already
   fairy-aware) and capture rates come through unchanged.
3. **Dice schedule** (`dicePlan`, spec §4.2) is generation-agnostic already — it reads stage, line length and BST. Spot
   checks needed for shapes Kanto lacks: baby Pokémon (Pichu/Igglybuff/Tyrogue → 3-stage lines), Wurmple's split,
   Shedinja (1 HP — it is the Gen 1 note's "none in Kanto"; give it a floor of 1 and a `FAMILY_PLAN` override),
   Wobbuffet, and the pseudo-legendaries (Tyranitar, Salamence, Metagross → 5 dice like Dragonite).
4. **Legendary dice/catch values**: Ho-Oh, Lugia, the beasts, Celebi, the Regis, Latios/Latias, Groudon, Kyogre,
   Rayquaza, Jirachi, Deoxys get the Mewtwo treatment (5 dice, `catchValue` 9).
5. **Evolution triggers without a day/night cycle or trading** — assigned levels follow the Kanto table (stone 28,
   trade 34, happiness/other 30), with trade-evolutions re-pointed at the new evolution items below:

| Trigger | Species | Becomes |
|---|---|---|
| Metal Coat | Onix, Scyther | item evolution, level-free |
| King's Rock | Poliwhirl, Slowpoke | item evolution (branching with the level ones — see §4) |
| Dragon Scale | Seadra | item evolution |
| Up-Grade | Porygon | item evolution |
| Sun Stone | Gloom, Sunkern | item evolution |
| Deepseatooth / Deepseascale | Clamperl | item evolution, two branches |
| Happiness | Golbat, Chansey, Eevee→Espeon/Umbreon, Togepi, Azurill… | level 30 (Eevee 28, joining the existing branch set) |
| Beauty | Feebas → Milotic | level 30 |
| Level-up w/ empty slot | Nincada → Ninjask (+Shedinja) | level 20; Shedinja handled as a second branch |

6. **New items** in `scripts/seed.ts`'s `ITEMS`: `sun-stone`, `kings-rock`, `metal-coat`, `dragon-scale`, `up-grade`,
   `deepseatooth`, `deepseascale`, `root-fossil`, `claw-fossil`. Prices and shop gating mirror the Kanto stones;
   fossils use the existing `{kind:'fossil', dex, level, hours}` effect (`src/engine/fossils.ts` needs no change).

### 2b. The Master Ball

The item already exists (`inShop: false`, so `sellPrice()` is already 0 — **it cannot be sold**, no code change) but is
currently a Silph Co. one-time find. Three changes:

- `effect.bonus` 9 → **10** (`d6 + 10` against a catch value of at most 9: a guaranteed catch, with headroom if catch
  values ever grow).
- It moves to the **Rocket Hideout** loot table as a rare, once-per-save find: `['master-ball', 2, 1, 1, true]` against
  a deck of ~100 copies — roughly a 2% card, and gone from the table once found. Silph Co. keeps its Rare Candy.
- **It survives a region change.** `switchRegion`/`startRegion` (§4) carry the Master Ball count across instead of
  resetting it with the rest of the bag — the one exception to "the bag resets". Johto's Rocket HQ and Hoenn's
  Magma/Aqua Hideout each hold one of their own on the same rare terms, so a completionist can bank three.

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
source), **Ilex Shrine** (Celebi), **Tin Tower / roaming beasts** (Raikou, Entei, Suicune as bosses gated on team
average). Unlock conditions reuse `{kind:'pokedex'|'level'|'area'}` exactly as Kanto's secrets do.

Special events: Game Corner in Goldenrod (the existing `casino` card, prize Pokémon Abra/Dratini), Bug-Catching Contest
in National Park (a `casino`-style one-off, or plain trainer gauntlet if it needs new UI — decide in step 4), Day Care
on Route 34 (already a global feature — see §4 for whether it is per-region), Red Gyarados at Lake of Rage as a
guaranteed-shiny boss.

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

### Engine

- `linearAreas(data, regionId)` and `isAreaUnlocked` / `badgeCase` / `clearIfDone` / `finishRound` scoped to the
  active region's chain. `data.areas` stays one flat list.
- New `RunEvent`s: `{kind:'league_done', regionId}` and `{kind:'region_unlocked', regionId}`, raised by `clearIfDone`
  when the cleared area is the region's `leagueAreaKey`.
- **Branching evolutions prefer an unowned species** (replaces the uniform pick in `progression.ts:gainXp`): given the
  ready branches, filter to those whose `toDex` is not in the active `pokedex`; pick uniformly among those, or among
  all of them if the player owns every branch. `gainXp` takes an optional `owned: Set<number>`; every caller passes
  `save.pokedex`. Covers Eevee, Tyrogue, Wurmple, Nincada, Clamperl, Poliwhirl, Slowpoke, Gloom, Snorunt.

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

## Open decisions

1. **Sprite source** (§1a): PokeAPI's lossless Gen 3 sprites (recommended) vs. cutting the attached WebP sheets.
2. **Upgrade tracks on region change**: this plan resets combo/die levels with everything else and takes the max on
   merge. The alternative — keeping them global — makes region 2 and 3 markedly easier.
3. **Day Care and energy**: planned as per-region (Day Care is a Johto/Hoenn location too) and global (energy),
   respectively.
4. **Master Ball carry-over** (§2b): read as "the same Master Ball is still yours in the next region". If it was meant
   only as "the item exists in Gen 2/3 content too", say so and it resets with the rest of the bag.
5. **Kanto post-game** (Victory Road II / Indigo Plateau II) currently sits after Indigo Plateau I. It stays Kanto
   content, reachable any time via the region switcher, and is *not* required to unlock Johto.
