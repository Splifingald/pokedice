-- Endgame rival Champion: a trainer shown only to players whose starter is `rival_of` (1, 4 or 7), for databases
-- created before it (no-op on a fresh install). Run before seed.sql.
alter table trainers add column if not exists rival_of int;
