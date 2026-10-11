-- Regions: Kanto, Johto, Hoenn. A region is a self-contained run — its own chain of areas, its own starters, its own
-- Pokédex page and its own leaderboard — and the player keeps only their character when they move on.

create table if not exists regions (
  id text primary key,                 -- 'kanto', 'johto', 'hoenn'
  name text not null,
  order_index int not null unique,
  dex_range jsonb not null,            -- [1, 151]: the generation this region's page is about
  starters jsonb not null,             -- [1, 4, 7]
  starter_level int not null default 5,
  league_area_id uuid not null,        -- clearing this area is "the league is done" (a soft link to areas.id)
  -- Soft links, deliberately not foreign keys: admin saves regions row by row, and a half-finished chain (Johto
  -- pointing at a Hoenn that is not written yet) must not be rejected. The client tolerates a dangling id.
  next_region text,
  -- Off = the region is invisible everywhere: no prompt, no switcher, no Pokédex page, no board. Kanto is always on.
  enabled boolean not null default true
);

alter table regions enable row level security;
drop policy if exists regions_read on regions;
drop policy if exists regions_write on regions;
create policy regions_read on regions for select using (true);
create policy regions_write on regions for all using (is_admin()) with check (is_admin());

-- Which region's chain an area belongs to. Existing rows are Kanto, which is what they have always been.
alter table areas add column if not exists region_id text not null default 'kanto';
create index if not exists areas_region_idx on areas (region_id, order_index);

-- ---------------------------------------------------------------- leaderboard
--
-- The per-region leaderboard used to live here (0016, then 0023, 0024, 0026, 0031, 0032). It now reads player cards
-- and lives in 0033_friends.sql, which seed.sql inlines right after this file. The cards' one Day Care (each resident
-- counted for its own region, the residents for the friend picker, friend_day_cares()) is 0034_day_care.sql, inlined
-- after 0033.
