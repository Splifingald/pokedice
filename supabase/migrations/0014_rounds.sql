-- v1.10: rounds replace the exploration gauge. For databases created before it (no-op on a fresh install);
-- xp_to_unlock_next stays, unused. seed.sql adds the column too, so pasting seed.sql alone is enough.
alter table areas add column if not exists rounds_to_clear int;
