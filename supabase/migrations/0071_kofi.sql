-- Ko-fi replaces PayPal for "Support me" (docs/23 §11): the game's button leads to Ko-fi, Ko-fi tells the site about
-- each payment (netlify/functions/kofi-webhook.mts), and a weekly Discord post in #support-me reads the month's totals.
--
-- 1. game_config `donation`: the Ko-fi link replaces the PayPal one, and the weekly post's goal (0 = none) and
--    currency join it, kept equal to the game's defaults. An admin's own Ko-fi link, goal or currency is left alone.
-- 2. kofi_payments: one row per Ko-fi payment (a one-off donation, a membership's month, a shop order or a commission).
--    No e-mail is kept: a membership's months are tied together by a hash of it. Only the webhook (service role)
--    writes it; the admin can read it.
-- 3. kofi_totals: what the weekly post shows, per currency: this month's total and supporters, and what next month
--    already holds (each membership paid within 35 days, as it renews). Totals only, so anyone may ask.
-- 4. configVersion + 1, so players fetch the new link. Safe to run again.

-- ---------------------------------------------------------------- 1. the link

update game_config
set value = (value - 'paypalUrl') || '{"kofiUrl": "https://ko-fi.com/gregoirefontaine"}'::jsonb
where key = 'donation' and jsonb_typeof(value) = 'object' and not value ? 'kofiUrl';
update game_config set value = '{"monthlyGoal": 0, "currency": "EUR"}'::jsonb || value
where key = 'donation' and jsonb_typeof(value) = 'object';

-- ---------------------------------------------------------------- 2. the payments

create table if not exists kofi_payments (
  transaction_id text primary key,
  -- Ko-fi's type: Donation, Subscription, Commission or Shop Order.
  kind text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null,
  paid_at timestamptz not null,
  -- A membership's monthly payment (the first one included).
  subscription boolean not null default false,
  -- sha256 of the supporter's e-mail, lowercased: the same member month after month, never the address.
  supporter text,
  tier text,
  received_at timestamptz not null default now()
);
create index if not exists kofi_payments_paid_at on kofi_payments (paid_at);

alter table kofi_payments enable row level security;
revoke all on kofi_payments from anon, authenticated;
grant select on kofi_payments to authenticated;
drop policy if exists kofi_payments_admin_read on kofi_payments;
create policy kofi_payments_admin_read on kofi_payments for select using (is_admin());

-- ---------------------------------------------------------------- 3. the totals

create or replace function kofi_totals(p_now timestamptz default now())
returns table (currency text, this_month numeric, supporters int, next_month numeric)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select date_trunc('month', p_now at time zone 'utc') at time zone 'utc' as start
  ),
  month_paid as (
    select k.currency, sum(k.amount) as total, count(distinct coalesce(k.supporter, k.transaction_id))::int as n
    from kofi_payments k, bounds b
    where k.paid_at >= b.start and k.paid_at < b.start + interval '1 month' and k.paid_at <= p_now
    group by k.currency
  ),
  -- Each membership's latest month: paid within 35 days, it renews next month (Ko-fi says nothing of a cancelled one,
  -- so a missed renewal drops it after 35 days).
  members as (
    select distinct on (k.supporter) k.currency, k.amount, k.paid_at
    from kofi_payments k
    where k.subscription and k.supporter is not null and k.paid_at <= p_now
    order by k.supporter, k.paid_at desc
  ),
  renewing as (
    select m.currency, sum(m.amount) as total from members m where m.paid_at > p_now - interval '35 days' group by m.currency
  )
  select coalesce(p.currency, r.currency), coalesce(p.total, 0), coalesce(p.n, 0), coalesce(r.total, 0)
  from month_paid p
  full join renewing r on r.currency = p.currency
  order by 2 desc
$$;
grant execute on function kofi_totals(timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------- 4. players fetch the change

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
