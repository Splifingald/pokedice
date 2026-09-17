-- v1.9 columns (battle scenes), for databases created before them (no-ops on a fresh install). Run before seed.sql.
alter table areas add column if not exists battle_background text;
alter table trainers add column if not exists battle_background text;
