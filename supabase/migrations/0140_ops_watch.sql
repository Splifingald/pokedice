-- The server watch's memory (docs/66 §4): netlify/functions/ops-watch.mts runs every 5 minutes and keeps here what it
-- needs from one run to the next (the CPU counters of its last scrape, which levels it already told on Discord and
-- when, the day's peaks, its last upgrade). One row. The job alone reads and writes it, with the service role: no
-- policy, nothing for players. Safe to run again.

create table if not exists ops_watch_state (
  id text primary key default 'main',
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table ops_watch_state enable row level security;
revoke all on ops_watch_state from anon, authenticated;
