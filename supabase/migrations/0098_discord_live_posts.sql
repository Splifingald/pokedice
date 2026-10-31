-- The live events' posts in Discord's #events (docs/50 §2): which ones went out. The Netlify job
-- (netlify/functions/discord-live.mts) runs every minute and takes a post's key here before sending it, so each event's
-- start, and each Monday's calendar, is posted once. Keys: `start:<run id>:<start>` and `week:<Monday, YYYY-MM-DD>`.
-- The job alone reads and writes it, with the service role: no policy, nothing for players.
-- Safe to run again.

create table if not exists discord_live_posts (
  key text primary key,
  posted_at timestamptz not null default now()
);
alter table discord_live_posts enable row level security;
revoke all on discord_live_posts from anon, authenticated;

-- Today's Special Shop start went out from the GitHub workflow (2026-10-31): the job must not post it again.
insert into discord_live_posts (key)
values ('start:58af3405-c865-4961-a8eb-3264a34ddcfe:2026-10-31T11:00:00.000Z')
on conflict (key) do nothing;
