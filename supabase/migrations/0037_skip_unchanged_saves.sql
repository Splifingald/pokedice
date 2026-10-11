-- A save upload that changes nothing is dropped before it is written.
--
-- Until the build that compares saves key-order-blind (src/save/cloud.ts), every game load uploaded the whole save
-- again: Postgres hands jsonb back with its keys reordered, so the game took its own save, back from the cloud, for a
-- newer one. Each of those rewrote the whole row (about 50 kB of JSON, as TOAST), its WAL, and fired the triggers on
-- saves (the player card, 0033) — ~220 ms of database time per load. Measured on 10–11 Oct 2026: ~14,500 uploads a day,
-- most of them from pages reloaded every second or two for hours. Tabs still running an older build keep doing it
-- until their next reload, hence this guard on the database side too.
--
-- jsonb equality ignores key order, so an upload equal to the row is skipped: no write, no WAL, no trigger after it.
-- The upload still answers success, and the game carries on as if it had been written (it was already there).
--
-- Run once. Safe to run again.

create or replace function saves_skip_unchanged()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data = old.data then
    return null;
  end if;
  return new;
end
$$;

revoke all on function saves_skip_unchanged() from public, anon, authenticated;

drop trigger if exists saves_skip_unchanged on saves;
create trigger saves_skip_unchanged before update on saves
  for each row execute function saves_skip_unchanged();
