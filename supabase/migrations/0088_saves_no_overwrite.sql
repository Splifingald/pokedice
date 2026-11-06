-- An upload never writes over a save it wasn't based on (2026-10-29).
--
-- Since 2026-10-22 the game uploads a save only over the copy it last matched (src/save/cloud.ts pushCloudSave: an
-- update filtered on the row's stamp) and inserts only when it knows of no row at all. Pages still running a build from
-- before that upload with a plain upsert (insert … on conflict do update), written over whatever the row holds. Such a
-- page, left open on a phone or a PC for days, resumes on its old code for a few minutes before it reloads, and its
-- uploads drop every part of the save its build never knew (raids won, rebattles, small worlds, General upgrades, Mega
-- Gems…) or put back a copy days old. The API logs of 25–29 Oct 2026 show 46 players overwritten that way.
--
-- Those pages can't be updated, so the database refuses them: an insert where the player's save already exists fails
-- with unique_violation (23505), before the upsert can turn into an update. The game today never inserts over a row
-- (it reads that error as "another device saved first" and compares again), so only the old pages are refused. A
-- player's first upload, and the first one of an Extreme save beside the main one, insert as before.
--
-- Run after 0039 (the realm column). Safe to run again. seed.sql inlines it (scripts/seed.ts).

begin;

create or replace function saves_no_overwrite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from saves s where s.user_id = new.user_id and s.realm = new.realm) then
    raise exception 'save already exists for %', new.user_id using errcode = '23505';
  end if;
  return new;
end
$$;

revoke all on function saves_no_overwrite() from public, anon, authenticated;

drop trigger if exists saves_no_overwrite on saves;
create trigger saves_no_overwrite before insert on saves for each row execute function saves_no_overwrite();

commit;
