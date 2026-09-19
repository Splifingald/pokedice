-- Pokédice — schema + row level security.
-- Run this FIRST in the Supabase SQL editor, then run supabase/seed.sql.

create extension if not exists pgcrypto;

-- ============ CONFIG TABLES (public read, admin write) ============

create table if not exists type_chart (
  attacking text not null,
  defending text not null,
  multiplier numeric not null,      -- 0, 0.5, 2 (absent = 1)
  primary key (attacking, defending)
);

create table if not exists dice_types (
  type text primary key,            -- 'base', 'normal', 'fire', ... (19 rows)
  label text not null,
  color text not null,
  faces jsonb not null,             -- [{kind:'number',value:4} | {kind:'status',status:'burn',value:1}] x6
  description text not null default '', -- a few words shown under the faces ('Stacking burn')
  upgradeable boolean not null default true,
  counts_for_majority boolean not null default true,
  sort_order int not null default 0
);

create table if not exists pokemon (
  dex int primary key,
  name text not null,
  type1 text not null,
  type2 text,
  base_hp int not null,
  max_hp int not null,
  speed int not null,               -- base Speed stat ÷ 10, rounded down
  sprite_url text not null,
  dice jsonb not null,
  rerolls int not null,
  catch_value int not null default 5,           -- 1 (always caught) … 9 (legendary): the catch die (d6) + a ball must reach it
  evolutions jsonb not null default '[]',
  milestones jsonb not null default '[]',
  notes text
);

create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  -- deferrable so the admin can swap two areas' positions in a single save
  order_index int not null constraint areas_order_index_key unique deferrable initially deferred,
  name text not null,
  banner_url text,
  xp_to_unlock_next int,                       -- unused since v1.10 (rounds_to_clear replaced the exploration gauge)
  rounds_to_clear int,                         -- rounds (full encounter decks) to clear the area; null = never (secret areas)
  min_level int not null,
  max_level int not null,
  encounter_weights jsonb not null,
  backtrack_multiplier numeric not null default 0.5,
  legendary_boss jsonb,
  scales_to_team boolean not null default false,
  scale_offsets jsonb,                         -- scaling areas: {wild,trainer: {min,max}} levels vs team avg; null = ± spread
  easy_mode boolean not null default false,    -- a Center comes next whenever a team member is K.O.
  enemy_upgrade_level int,                     -- foes' dice/combo upgrade level; null = game_config.enemyUpgradeLevel
  battle_background text,                      -- grass | sea | water | rock | default; null = default
  hidden boolean not null default false,       -- hidden areas unlock by condition, outside the linear chain
  unlock_conditions jsonb,                     -- null | [{kind:'pokedex',count} | {kind:'maxLevel',level}]
  gyms jsonb not null default '[]'             -- trainer ids fought in order once the gauge is full
);

create table if not exists area_wild_pool (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  dex int not null references pokemon(dex),
  weight int not null default 10,
  min_level int not null,
  max_level int not null
);

create table if not exists trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sprite_url text,
  team jsonb not null,                          -- [{dex, level}] 1..3
  role text not null default 'trainer',         -- trainer | leader | elite | champion
  badge text,                                   -- gym leaders only
  upgrade_level int,                            -- this trainer's upgrade level; null = the area's
  battle_background text,                       -- battle scene override; null = the area's
  rival_of int,                                 -- rival version: only for players whose starter is this dex
  items jsonb not null default '[]'             -- potions (item keys), one per Pokémon, strongest first
);

-- v1.3 columns, for databases created before them (no-ops on a fresh install).
alter table areas add column if not exists hidden boolean not null default false;
alter table areas add column if not exists unlock_conditions jsonb;
alter table areas add column if not exists gyms jsonb not null default '[]';
alter table trainers add column if not exists role text not null default 'trainer';
alter table trainers add column if not exists badge text;

create table if not exists area_trainer_pool (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  trainer_id uuid not null references trainers(id) on delete cascade,
  weight int not null default 10
);

create table if not exists area_loot_pool (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  item_key text not null,                       -- an items.key, or 'money' (Pokédollars)
  weight int not null default 10,
  unique_find boolean not null default false,   -- found once per save
  min_qty int not null default 1,               -- quantity found (for money: the ₽ amount)
  max_qty int not null default 1
);

create table if not exists combo_upgrades (
  combo_key text not null,
  level int not null,
  bonus int not null,
  cost int not null,
  primary key (combo_key, level)
);

create table if not exists die_upgrades (
  die_type text not null references dice_types(type),
  level int not null,
  bonus int not null,
  cost int not null,
  primary key (die_type, level)
);

create table if not exists items (
  key text primary key,
  name text not null,
  description text,
  sprite_url text,
  price int not null,
  effect jsonb not null,                        -- {kind:'heal'|'revive'|'cure'|'rerolls'|'level'|'stone'|'fossil'|'ball', …}
  in_shop boolean not null default true,
  shop_badges int not null default 0,           -- sold once the player holds this many badges
  shop_area uuid                                -- …and once this area is unlocked (null = no area needed)
);

create table if not exists game_config (
  key text primary key,
  value jsonb not null
);

-- v1.4–v1.5 columns, for databases created before them (no-ops on a fresh install; see migrations 0002–0003).
alter table areas add column if not exists easy_mode boolean not null default false;
alter table pokemon add column if not exists catch_value int not null default 5;
alter table items add column if not exists in_shop boolean not null default true;
alter table items add column if not exists shop_badges int not null default 0;

-- ============ PLAYER DATA ============

create table if not exists saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============ RLS ============

create or replace function is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'gregoire.ftn@gmail.com'
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'type_chart', 'dice_types', 'pokemon', 'areas', 'area_wild_pool', 'trainers',
    'area_trainer_pool', 'area_loot_pool', 'combo_upgrades', 'die_upgrades', 'items', 'game_config'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || '_write', t);
  end loop;
end $$;

alter table saves enable row level security;
drop policy if exists "own_save" on saves;
create policy "own_save" on saves for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Table privileges (Supabase grants these by default in `public`; explicit for safety).
grant select on type_chart, dice_types, pokemon, areas, area_wild_pool, trainers,
  area_trainer_pool, area_loot_pool, combo_upgrades, die_upgrades, items, game_config to anon, authenticated;
grant insert, update, delete on type_chart, dice_types, pokemon, areas, area_wild_pool, trainers,
  area_trainer_pool, area_loot_pool, combo_upgrades, die_upgrades, items, game_config to authenticated;
grant select, insert, update, delete on saves to authenticated;
