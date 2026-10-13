-- Friend invite rewards (docs/15 §24): each NEW player someone invites with their invite link (/f/<code>, docs/16) who
-- goes on to win their first badge fills that player's gauge; each tier the gauge reaches gives its gifts once — by
-- default 1 friend a Rare Candy, 2 ₽1,000, 3 a shiny Ditto, 4 a Master Ball — opened in the game like the developer's
-- gifts (0048; src/engine/invites.ts puts them away).
--
-- 1. game_config `inviteRewards`: the switch (Off / On for admin / On for everyone, off by default: docs/15 §20) and
--    the tiers, inserted only if missing so seeding never clobbers the admin's. Off, no invite is counted, nothing shows
--    and nothing can be claimed; what was counted stays.
-- 2. friend_invites: who invited whom, one row per invited player, ever: a player is invited once, by the first link
--    that counted. invite_record() writes it right after the invite link made the two of them friends, and only for a
--    new player — no badge in the game that called (it says so: a save not uploaded yet) nor on their main card.
-- 3. A trigger on saves stamps `badge_at` when an invited player's main card first shows a badge (the card is written
--    by saves_card just before: same timing, by name). Their badges are the main game's: Extreme mode has its own.
-- 4. invite_status(): the gauge (players with their first badge, players still on their way, the tiers claimed, the
--    latest to count); invite_rewards_claim(): every tier reached and not claimed yet, each handed over once with the
--    gifts it holds now. The game puts them in its save.
-- 5. Deleting your main save (Delete my data) takes your gauge and claims with it. The row that says you were invited
--    stays, without your name (the cards go): it is your inviter's progress, and you can't be invited a second time.
--
-- Run after 0048 (the gifts' checks); safe to run again.

-- ---------------------------------------------------------------- 1. the switch and the tiers

-- The game's defaults (engine/defaults.ts; tests/invites-sql.test.ts keeps the two the same).
insert into game_config (key, value) values ('inviteRewards', '{
  "access": "off",
  "tiers": [
    {"friends": 1, "gifts": [{"kind": "item", "key": "rare-candy", "qty": 1, "region": "latest"}]},
    {"friends": 2, "gifts": [{"kind": "gold", "amount": 1000, "region": "latest"}]},
    {"friends": 3, "gifts": [{"kind": "pokemon", "dex": 132, "level": 10, "shiny": true, "region": "latest"}]},
    {"friends": 4, "gifts": [{"kind": "item", "key": "master-ball", "qty": 1, "region": "latest"}]}
  ]
}'::jsonb)
on conflict (key) do nothing;

-- The admin's row over the defaults: a key the row lacks keeps its default.
create or replace function invite_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{
    "access": "off",
    "tiers": [
      {"friends": 1, "gifts": [{"kind": "item", "key": "rare-candy", "qty": 1, "region": "latest"}]},
      {"friends": 2, "gifts": [{"kind": "gold", "amount": 1000, "region": "latest"}]},
      {"friends": 3, "gifts": [{"kind": "pokemon", "dex": 132, "level": 10, "shiny": true, "region": "latest"}]},
      {"friends": 4, "gifts": [{"kind": "item", "key": "master-ball", "qty": 1, "region": "latest"}]}
    ]
  }'::jsonb
  || coalesce((select value from game_config where key = 'inviteRewards' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- On for everyone, or for the admin only (as trade_open reads its own).
create or replace function invite_rewards_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(invite_cfg() ->> 'access', 'off') = 'all' or (invite_cfg() ->> 'access' = 'admin' and is_admin())
$$;

-- The tiers as the server reads them: a whole number of friends from 1 to 99 and a gift list the gifts' check accepts
-- (0048). Anything else is left out, never the rest.
create or replace function invite_tiers()
returns table (friends int, gifts jsonb)
language sql stable security definer set search_path = public as $$
  select t.friends, t.gifts
  from (
    select case when e ->> 'friends' ~ '^[0-9]{1,2}$' then (e ->> 'friends')::int end as friends, e -> 'gifts' as gifts
    from jsonb_array_elements(
      case when jsonb_typeof(invite_cfg() -> 'tiers') = 'array' then invite_cfg() -> 'tiers' else '[]'::jsonb end
    ) e
    where jsonb_typeof(e) = 'object'
  ) t
  where t.friends between 1 and 99 and jsonb_typeof(t.gifts) = 'array' and feedback_gifts_ok(t.gifts)
$$;

-- ---------------------------------------------------------------- 2. who invited whom

create table if not exists friend_invites (
  invitee uuid primary key references auth.users(id) on delete cascade,
  inviter uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  badge_at timestamptz,                    -- when the invited player's main card first showed a badge: it counts
  check (invitee <> inviter)
);
create index if not exists friend_invites_inviter on friend_invites (inviter);

-- One row per tier handed over, with the gifts it held then.
create table if not exists invite_reward_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  friends int not null check (friends between 1 and 99),
  gifts jsonb not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, friends)
);

alter table friend_invites enable row level security;
alter table invite_reward_claims enable row level security;
revoke all on friend_invites, invite_reward_claims from anon, authenticated;
drop policy if exists friend_invites_admin on friend_invites;
create policy friend_invites_admin on friend_invites for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists invite_reward_claims_admin on invite_reward_claims;
create policy invite_reward_claims_admin on invite_reward_claims for all
  using ((select is_admin())) with check ((select is_admin()));

-- The invite link made the caller and the code's owner friends (friend_add, 'added'): the owner invited them, if they
-- are a new player. `p_badges` is the badge count of the game that calls, for a save the server hasn't seen yet. On
-- while the switch is on for anyone (the admin's try-out counts the players they invite). Statuses: counted, already
-- (invited before), not_new, not_friends, not_found, off.
create or replace function invite_record(p_code text, p_badges int default 0)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then
    raise exception 'invites_signed_out' using errcode = '42501';
  end if;
  if coalesce(invite_cfg() ->> 'access', 'off') not in ('admin', 'all') then
    return 'off';
  end if;
  -- Rate-limited with the friends' lookups and adds: no guessing codes through here.
  perform friend_attempt(uid::text);
  select f.user_id into owner from friend_codes f where f.code = friend_norm(p_code);
  if owner is null or owner = uid then
    return 'not_found';
  end if;
  if not exists (select 1 from friendships f where f.user_a = least(uid, owner) and f.user_b = greatest(uid, owner)) then
    return 'not_friends';
  end if;
  if exists (select 1 from friend_invites i where i.invitee = uid) then
    return 'already';
  end if;
  if coalesce(p_badges, 1) <> 0
     or exists (select 1 from player_card_regions r where r.user_id = uid and r.realm = 'main' and cardinality(r.badges) > 0)
     -- Two new players can't each count for the other.
     or exists (select 1 from friend_invites i where i.invitee = owner and i.inviter = uid) then
    return 'not_new';
  end if;
  insert into friend_invites (invitee, inviter) values (uid, owner) on conflict (invitee) do nothing;
  return case when found then 'counted' else 'already' end;
end
$$;

-- ---------------------------------------------------------------- 3. the first badge

-- After saves_card (by name) has written the main card: an invited player's first badge counts for their inviter.
-- Nothing at all for everyone else but one index lookup.
create or replace function saves_invite()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if exists (select 1 from friend_invites i where i.invitee = new.user_id and i.badge_at is null)
       and exists (
         select 1 from player_card_regions r
         where r.user_id = new.user_id and r.realm = 'main' and cardinality(r.badges) > 0
       ) then
      update friend_invites set badge_at = now() where invitee = new.user_id and badge_at is null;
    end if;
  exception when others then
    -- The save is written either way; the next upload tries again.
    raise warning 'invite badge for %: %', new.user_id, sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists saves_invite on saves;
create trigger saves_invite after insert or update of data, updated_at on saves
  for each row when (new.realm = 'main') execute function saves_invite();

-- Delete my data (the main save goes): the player's own gauge and claims go with it.
create or replace function saves_invites_gone()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friend_invites where inviter = old.user_id;
  delete from invite_reward_claims where user_id = old.user_id;
  return null;
end
$$;
drop trigger if exists saves_invites_gone on saves;
create trigger saves_invites_gone after delete on saves
  for each row when (old.realm = 'main') execute function saves_invites_gone();

-- ---------------------------------------------------------------- 4. the gauge and the claim

-- The caller's gauge: null while the switch is off for them. A few dozen bytes.
create or replace function invite_status()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or not invite_rewards_open() then null else jsonb_build_object(
    'count', (select count(*) from friend_invites i where i.inviter = auth.uid() and i.badge_at is not null),
    'pending', (select count(*) from friend_invites i where i.inviter = auth.uid() and i.badge_at is null),
    'claimed', coalesce((
      select jsonb_agg(c.friends order by c.friends) from invite_reward_claims c where c.user_id = auth.uid()
    ), '[]'::jsonb),
    'latest', (
      select jsonb_build_object('name', coalesce(p.name, 'Trainer'), 'avatar', coalesce(p.avatar, 'red'))
      from friend_invites i
      left join player_cards p on p.user_id = i.invitee and p.realm = 'main'
      where i.inviter = auth.uid() and i.badge_at is not null
      order by i.badge_at desc
      limit 1
    )
  ) end
$$;

-- Hands over every tier the caller has reached and not claimed yet, each once (two tabs can't both get one), with the
-- gifts it holds now. The game puts them in its save.
create or replace function invite_rewards_claim()
returns table (friends int, gifts jsonb)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    raise exception 'invites_signed_out' using errcode = '42501';
  end if;
  if not invite_rewards_open() then
    raise exception 'invites_off' using errcode = 'P0001';
  end if;
  select count(*) into n from friend_invites i where i.inviter = uid and i.badge_at is not null;
  return query
    insert into invite_reward_claims as c (user_id, friends, gifts)
    select distinct on (t.friends) uid, t.friends, t.gifts
    from invite_tiers() t
    where t.friends <= n
    order by t.friends
    on conflict (user_id, friends) do nothing
    returning c.friends, c.gifts;
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function invite_cfg() from public, anon, authenticated;
revoke all on function invite_rewards_open() from public, anon, authenticated;
revoke all on function invite_tiers() from public, anon, authenticated;
revoke all on function saves_invite() from public, anon, authenticated;
revoke all on function saves_invites_gone() from public, anon, authenticated;
revoke all on function invite_record(text, int) from public, anon;
revoke all on function invite_status() from public, anon;
revoke all on function invite_rewards_claim() from public, anon;
grant execute on function invite_record(text, int), invite_status(), invite_rewards_claim() to authenticated;
