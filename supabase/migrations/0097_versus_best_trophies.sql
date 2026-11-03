-- The most trophies a player has ever held in the Versus league (docs/44 §10), on the trainer card in place of the old
-- board's wins: theirs, and a friend's on the friend's card.
--
-- The league starts again from 0 every Monday, and a week's row keeps only where its trophies stand now. So each row
-- gets its high mark (`best`), raised by a trigger whenever the trophies go past it, whichever function moved them (a
-- match's start and its result, the bots' climb): none of 0082's functions is written again. The weeks fought before
-- this ran get theirs from their matches (the trophies before each one, and after each one finished).
--
-- Run after 0082 (and 0033, for the friends); safe to run again. supabase/seed.sql doesn't inline it.

alter table versus_league_members add column if not exists best int not null default 0;

create or replace function versus_league_members_best()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.best := greatest(coalesce(new.best, 0), new.trophies);
  return new;
end
$$;

drop trigger if exists versus_league_members_best on versus_league_members;
create trigger versus_league_members_best
  before insert or update of trophies, best on versus_league_members
  for each row execute function versus_league_members_best();

-- The weeks already fought: the trophies now, before every match, and right after every finished one.
update versus_league_members m
set best = h.best
from (
  select m2.id,
         greatest(m2.trophies, coalesce(max(greatest(
           x.trophies_before,
           case when x.finished_at is not null then x.trophies_before + x.delta else 0 end
         )), 0)) as best
  from versus_league_members m2
  left join versus_league_matches x on x.week = m2.week and x.user_id = m2.user_id
  group by m2.id, m2.trophies
) h
where h.id = m.id and h.best > m.best;

-- The caller's high mark across every week of the league, this one included, or a friend's (`p_user`). Null while the
-- league is closed to the caller, signed out, or for someone who isn't their friend; 0 for a player who never fought.
create or replace function versus_league_best(p_user uuid default null)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who uuid := coalesce(p_user, auth.uid());
begin
  if me is null or not versus_league_open() then return null; end if;
  if who <> me and not exists (select 1 from friend_ids_of(me) f where f.id = who) then return null; end if;
  return coalesce((select max(m.best) from versus_league_members m where m.user_id = who), 0);
end
$$;

revoke all on function versus_league_best(uuid) from public;
grant execute on function versus_league_best(uuid) to authenticated;
