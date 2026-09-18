-- Trainer potions: item keys a trainer's Pokémon can drink in battle (one each, strongest first), for databases
-- created before it (no-op on a fresh install). Run before seed.sql.
alter table trainers add column if not exists items jsonb not null default '[]';
