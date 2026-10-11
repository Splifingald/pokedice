-- Settings → Delete all my data (the red button at the foot of the page): a signed-in player deletes every row the
-- game keeps about them. That is what deleting their account would take with it (each `on delete cascade` to
-- auth.users: the save, the trainer card and its regions, the friend ID and every friendship, Versus teams and fights,
-- event state, raid teams and gifts), plus their friend lookups, which only name them. The leaderboard is read from the
-- trainer cards (0033), so they leave it at once.
-- The account itself stays, so they can start over and sign in again.
--
-- What stays is the admin's: a leaderboard ban (deleting it would lift it), analytics, and the messages they sent
-- through Contact. On account deletion those keep their rows too (`on delete set null`).
--
-- Run once on the live database, after 0035; safe to run again. Until it runs, the button deletes nothing and says
-- the online data couldn't be deleted.

create or replace function delete_my_data()
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  delete from saves where user_id = me;
  delete from player_cards where user_id = me; -- and player_card_regions, on delete cascade
  delete from friend_codes where user_id = me;
  delete from friendships where user_a = me or user_b = me;
  delete from friend_attempts where actor = me::text;
  delete from versus_teams where user_id = me;
  delete from versus_battles where attacker_id = me or defender_id = me;
  delete from event_state where user_id = me;
  delete from raid_teams where user_id = me;
  delete from raid_gifts where helper_id = me or raider_id = me;
end
$$;

revoke all on function delete_my_data() from public, anon;
grant execute on function delete_my_data() to authenticated;
