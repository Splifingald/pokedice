-- Pokédice v1.5: item finds and loot tables, Poké Mart tiers, dice-based catching. Safe to re-run.
-- Run once in the Supabase SQL editor if your tables were created before this change (a fresh install from
-- 0001_init.sql already has all of it). Then re-run supabase/seed.sql to load the new items, catch values and loot
-- tables — note that seed.sql upserts every content row, so admin edits to those same rows are overwritten (export a
-- bundle from the admin first if you want to keep them).

alter table pokemon add column if not exists catch_value int not null default 5;
alter table items add column if not exists in_shop boolean not null default true;
alter table items add column if not exists shop_badges int not null default 0;

create table if not exists area_loot_pool (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  item_key text not null,                       -- an items.key, or 'money' (Pokédollars)
  weight int not null default 10,
  unique_find boolean not null default false,   -- found once per save
  min_qty int not null default 1,               -- quantity found (for money: the ₽ amount)
  max_qty int not null default 1
);

alter table area_loot_pool enable row level security;
drop policy if exists area_loot_pool_read on area_loot_pool;
drop policy if exists area_loot_pool_write on area_loot_pool;
create policy area_loot_pool_read on area_loot_pool for select using (true);
create policy area_loot_pool_write on area_loot_pool for all using (is_admin()) with check (is_admin());
grant select on area_loot_pool to anon, authenticated;
grant insert, update, delete on area_loot_pool to authenticated;
