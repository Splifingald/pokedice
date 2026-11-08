# 69 · Global messages, links and videos in messages

The ask, 2026-11-08, three parts:

1. "Make sure that I can put links inside the inbox messages, it recognizes the links, makes the text underlined and
   blue and clickable inside the message."
2. "Let's create a global message system to send to all players with conditions on total amount of badges (all regions
   included) displayed on the home page, with custom title, text and potential reward for all."
3. "Let's also add the possibility to include embedded YouTube videos inside the pop-up."

**Status (2026-11-08): built** on `claude/elegant-bell-v3kqyh` (from `version/2_9_6`). The user's calls the same day: **no
switch at all, no rules or INFO, the game's sound cut while a pop-up with a video is open, no patch note** (exceptions to
docs/15 §20 and to the patch-note rule). Migration `0143_broadcasts.sql`.

## 1. Links and videos (every developer's message)

- In the developer's words — an answer, a message they wrote first, a global message, in the pop-up and in My messages
  — every `https://…`, `http://…` or `www.…` address is a **link**: the `link` token's blue (`#1d4ed8`, `#8ab4ff` at
  dusk), underlined, opening in a new tab (`rel="noopener noreferrer nofollow"`). The sentence's punctuation after it
  stays out of the link ("see https://x.com." links `https://x.com`); a bracket the address opened stays in.
- A **YouTube address on a line of its own** becomes the **video**, played in the message: 16:9 at the box's width,
  loaded lazily, never autoplaying, from `youtube-nocookie.com`. Every YouTube form is read (watch?v=, youtu.be/,
  /shorts/, /embed/, /live/, m., music.) with its start time (`t=90`, `t=1m30s`). A YouTube address inside a sentence
  stays a link, so the admin chooses.
- Safety: only http(s) is ever a link (no `javascript:`); the video's frame is rebuilt from the 11-character id alone,
  never from the address as written. The player's own words stay plain.
- Code: `src/lib/richText.ts` (parsing, pure), `src/components/RichText.tsx` (`RichText`, `TextLink`, `YouTubeEmbed`),
  used by `ReplyBox`. One new string: the video frame's accessible name (`ui.message.video`).

## 2. Global messages

| Question | Answer |
|---|---|
| What | A **title**, **words** (links and videos as above) and, if the admin likes, **gifts for everyone** (the gift editor: items, Pokémon, ₽; no Heart Scales, as a guest has no wallet) |
| Who | Every player, or those whose badges — **every region's together**, live and parked (the trainer card's count) — are **at least** N and, if set, **at most** M |
| How it arrives | **A developer's message**, one copy per player, written by the server when their game asks. So everything a message has comes with it: the wrapped gift, the opening, My messages, the Inbox count |
| Where it shows | **On Home only**: its own turn in the one-time pop-ups' queue (`broadcast`, right after the developer's answers), between fights. Elsewhere it waits, and comes on the way back to Home |
| The pop-up | **The message is the pop-up** (the user's call, 2026-11-08): its title is the pop-up's title, its words (links, video) the pop-up's text, **no box, no "From the developer", no line pointing to My messages**; then the gift and OPEN THE GIFT (or OK). Two at once: "A message from the developer!", each one's title above its words. My messages keeps the usual box |
| When it reaches a player | The game asks once the player is known (and their sign-in's sync has settled), again with a new badge, on the way to Home and back to the tab, otherwise **at most every 10 minutes**. A player who reaches the range later gets it then, while it runs |
| Badges counted | A guest: the game's count. A signed-in player: their **trainer card's** badges when the server has it (what Trades reads), else the game's |
| Extreme mode | Not asked from the Extreme save (its badges aren't the player's own count); a gift waits for the main game as every message's does |
| Stop / delete | **Stop**: no one new gets it, every copy stays. **Delete**: the message and every copy go |
| Rules and INFO (§20) | **None** (the user's call, 2026-11-08), as a welcome back (docs/58): it is a developer's message that says everything on its face |
| Sound | While a pop-up holding a video is open (any developer's message, a global one or not), **the game is silent**: effects, cries and music (`hushGame`, src/audio/hush.ts: the shared audio context suspended, no cry played). Closing it brings the sound back. My messages doesn't hush: the player starts a video there on purpose |
| One language | The words are shown as the admin writes them |

### No switch

The user's call (2026-11-08): **no switch** — a message reaches every player in its range as soon as it is sent (Send to
players asks for a confirm naming who first), and the server writes copies for anyone who asks. The file's first
version had one: running this version deletes its game_config row and `broadcasts_open()`.

### The admin

Admin › Messages › Global messages: **Write one** (title, words, at least / at most badges, gifts, **Preview** — the box
as the game draws it, links and video included — and **Send to players**, after a confirm naming who). Each message sent:
RUNNING or STOPPED, who it reaches, its numbers (sent, seen, gifts opened: `broadcast_stats()`), **Stop / Resume**,
**Delete**. The players' copies stay out of the Messages list (one per player); a player's profile shows theirs marked
GLOBAL MESSAGE.

## 3. The database (`supabase/migrations/0143_broadcasts.sql`)

- game_config `broadcasts` (`{"access": "off"}`, inserted if missing); `broadcasts_open()`.
- `broadcasts` (admin-only): title 1–120, body 1–4,000, `min_badges` 0–999, `max_badges` null or min–999, `gifts`
  (0048's check, no Heart Scales), `active`.
- `feedback.broadcast_id` (on delete cascade): a player's copy. One per account (a unique index), one per guest device
  (the claim's lock). Only the claim or the admin writes one (`feedback_broadcast_stamp` clears it on a player's insert).
- `broadcast_claim(p_device_id, p_badges) returns int`: moves a guest's copies on this device
  into their account the first time they ask signed in (one the account has already wins); counts the badges (the card,
  else the game's word, held to 0–999); writes the caller's copy of every active message in range they don't have, and
  returns how many.
- `my_feedback()` adds `broadcast` (the copy of a global message).
- `broadcast_stats()`: the admin's numbers.
- No switch: deletes game_config `broadcasts` and drops `broadcasts_open()` where the first version ran. Safe to run
  again. `supabase/seed.sql` doesn't inline it.

## 4. Setting it up

1. Run the migration in Supabase's SQL editor (after 0048 and 0103; safe to run again; `supabase/seed.sql` doesn't carry
   it):
   <https://github.com/Splifingald/pokedice/blob/claude/elegant-bell-v3kqyh/supabase/migrations/0143_broadcasts.sql>
2. Admin › Messages: the **Gifts** switch on, if the message carries a gift.
3. Admin › Messages › Global messages › **Write one**: it goes to every player in range as soon as you send it (no
   switch), so check it with **Preview** first.

## 5. Tests

- `tests/rich-text.test.ts`: links (www., punctuation, brackets, line breaks, only http(s)), every YouTube form and start
  time, other sites and odd ids refused, the no-cookie frame, a video only alone on its line.
- `tests/broadcasts-sql.test.ts` (PGlite, 0019/0025/0028/0048/0103/0143): no switch (everyone, the first version's row and function gone), the device id,
  each message in range once, a new badge bringing more, odd counts held, the engine and SQL agreeing on the ranges,
  stop and delete, the form's limits (range, words, no Heart Scales), the trainer card counted for an account, a guest's
  copies following them into their account with no second one, the gift opened once, a player's forged copy stripped,
  nobody but the admin reading the messages or their numbers.
- `tests/engine/popups.test.ts`: the queue's order; the global message on Home only, after the answers.
- `tests/daybreak.test.ts`: the `link` blue at 4.5:1 on every surface, both themes and both scopes.
- `e2e/broadcasts.spec.ts`: the pop-up on Home (asked with the badges, the link blue, underlined, in a new tab, the video
  from the no-cookie host, the gift opened into the save, My messages keeping it); it waits off Home and comes on the
  way back.
- `tests/hush.test.ts`: the shared context suspended and no sound or cry while held, holds stacking, back on release.
- `/kitchen-sink`: "Links and videos in the developer's words, and global messages" (`BroadcastBits`).
