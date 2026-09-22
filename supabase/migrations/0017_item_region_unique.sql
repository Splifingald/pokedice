-- v1.11: an item can belong to one region, and can be sold only once there.
--   region    — the only region whose Mart stocks it; null = every region does.
--   once_only — once sold in a region, never offered there again, used or not.
--               ("unique" is a reserved word in Postgres, hence the name.)
-- For databases created before this migration; seed.sql adds the columns too.
alter table items add column if not exists region text;
alter table items add column if not exists once_only boolean not null default false;
