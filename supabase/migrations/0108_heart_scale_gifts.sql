-- Heart Scales as a message gift (docs/15 §23, docs/60): Admin → Messages (an answer) and a player's profile (a message
-- the admin starts) can give Heart Scales, the Friend Market's currency. They live on the server, per account
-- (friendship_wallets, 0107), not in the save, so the server pays them itself: the moment the player's game claims the
-- message's gifts (feedback_claim_gifts), in the same statement that marks them opened, so they're paid once.
--
-- 1. feedback_gifts_ok(): a gift may also be { kind: 'heartScales', amount: 1–9,999, region } (the region is kept for
--    the shape: 'latest').
-- 2. A message carrying Heart Scales goes to an account (user_id), never a guest's device: a guest has no wallet.
-- 3. feedback_claim_gifts(): the Heart Scales of the messages it hands over go into their player's wallet. Only the
--    balance moves: not what was earned today (the streaks' daily cap) nor the total earned.
--
-- Run after 0048 and 0107; safe to run again.

-- ---------------------------------------------------------------- 1. the check

create or replace function feedback_gifts_ok(p jsonb)
returns boolean
language sql immutable as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) between 1 and 20
    and pg_column_size(p) < 4000
    and not exists (
      select 1 from jsonb_array_elements(p) g
      where not case
        when jsonb_typeof(g) <> 'object' then false
        when coalesce(g ->> 'region', '') !~ '^[A-Za-z0-9_-]{1,40}$' then false
        when g ->> 'kind' = 'item' then
          coalesce(g ->> 'key', '') ~ '^[A-Za-z0-9_.-]{1,80}$' and feedback_gift_int(g -> 'qty', 1, 999)
        when g ->> 'kind' = 'pokemon' then
          feedback_gift_int(g -> 'dex', 1, 999999)
          and feedback_gift_int(g -> 'level', 1, 100)
          and coalesce(jsonb_typeof(g -> 'shiny'), 'boolean') = 'boolean'
        when g ->> 'kind' = 'gold' then feedback_gift_int(g -> 'amount', 1, 999999)
        when g ->> 'kind' = 'heartScales' then feedback_gift_int(g -> 'amount', 1, 9999)
        else false
      end
    )
  )
$$;

-- ---------------------------------------------------------------- 2. to an account only

create or replace function feedback_gifts_scales(p jsonb)
returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array'
     and exists (select 1 from jsonb_array_elements(p) g where g ->> 'kind' = 'heartScales')
$$;

alter table feedback drop constraint if exists feedback_scales_need_account;
alter table feedback add constraint feedback_scales_need_account
  check (user_id is not null or not coalesce(feedback_gifts_scales(gifts), false));

-- ---------------------------------------------------------------- 3. the claim pays them

-- As 0048's, and the Heart Scales of what it hands over go into the wallets. Data-modifying WITH parts always run to
-- the end, read or not; the claimed rows carry their player (an account, by the check above).
create or replace function feedback_claim_gifts(p_ids bigint[], p_device_id text)
returns table (id bigint, gifts jsonb)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not gifts_open() then
    raise exception 'gifts_off' using errcode = 'P0001';
  end if;
  return query
    with claimed as (
      update feedback f
      set gifts_claimed_at = now()
      where f.id = any(p_ids)
        and f.gifts is not null
        and f.gifts_claimed_at is null
        and (
          (auth.uid() is not null and f.user_id = auth.uid())
          or (f.user_id is null and f.device_id = p_device_id)
        )
      returning f.id, f.gifts, f.user_id
    ), paid as (
      insert into friendship_wallets as w (user_id, balance)
      select c.user_id, sum((g ->> 'amount')::int)
      from claimed c cross join lateral jsonb_array_elements(c.gifts) g
      where c.user_id is not null and g ->> 'kind' = 'heartScales'
      group by c.user_id
      on conflict (user_id) do update set balance = w.balance + excluded.balance
    )
    select c.id, c.gifts from claimed c;
end
$$;

revoke all on function feedback_claim_gifts(bigint[], text) from public;
grant execute on function feedback_claim_gifts(bigint[], text) to anon, authenticated;
