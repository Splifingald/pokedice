-- v1.7 columns, for databases created before them (no-ops on a fresh install). Run before seed.sql.
alter table dice_types add column if not exists description text not null default '';
alter table areas add column if not exists enemy_upgrade_level int;
alter table trainers add column if not exists upgrade_level int;
