-- Answers to player messages. The admin writes a reply on a message (Admin → Messages); that marks it read. The
-- player sees every message they sent and the answers (side menu → Contact the developer → My messages), and an
-- answer they have not seen yet pops up the next time they open the game.
--
-- Players don't read the table: my_feedback() returns their own rows — the signed-in account's, plus the ones sent
-- without an account from this browser (its analytics device id) — and feedback_reply_seen() is the only write they
-- get. Safe to run again.

alter table feedback add column if not exists reply text;                              -- the admin's answer
alter table feedback add column if not exists replied_at timestamptz;                  -- when it was (last) written
alter table feedback add column if not exists reply_seen boolean not null default false; -- the player has seen it

alter table feedback drop constraint if exists feedback_reply_len;
alter table feedback add constraint feedback_reply_len check (reply is null or length(reply) <= 4000);

-- A new message has no answer, whatever the browser sent. Writing (or changing) an answer stamps it, marks the message
-- read and shows it to the player again; clearing it removes the stamp.
create or replace function feedback_reply_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.reply := null;
    new.replied_at := null;
    new.reply_seen := false;
  elsif new.reply is distinct from old.reply then
    new.reply := nullif(trim(new.reply), '');
    new.replied_at := case when new.reply is null then null else now() end;
    new.reply_seen := false;
    if new.reply is not null then
      new.read := true;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists feedback_reply_stamp on feedback;
create trigger feedback_reply_stamp before insert or update on feedback
  for each row execute function feedback_reply_stamp();

-- The caller's messages, newest first.
create or replace function my_feedback(p_device_id text)
returns table (
  id bigint,
  created_at timestamptz,
  title text,
  message text,
  reply text,
  replied_at timestamptz,
  reply_seen boolean
)
language sql stable security definer set search_path = public as $$
  select f.id, f.created_at, f.title, f.message, f.reply, f.replied_at, f.reply_seen
  from feedback f
  where (auth.uid() is not null and f.user_id = auth.uid())
     or (f.user_id is null and f.device_id = p_device_id)
  order by f.created_at desc
  limit 200
$$;

-- The player has seen these answers: they won't pop up again.
create or replace function feedback_reply_seen(p_ids bigint[], p_device_id text)
returns void
language sql volatile security definer set search_path = public as $$
  update feedback f
  set reply_seen = true
  where f.id = any(p_ids)
    and f.reply is not null
    and not f.reply_seen
    and (
      (auth.uid() is not null and f.user_id = auth.uid())
      or (f.user_id is null and f.device_id = p_device_id)
    )
$$;

revoke all on function my_feedback(text) from public;
revoke all on function feedback_reply_seen(bigint[], text) from public;
grant execute on function my_feedback(text) to anon, authenticated;
grant execute on function feedback_reply_seen(bigint[], text) to anon, authenticated;
