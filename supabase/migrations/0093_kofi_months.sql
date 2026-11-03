-- The weekly Ko-fi post's months ahead (docs/23 §11): what goes past a month's goal covers the next months, so the post
-- needs every month's total, not just this one's.
--
-- 1. game_config `donation`: the goal counts from October 2026 (when Ko-fi's webhook came), with nothing raised before
--    it yet. An admin's own month or amount is left alone.
-- 2. kofi_months: what Ko-fi brought each month (UTC), per currency. Totals only, like kofi_totals, so anyone may ask.
-- Safe to run again.

-- ---------------------------------------------------------------- 1. where the goal starts

update game_config set value = '{"startMonth": "2026-10", "raisedBefore": 0}'::jsonb || value
where key = 'donation' and jsonb_typeof(value) = 'object';

-- ---------------------------------------------------------------- 2. the months

create or replace function kofi_months(p_now timestamptz default now())
returns table (month text, currency text, total numeric)
language sql stable security definer set search_path = public as $$
  select to_char(date_trunc('month', k.paid_at at time zone 'utc'), 'YYYY-MM'), k.currency, sum(k.amount)
  from kofi_payments k
  where k.paid_at <= p_now
  group by 1, 2
  order by 1, 2
$$;
grant execute on function kofi_months(timestamptz) to anon, authenticated;
