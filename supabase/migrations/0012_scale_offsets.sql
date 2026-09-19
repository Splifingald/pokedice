-- Scaling areas: per-kind level ranges around the team average ({"wild": {"min": -15, "max": -10}, "trainer": …}),
-- for databases created before it (no-op on a fresh install). Null keeps ± game_config.scaleLevelSpread.
alter table areas add column if not exists scale_offsets jsonb;
