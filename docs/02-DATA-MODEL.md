# Pokédice — Data Model, Schema & Seeding

Companion to `01-GAME-SPEC.md`. Everything here is database + generation.

---

## 1. Principle: the game must run without Supabase

All game *configuration* (Pokémon, areas, trainers, dice, upgrade curves, type chart, config) is bundled into the app as generated JSON at build time, and **also** stored in Supabase. On boot:

1. Load the bundled JSON immediately — the game is playable in <100 ms, offline, signed out.
2. Fire a background fetch of the Supabase config tables. If it succeeds and the `config_version` differs, hot-swap the in-memory config and show a small "Content updated" toast.

This means: Supabase down → game still works. Admin edits → live for everyone on next load, no redeploy. This is the single most important architectural decision in the project.

---

## 2. Supabase schema

```sql
-- ============ CONFIG TABLES (public read, admin write) ============

create table type_chart (
  attacking text not null,
  defending text not null,
  multiplier numeric not null,      -- 0, 0.5, 2
  primary key (attacking, defending)
);

create table dice_types (
  type text primary key,            -- 'base', 'normal', 'fire', ... (19 rows: 'base' + 18 types)
  label text not null,
  color text not null,              -- hex, used for the die and its particles
  faces jsonb not null,             -- [{kind:'number',value:4} | {kind:'status',status:'burn',value:1}] x6
  upgradeable boolean not null default true,  -- FALSE for 'base' only
  description text not null default '',  -- a few words under the faces ('Stacking burn')
  counts_for_majority boolean not null default true, -- can set the attack type (v1.8); FALSE for 'base' only
  sort_order int not null default 0
);

create table pokemon (
  dex int primary key,              -- 1..151
  name text not null,
  type1 text not null,
  type2 text,
  base_hp int not null,             -- HP stat at level 1
  max_hp int not null,              -- HP stat at level 100
  speed int not null,               -- base Speed stat ÷ 10, rounded down
  sprite_url text not null,
  dice jsonb not null,              -- [{type:'fire',count:2},{type:'flying',count:1},{type:'normal',count:2}]
  rerolls int not null,
  catch_value int not null default 5,       -- 1 (always caught) … 9 (legendary); seeded from the Gen 1 capture rate
  evolutions jsonb not null default '[]',   -- [{toDex:6, level:36}] ; >1 entry = random pick
  milestones jsonb not null default '[]',   -- [{level:20, effect:'ADD_DIE', dieType:'fire'}]
  notes text
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  order_index int not null unique,
  name text not null,
  banner_url text,
  xp_to_unlock_next int,   -- null = endless (Victory Road)
  min_level int not null,
  max_level int not null,
  encounter_weights jsonb not null,          -- {wild:60, trainer:25, center:10, item:0}
  backtrack_multiplier numeric not null default 0.5,
  legendary_boss jsonb,                      -- null | {dex:145, level:25} | [{dex,level,teamAvgThreshold,upgradeLevel}]
  scales_to_team boolean not null default false,
  easy_mode boolean not null default false,  -- a Center comes next whenever a team member is K.O. (migration 0002)
  enemy_upgrade_level int                   -- foes' dice/combo upgrade level; null = game_config.enemyUpgradeLevel (v1.7)
);

create table area_wild_pool (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  dex int not null references pokemon(dex),
  weight int not null default 10,
  min_level int not null,
  max_level int not null
);

create table trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sprite_url text,
  team jsonb not null,                       -- [{dex:16, level:7}, ...] 1..3 entries
  upgrade_level int                         -- this trainer's dice/combo upgrade level; null = the area's (v1.7)
);

create table area_trainer_pool (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  trainer_id uuid not null references trainers(id) on delete cascade,
  weight int not null default 10
);

-- What item finds turn up in an area (migration 0003). Dealt as a shuffled loot deck: weight = copies of that find
-- in the deck (v1.6), a once-only find counts as one. areas.encounter_weights are copies too.
create table area_loot_pool (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  item_key text not null,           -- an items.key, or 'money' (Pokédollars)
  weight int not null default 10,
  unique_find boolean not null default false,  -- found once per save, then off the table
  min_qty int not null default 1,   -- quantity found (for money: the ₽ amount)
  max_qty int not null default 1
);

create table combo_upgrades (
  combo_key text not null,          -- 'pair', 'full_house', ...
  level int not null,               -- 1..10
  bonus int not null,
  cost int not null,                -- gold to reach THIS level from the previous one; level 1 cost = 0
  primary key (combo_key, level)
);

-- 18 typed dice x 10 levels = 180 rows. 'base' has NO rows and never appears in the upgrade menu.
create table die_upgrades (
  die_type text not null references dice_types(type),
  level int not null,               -- 1..10
  bonus int not null,
  cost int not null,
  primary key (die_type, level)
);

create table items (
  key text primary key,             -- 'potion'
  name text not null,
  description text,
  sprite_url text,
  price int not null,               -- in Pokédollars
  effect jsonb not null,            -- {kind:'heal',amount} | {kind:'cure',statuses:[…]} | {kind:'rerolls',amount}
                                    -- | {kind:'level',amount} | {kind:'ball',bonus}
  in_shop boolean not null default true,
  shop_badges int not null default 0 -- the Poké Mart stocks it once the player holds this many badges
);

create table game_config (
  key text primary key,
  value jsonb not null
);
-- seeded keys: encounterMode ('deck'), startInventory
--              ({poke-ball:5, potion:2}), hpMultiplier (1), xpCurve {A,B,C}, xpShareMode,
--              maxTeamSize, maxLevel, comboPayoutMode,
--              skipPolicy, starters, starterLevel, configVersion, multiExpShare (0.3),
--              xpMultiplier (1: XP = foe level × this, for Pokémon and the exploration bar alike),
-- Keys missing from a database fall back to the bundled defaults, so older databases need no migration.

-- ============ PLAYER DATA ============

create table saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

### 2.1 RLS

```sql
-- helper
create or replace function is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'gregoire.ftn@gmail.com'
$$;

-- every config table:
alter table <t> enable row level security;
create policy "<t>_read"  on <t> for select using (true);
create policy "<t>_write" on <t> for all using (is_admin()) with check (is_admin());

-- saves:
alter table saves enable row level security;
create policy "own_save" on saves for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

The admin email lives in **one** place server-side (`is_admin()`) and one place client-side (`VITE_ADMIN_EMAIL`) used only to decide whether to render the admin nav link. The client-side value is cosmetic; Postgres is the real gate.

---

## 3. Generating the 151

A script, `scripts/seed.ts`, run once locally (`pnpm seed`). It hits PokeAPI, applies deterministic rules, and writes:

- `src/data/pokemon.json`, `type-chart.json`, `dice-types.json`, `areas.json`, `trainers.json`, `upgrades.json`, `items.json`, `config.json` — the offline bundle
- `supabase/seed.sql` — the same data as INSERTs, for the Supabase project

It must be **idempotent and re-runnable**, and it must never overwrite hand-edits that were made in admin (it only writes the bundle + a fresh seed.sql; pushing to a live DB is a separate explicit command).

### 3.1 PokeAPI endpoints

- `GET /api/v2/pokemon/{1..151}` → name, types, `stats` (hp, speed), sprite
- `GET /api/v2/pokemon-species/{n}` → evolution chain URL
- `GET /api/v2/evolution-chain/{n}` → evolution graph with `min_level`, items, trade conditions
- `GET /api/v2/type/{n}` → damage relations, for the 18×18 chart

Cache every response to `scripts/.cache/` so re-runs are instant and offline.

### 3.2 HP stats

PokeAPI gives the **base stat**, not the level-1/level-100 HP. Compute:

```
hpAtLevel(L) = floor( (2*base + 31 + floor(252/4)) * L / 100 ) + L + 10
```
Use IV 31 / EV 0 for a clean curve:
```
hpAtLevel(L) = floor( (2*baseHpStat + 31) * L / 100 ) + L + 10
baseHp = hpAtLevel(1)      // e.g. Charizard base 78 → 12
maxHp  = hpAtLevel(100)    // e.g. Charizard → 297
```
Special case **Shedinja**-style: none in Kanto, ignore.

> Sanity: Charizard 11 → 297. Magikarp (base 20) 11 → 181. Chansey (base 250) 16 → 641. Chansey is a wall — intentional and funny, leave it.

### 3.3 Dice count (v1.8 schedule)

Dice no longer come from BST alone: `applyDiceSchedule` (`scripts/seed.ts`) reads each species' place in its evolution line (stage, line length) and its BST, and `dicePlan` returns the dice it arrives with plus the levels where it gains more (game spec §4.2 table). BST only decides:

```
2nd die level (first stage / no evolution):  BST < 260 → 8 · < 280 → 7 · < 300 → 6 · else 5
5th die at Lv.50 for 2-stage finals and non-evolvers:  BST >= 450
```

Caterpie / Weedle lines (dex 10–15) are fixed at 1 / 2 / 3 dice by stage, +1 at Lv.36 on the final stage. Legendaries have 5 dice. Non-evolvers under BST 450 stop at 3 dice. Per-family overrides (`FAMILY_PLANS`): Magikarp 1 die for good, Omanyte / Kabuto 2, Aerodactyl 4 (+Lv.50), Dragonair 3 (+Lv.40), Mew 4 (+Lv.40). `maxDice` = 5.

### 3.4 Typed vs normal split

The filler die is the **`base`** die (unupgradeable). Typed dice come from the Pokémon's own types.

```
baseCount  = max(1, ceil(diceCount / 3))
typedCount = diceCount - baseCount

(n = 1 → one Type 1 die, v1.8)
if type2 exists AND typedCount >= 2:
    type2Count = max(1, floor(typedCount / 3))
    type1Count = typedCount - type2Count
else:
    type1Count = typedCount          // a single typed die always goes to Type 1
```

| Dice | base | typed | type1 + type2 (dual) |
|---|---|---|---|
| 2 | 1 | 1 | 1 + 0 |
| 3 | 1 | 2 | 1 + 1 |
| 4 | 2 | 2 | 1 + 1 |
| 5 | 2 | 3 | 2 + 1 |
| 6 | 2 | 4 | 3 + 1 |

A die gained later is the one the split adds when going from n−1 to n dice (Charizard's 5th at Lv.50 is fire). **Examples (v1.8):** Squirtle 1 water · Charmeleon 3 dice · Charizard 4 dice (fire, flying, 2 base) → 5 at Lv.50 · Mewtwo 5 dice (3 psychic + 2 base).

**Mono-Normal Pokémon need no special case.** Their Type 1 is Normal, so the algorithm gives them **Normal-type** dice — which have a full upgrade track — alongside their base dice. Snorlax ends at 5 dice = 3 normal + 2 base, of which 3 are upgradeable. Exactly the intent.

**Dragon:** Dratini / Dragonair / Dragonite use the Dragon die `2,3,4,5,6,8` (`01-GAME-SPEC.md` §3.1) — the strongest in the game.

### 3.5 Rerolls

```
rerolls = dice on arrival   (+1 ADD_REROLL with every ADD_DIE milestone)
```
**Examples:** Charmander 1 → 2 at Lv.5 · Charizard 4 → 5 at Lv.50.

### 3.6 Milestones

Since v1.8 the generated milestones are only the dice schedule (§3.3) and the evolution:

```
for each later die:  { level, 'ADD_DIE', dieType }  +  { level, 'ADD_REROLL', amount: 1 }
if it evolves:       { level: E, effect: 'EVOLVE' }
```

`UPGRADE_DIE`, `REPLACE_DIE` and `ADD_HP` still exist for hand-edited milestones in admin — `REPLACE_DIE` swaps any die type for another (`fromDieType` → `dieType`), e.g. re-typing a Pokémon that changes type on evolution.

Evolution levels come from PokeAPI's `min_level`. For non-level evolutions the script assigns:

| Trigger | Assigned level |
|---|---|
| Stone (Fire/Water/Thunder/Leaf/Moon) | **28** |
| Trade (Kadabra, Machoke, Graveler, Haunter) | **34** |
| Happiness / other | **30** |
| Eevee (5 Kanto-era targets… actually 3: Vaporeon, Jolteon, Flareon) | **28**, random among the three |

Final-stage Pokémon with `E = 100` get their three marks at roughly levels 31 / 55 / 80 — which is where **Charizard's level-60-ish reroll** lands: Charizard's marks are 31 / 55 / 80, so his reroll comes at 55. Close enough to your "level 60"; nudge it in admin if you want it exact.

### 3.7 Type chart

Built from PokeAPI's `damage_relations`. Stored as only the non-`1` entries (`0`, `0.5`, `2`); the lookup returns 1 for anything absent. Gen 6+, Fairy included. Steel is **not** resistant to Ghost/Dark (Gen 6 change) — take whatever PokeAPI says, it is current.

---

## 4. Seeded content

### 4.1 Upgrade curves

Generated from the formulas in `01-GAME-SPEC.md` §5.2 into **80** `combo_upgrades` rows (8 combos × 10) and **180** `die_upgrades` rows (18 typed dice × 10). The `base` die gets none.

### 4.2 Areas & trainers

**25** areas per `01-GAME-SPEC.md` §7.1 (22 linear Kanto areas + 3 secret ones), hand-written in `scripts/content.ts`: wild pools from the original games, trainer rosters (explicit teams; the catch-all Cerulean Cave generates its own from the pool), gym leaders / Elite Four / Champion (`trainers.role`, `trainers.badge`, `areas.gyms`), and `areas.hidden` + `areas.unlock_conditions` for the secret areas. Legendaries are excluded from every wild pool and attached as `legendary_boss` instead (Articuno → Seafoam Islands, Zapdos → Power Plant, Moltres → Victory Road, Mewtwo → Cerulean Cave at team-average 60, Mew → Faraway Island on arrival).

The three starters are excluded from every wild pool except Cerulean Cave's catch-all pool, where they are rare (weight 3) so the Pokédex can be completed. No trainer fields a starter.

**Art:** a small Node script publishes the area banner scenes (118×16 strips from `graphics/banners`; a `#flip` URL suffix mirrors one) into `public/banners/` and a set of type-tinted trainer silhouette badges into `public/trainers/`. Both are referenced by URL, so replacing them later is a field edit in admin, not a code change.

### 4.3 Starters

`game_config.starters = [1, 4, 7]` and `game_config.starterLevel = 5`. The title screen reads this list, so changing the available starters is a config edit.

---

## 5. Admin write path

The admin panel writes **directly to Supabase** with the signed-in user's JWT — no server, no service key in the browser. RLS does the enforcement. A "Publish" action bumps `game_config.configVersion`, which is what triggers clients to hot-swap.

An "Export bundle" button downloads the current DB state as the same JSON files the build bundles, so you can commit them and make admin edits part of the offline default.
