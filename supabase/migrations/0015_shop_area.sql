-- v1.10: an item can wait for an area to be unlocked before the Poké Mart sells it (evolution stones: Celadon).
-- For databases created before it; seed.sql adds the column too.
alter table items add column if not exists shop_area uuid;
