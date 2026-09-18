-- Analytics: two background event kinds. 'playtime' = seconds actually played since the previous one; 'snapshot' =
-- the player's current Pokédex, area, team and bag (sent when it changes). Admin reads them; players only insert.
alter table analytics_events drop constraint if exists analytics_events_kind_check;
alter table analytics_events add constraint analytics_events_kind_check check (kind in (
  'login', 'game_started', 'level_up', 'evolved', 'area_unlocked', 'badge', 'item_bought', 'item_used', 'upgrade',
  'playtime', 'snapshot'
));

-- The admin's player panel reads a player's latest snapshot.
create index if not exists analytics_events_player_kind on analytics_events (coalesce(user_id::text, device_id), kind, created_at desc);
