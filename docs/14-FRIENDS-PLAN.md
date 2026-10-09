# Pokédice — Friends Plan

> **Status: plan, nothing built yet.** Once it is built, where this document and the code disagree, the code is right.

A friend list in the trainer menu (the side drawer). Players add each other with a **friend ID** or an **invite link**,
are told when someone becomes their friend, can open a friend's profile, and see their friends highlighted on every
leaderboard.

---

## The brief, and how each part is met

| Brief | How |
| --- | --- |
| The friend list is in the side menu | A **Friends** row in the trainer menu (`PlayerMenu`), under Profile. It opens the list *inside the drawer*, as a sub-view with a back arrow, so the list stays in the side menu. Mockups A, B |
| Players share a friend invite link | `https://<site>/f/K7QM4XD9`: the native share sheet on phones, copied to the clipboard on desktop (the `ShareTutorial` pattern). Opening the link shows who sent it and adds them in one tap, with a Google sign-in first if needed. §2.3, mockup D |
| Players share their friend ID and add by friend ID | Every signed-in player has one 8-character ID, `K7QM-4XD9`, shown at the top of the list with COPY. ADD BY FRIEND ID takes one. The link carries the same code. §2.1, mockups B, C |
| A notification when they become friends with someone | A toast right away if their game is open (Realtime), otherwise the next time it opens. Until they look: a dot on the avatar button and on the Friends row, and a NEW tag on the friend in the list. §2.4, mockup H |
| The friend's profile with their info | Tapping a friend opens their trainer card: look, name, last played, where they are, their team, a badge case per region with Pokédex / top level / shinies, and their Versus team. Mockup E |
| Friends highlighted in social features (for now, every leaderboard) | The four region boards, their Hall of Fame, and the two Versus boards with the opponents list. A friend's row gets its own tint, a friends icon and "Friend" for screen readers. A **Friends** filter shows only you and your friends, still with your global ranks. Mockups F, G |

---

## 0. What was found before planning

| Finding | Consequence |
| --- | --- |
| The cloud knows a player by their Google account (`auth.users`, `saves.user_id`). A guest is only a random `deviceId` in localStorage, gone when the browser is cleared. The leaderboard and Versus are already Google-only. | **Friends need Google sign-in.** A guest still sees the Friends row; it opens a "Connect with Google" prompt, using the leaderboard's rule and wording. A pending invite waits through the sign-in. |
| `leaderboard()` returns `is_me` but no user id, on purpose. `versus_board()` does return `user_id`. | The database marks friend rows on the region boards (`is_friend`); the browser never sees those ids. Versus compares ids in the browser, because it already has them. |
| The board comes from `leaderboard_cache`, rebuilt by pg_cron every 5 minutes (0031), since the database stalled on 2026-10-07 from reading every save on every visit. | Nothing in this feature may read `saves.data` when a list, board or profile opens. A friend's profile comes from a small **player card** row, kept up to date when their save is written (§4.3). |
| 0032 changed `leaderboard()`'s return type, so it had to drop and re-create it. `0016_regions.sql` carries the same pieces so that `seed.sql`, which inlines it, keeps them. | Adding `is_friend` repeats that: drop and re-create in the new migration **and** in `0016_regions.sql`. |
| `SidePanel` sits under `Modal`'s z-index on purpose, so that "a dialog opened from inside it lands on top". | The friend profile and the add-friend dialog are ordinary `Modal`s opened from the drawer. No new overlay layer. |
| Every visible tab joins the private Realtime channel `app` (0029). supabase-js multiplexes channels over one websocket. | A per-player topic `friends:<uid>` adds no connection: still one per tab against the plan's 200. |
| `ReplyPopup` already shows "between fights, after Prof. Oak's tutorials, never in a fight". `ShareTutorial` already shares through the share sheet or the clipboard. | The invite pop-up reuses that gating. The share code moves into a helper that both use. |
| Netlify already rewrites `/*` to `index.html`. | `/f/:code` needs no hosting change. |
| `PlayerProfileModal` draws the badge case with `regionCases(save, data)`, which only reads each region's `areaProgress` (live and parked). | Split it into `regionCasesFrom(progressByRegion, data)`, so that a friend's card renders with the same `RegionRow`. |
| `players` (0028) has a name and last day for everyone who pings, but no look, and snapshots for guests only. | Not enough for a profile. The card table covers it. |

---

## 1. Decisions

### 1.1 One friend ID, also used in the link

- 8 characters of Crockford base32 (`0–9 A–Z` without `I L O U`), shown as `K7QM-4XD9`. 32⁸ ≈ 1.1 × 10¹² codes, so
  nobody finds a code by guessing, given the rate limit in §4.5.
- Typing is forgiving: any case, spaces and dashes ignored, `O` read as `0`, `I` and `L` read as `1`.
- The database creates the code the first time the player opens Friends (`friend_code()`). The browser never makes one.
- **Reset my friend ID** (in the list's `⋯` menu) issues a new code. Old links and the old ID stop working; existing
  friends stay. That is the fix for "I posted my link on Discord and too many people added me".
- The user id is never shown and never typed.

### 1.2 Adding is instant, with no request to accept *(to confirm)*

Having someone's ID or link means they gave it to you. Using it makes you both friends at once, and the other player
is told (§2.4). That matches "notified when they become friends", and it avoids a pending-requests inbox.

What protects players: either side can remove a friend without the other being told, a reset ID stops new adds, and
what a friend sees is only what the leaderboard already shows everyone, plus the badge case and the Versus team
(mockup E). Nothing private: no e-mail, no Google photo, no gold or inventory.

If you would rather have consent first, the alternative is friend requests: a pending row, then Accept / Decline. That
adds a state, a list section and a second notification kind (§10).

### 1.3 Mutual, capped

One row per pair: if A is B's friend, B is A's friend. At most **100 friends** each, through a new `game_config` key
`maxFriends` (Admin → Config, default 100). An add that would take either side over the cap fails with a clear message.

### 1.4 Notifications stay in the game

A toast, a dot and a NEW tag. No e-mail and no web push: the game has no service worker, and a permission prompt for
this is not worth it (§10).

---

## 2. Flows

### 2.1 Add by friend ID

1. Trainer menu → Friends → **ADD BY FRIEND ID**.
2. Type or paste `K7QM-4XD9`. The field formats the code as it is typed. At 8 valid characters it calls
   `friend_lookup(code)` (debounced) and shows who it is, so the player can check they have the right trainer
   before adding.
3. **ADD** → `friend_add(code)`:

| Result | What the player sees |
| --- | --- |
| `added` | The dialog closes, toast "You and MISTY are now friends!", Misty at the top of the list with NEW. Misty is told (§2.4). |
| `already` | "MISTY is already your friend." |
| `self` | "That's your own friend ID." |
| `not_found` | "No trainer has this friend ID." (a reset code too) |
| `full` | "Your friend list is full (100)." or "MISTY's friend list is full." |
| `rate_limited` | "Too many tries. Wait a few minutes." |

### 2.2 Share the link or the ID

- **SHARE INVITE LINK** → `navigator.share({ title: 'Pokédice', text: 'Add me on Pokédice! Friend ID K7QM-4XD9', url })`
  with `url = location.origin + '/f/K7QM4XD9'`, so a preview deploy shares preview links. No share sheet (desktop) → the
  link is copied, toast "Invite link copied".
- **COPY** next to the ID → copies `K7QM-4XD9`, toast "Friend ID copied".
- The player's own profile (`PlayerProfileModal`) also shows the ID with COPY, so it can be found outside Friends too.

### 2.3 Opening an invite link

`/f/:code` is a route outside `GameLayout`, because it must work for someone with no save. It:

1. normalises the code and stores `{ code, at }` under localStorage `pokedice.friendInvite`, kept 7 days, so it
   survives the Google OAuth redirect and a new game;
2. replaces the URL with `/map` if there is a save, or `/` if there isn't.

`FriendInvitePopup` then picks the invite up. It is mounted in `GameLayout` next to `ReplyPopup`, with the same gating:
the run is idle and no Prof. Oak tutorial is due. It names the sender from `friend_lookup(code)`, which even a signed-out
player can call; it returns a name, look, current region and top level only.

| The player | What happens |
| --- | --- |
| Has no save (new to the game) | The title screen shows a ribbon, "MISTY invited you to Pokédice!", under the logo. The pop-up waits until they are in a game (after the new-game intro: check it doesn't stack on Prof. Oak's first lines). |
| Has a save, signed out | "MISTY wants to be your friend. Connect with Google to accept." **NOT NOW** / **CONNECT WITH GOOGLE**. After the sign-in the page comes back, and the pop-up shows the signed-in version. |
| Signed in | "MISTY invited you to be friends." **NOT NOW** / **ADD FRIEND** → `friend_add`, then the same results as §2.1. |
| Own code, unknown code, or already friends | A toast with the reason; the invite is dropped. |

NOT NOW drops the invite; opening the link again brings it back. On a deployment without Supabase, `/f/…` just goes on
to `/`.

### 2.4 Being told

When B adds A:

- **A is playing** (the tab is visible and on the Realtime socket): `friend_add` broadcasts `{ name, avatar }` on
  A's private topic `friends:<A>`. A gets a good-tone toast, "MISTY is now your friend!" (held until a fight in
  progress ends), and the list refetches.
- **A is away**: the pair is stored as unseen by A. The next time A's game loads, once sign-in has settled (when
  `ReplyPopup` loads its inbox), `friend_list()` reports it: one toast, "MISTY is now your friend!" or "3 new friends!".
- Either way, until A opens Friends: a red dot on the avatar button in the top bar, a dot with the count on the
  Friends row, and NEW on each new friend. Opening the list calls `friend_seen()`. The dots go at once; the NEW tags
  stay until the drawer closes, so A can still see who is new.
- B, who did the adding, gets only the success toast.

### 2.5 Removing

Friend profile → **REMOVE FRIEND** → "Remove MISTY from your friends? They won't be told." → `friend_remove(id)`. The
pair is deleted for both sides. Adding again needs the ID or the link again.

---

## 3. Mockups

Phone width (360 px) unless noted. The drawer is `SidePanel`'s 20 rem. Legend:

```
▓…▓  gold / selected (primary button, open tab, your own row)
░    friend tint (pale blue, with a blue stripe on the left edge)
◆    the new `friends` pixel icon (two heads)
●    notification dot (red)
▣    an existing pixel icon          ◘  a Pokémon menu icon (MiniSprite)
▞▚   a trainer sprite (their look)   ★  shiny        ♛  crown
```

### A. Trainer menu, the drawer's first view

```
  top bar                      ┌──────────────────────────────────┐
  ┌─────────────────────┐      │ ASH                            ✕ │
  │ … ▣trophy  (A)●     │      ├──────────────────────────────────┤
  └─────────────────────┘      │ ┌──────────────────────────────┐ │
     ● = unseen friends        │ │ ▣  Profile                   │ │
                               │ └──────────────────────────────┘ │
                               │ ┌──────────────────────────────┐ │
                    new row ─▶ │ │ ◆  Friends            ●2  12 │ │
                               │ └──────────────────────────────┘ │
                               │ ┌──────────────────────────────┐ │
                               │ │ ▣  Versus                    │ │
                               │ └──────────────────────────────┘ │
                               │ ┌──────────────────────────────┐ │
                               │ │ ▣  Settings                  │ │
                               │ └──────────────────────────────┘ │
                               │   … How to play, Types, Admin,   │
                               │     SYNC ONLINE, Connect …       │
                               ├──────────────────────────────────┤
                               │ ▣  Join the Discord              │
                               │ ▣  Contact the developer         │
                               └──────────────────────────────────┘
```

`●2` = two friends not seen yet, `12` = friends in all. The row is hidden on a deployment without Supabase, like
Contact the developer.

### B. Friends, inside the drawer

```
┌──────────────────────────────────┐
│ ←  FRIENDS                     ✕ │   ← back to the menu; ✕ closes the drawer
├──────────────────────────────────┤
│ ┌─ YOUR FRIEND ID ─────────────┐ │
│ │      K7QM-4XD9    [ COPY ]   │ │
│ │ [    SHARE INVITE LINK     ] │ │
│ └──────────────────────────────┘ │
│ [ +  ADD BY FRIEND ID          ] │
│                                  │
│ 12 FRIENDS                    ⋯  │   ← ⋯ : Reset my friend ID
│ ┌──────────────────────────────┐ │
│ │ ▞▚  MISTY             ▓NEW▓  │ │
│ │ ▚▞  Johto · Lv.54 · now      │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ ▞▚  BROCK                    │ │
│ │ ▚▞  Kanto · Lv.38 · 2 h ago  │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ ▞▚  GARY                     │ │   ← muted: away more than 72 h
│ │ ▚▞  Hoenn · Lv.70 · 9 days   │ │     (and so off the boards)
│ └──────────────────────────────┘ │
│               …                  │
└──────────────────────────────────┘
```

New friends first, then by last played, newest first. Each row is a button that opens the profile (E). No friends yet:
"No friends yet. Share your invite link, or add a friend ID." under the ADD button.

**B′, signed out:**

```
┌──────────────────────────────────┐
│ ←  FRIENDS                     ✕ │
├──────────────────────────────────┤
│                                  │
│   Friends are kept with your     │
│   Google account.                │
│                                  │
│  [ G  CONNECT WITH GOOGLE     ]  │
│                                  │
└──────────────────────────────────┘
```

### C. Add by friend ID (a Modal over the drawer)

```
┌────────────────────────────────────┐
│ ADD A FRIEND                     ✕ │
├────────────────────────────────────┤
│ Friend ID                          │
│ ┌────────────────────────────────┐ │
│ │ K7QM-4XD9                      │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ▞▚  MISTY                      │ │   ← friend_lookup preview
│ │ ▚▞  Johto · Lv.54              │ │
│ └────────────────────────────────┘ │
│                                    │
│           [ CANCEL ]  [▓  ADD  ▓]  │
└────────────────────────────────────┘

  unknown code:  │ No trainer has this friend ID. │   (in red, under the field; ADD stays off)
```

### D. Invite pop-up, after opening a link

```
┌────────────────────────────────────┐
│ FRIEND INVITE                    ✕ │
├────────────────────────────────────┤
│                                    │
│        ▞▀▀▀▚                       │
│        ▌   ▐    MISTY              │
│        ▚▄▄▄▞    Johto · Lv.54      │
│                                    │
│   MISTY invited you to be          │
│   friends on Pokédice.             │
│                                    │
│   [ NOT NOW ]   [▓ ADD FRIEND ▓]   │
└────────────────────────────────────┘

  signed out:   "Connect with Google to accept."   [ NOT NOW ]  [▓ G CONNECT WITH GOOGLE ▓]

  title screen, no save yet:
  ┌────────────────────────────────────┐
  │             POKÉDICE               │
  │ ┌────────────────────────────────┐ │
  │ │ ▞▚ MISTY invited you to        │ │   ← ribbon under the logo
  │ │ ▚▞ Pokédice!                   │ │
  │ └────────────────────────────────┘ │
  │         [▓  NEW GAME  ▓]           │
  └────────────────────────────────────┘
```

### E. Friend profile (a Modal over the drawer, or over the leaderboard)

```
┌──────────────────────────────────────────┐
│ MISTY                                  ✕ │
├──────────────────────────────────────────┤
│ ▞▀▀▀▚  MISTY                             │
│ ▌   ▐  Friends since 3 Oct 2026          │
│ ▚▄▄▄▞  Played 2 h ago                    │
│                                          │
│ NOW IN   Johto · Ecruteak City           │
│                                          │
│ TEAM                                     │
│  ◘54   ◘52   ◘51★  ◘50   ◘49   ◘47       │
│                                          │
│ BADGE CASE                               │
│ ┌──────────────────────────────────────┐ │
│ │ Kanto  ♛                   8 badges  │ │
│ │ ■ ■ ■ ■ ■ ■ ■ ■                      │ │
│ │ Dex 151/151 · Lv.100 · 4★            │ │   ← new stat line
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ Johto                      5/8       │ │
│ │ ■ ■ ■ ■ ■ □ □ □                      │ │
│ │ Dex 143/251 · Lv.54 · 1★             │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ VERSUS TEAM         12 wins · 7 held     │
│  ◘50   ◘50   ◘50                         │
│                                          │
│ [ REMOVE FRIEND ]                        │
└──────────────────────────────────────────┘
```

The badge case is `PlayerProfileModal`'s `RegionRow`, moved to its own file and reused as it is, plus one stat line
per region. VERSUS TEAM shows only when they have set a team. REMOVE FRIEND is a plain button, last, and asks first.

### F. Leaderboard with friends (desktop width)

```
┌──────────────────────────────────────────────────────────────┐
│ ▣ LEADERBOARD                                                │
│ [▓ ▣ Max level ▓] [▣] [▣] [▣]                                │
│ [▓ ALL ▓|  ◆ FRIENDS 3 ]                ← new filter         │
│ [ ♛ HALL OF FAME   3 trainers ]                              │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ▓1▓  ▞▚ BLUE                 ◘ ◘ ◘ ◘ ◘ ◘                 │ │
│ │      ▚▞ Lv.65                                            │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │█░2░░ ▞▚ MISTY ◆ ░░░░░░░░░░░░ ◘ ◘ ◘ ◘ ◘ ◘ ░░░░░░░░░░░░░░░░│ │ ← friend: blue tint,
│ │█░░░░ ▚▞ Lv.54 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ │   left stripe, ◆ icon;
│ └──────────────────────────────────────────────────────────┘ │   tap → profile (E)
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ▓3▓  ▞▚ ERIKA                ◘ ◘ ◘ ◘ ◘ ◘                 │ │
│ │      ▚▞ Lv.53                                            │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │▓ 4   ▞▚ ASH (you)            ◘ ◘ ◘ ◘ ◘ ◘                ▓│ │ ← you: gold, unchanged
│ │▓     ▚▞ Lv.52                                           ▓│ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

  FRIENDS selected — only you and your friends, still with the global ranks:

  │ ░2  MISTY ◆   Lv.54 │      │ ▓4  ASH (you)  Lv.52 │      │ ░17  BROCK ◆   Lv.38 │
```

The friend treatment, so it never relies on colour alone:

- a pale blue fill (`friend` token, e.g. `#dcebf7`) where you are pale gold (`#fbeeb0`) and everyone else `bg-panel`;
- a 6 px stripe on the left edge in the avatar blue (`#547acc`), as an inset shadow inside the 3 px ink border;
- the `friends` icon after the name, with `<span class="sr-only">Friend</span>`;
- the score line in ink, not muted (as for your own row);
- the row is a button that opens the friend's profile (E). Other players' rows stay as they are.

The filter: an ALL / FRIENDS switch, shown only when you have friends. FRIENDS keeps the ranks of the full board, so it
answers "where are my friends on the real board", and keeps snapping to your row. Empty: "None of your friends is on
this board yet." The choice is remembered in localStorage (`pokedice.board.friendsOnly`, read in a try/catch).

### G. Hall of Fame and Versus

```
  Hall of Fame grid                         Versus — opponents list
┌──────────┐┌──────────┐┌──────────┐      ┌──────────────────────────────────┐
│   ▞▚     ││░░░ ▞▚ ░░░││▓   ▞▚   ▓│      │█░ ▞▚ MISTY ◆  ◘50 ◘50 ◘50 [FIGHT]│ ← friends' unbeaten
│  RED     ││░ MISTY ◆░││▓ ASH you▓│      ├──────────────────────────────────┤   teams come first
│ ♛ Lv.100 ││░♛ Lv.100░││▓♛ Lv.100▓│      │   ▞▚ ERIKA    ◘50 ◘50 ◘50 [FIGHT]│
│ ◘◘◘◘◘◘   ││░◘◘◘◘◘◘░░░││▓◘◘◘◘◘◘  ▓│      └──────────────────────────────────┘
└──────────┘└──────────┘└──────────┘
```

The attack and defense boards in Versus get the same tint and icon. In the opponents list, friends' teams not yet
beaten come first, then the rest in today's order.

### H. Notifications

```
  phone top bar, with a new friend:
  ┌──────────────────────────────────────┐
  │ POKÉDICE   ▣ 12   ₽ 3,400   ▣  (A)●  │   ← red dot on the avatar button
  └──────────────────────────────────────┘
          ┌──────────────────────────────┐
          │ MISTY is now your friend!    │      ← toast, good tone (green); on phones
          └──────────────────────────────┘        just under the top bar, as today

  several while away:  │ 3 new friends! │
```

The avatar button's label becomes "Trainer menu, 2 new friends" while the dot shows.

---

## 4. Database: `supabase/migrations/0033_friends.sql`

Safe to run again, like the others. Every table has row level security on and `revoke all … from anon, authenticated`.
Only the `security definer` functions below touch them (the `leaderboard_cache` pattern), plus an `is_admin()` policy
for the admin.

### 4.1 Tables

```sql
-- Each signed-in player's friend ID: 8 characters of Crockford base32.
create table if not exists friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  created_at timestamptz not null default now()
);

-- One row per pair of friends, the smaller id first.
create table if not exists friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null,
  created_at timestamptz not null default now(),
  a_seen boolean not null default false,   -- user_a has seen that they are friends (the adder's is set at once)
  b_seen boolean not null default false,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on friendships (user_b);

-- What another player may see of you: kept up to date by a trigger on saves (§4.3).
create table if not exists player_cards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar text not null,
  region text not null,
  area_id text,
  team jsonb not null,      -- [{dex, level, shiny}], the live team
  regions jsonb not null,   -- {region: {pokedex, maxLevel, shinies, progress: {areaId: {cleared, gyms: [trainerId]}}}}
  updated_at timestamptz not null,
  constraint player_cards_small check (pg_column_size(regions) < 32000)
);

-- Lookups and adds, for the rate limit (§4.5). Pruned to the last hour as it goes.
create table if not exists friend_attempts (
  actor text not null,      -- user id, or 'device:<id>' for a signed-out lookup
  at timestamptz not null default now()
);
create index if not exists friend_attempts_actor on friend_attempts (actor, at desc);
```

### 4.2 Friend IDs

`friend_code()` returns the caller's code, creating it with `extensions.gen_random_bytes` (pgcrypto, on in Supabase)
and trying again on a unique violation. `friend_code_reset()` replaces it, at most once an hour.

### 4.3 Player cards

- `player_card_of(p_user uuid, p_data jsonb, p_at timestamptz)` builds a card from a save. It uses the same JSON paths
  as `leaderboard_rows` (the live region plus every `parked` one), but with **no badge filter**, so a region shows on
  the profile before its first badge, and with the gym **ids** rather than a count, so the badge case can be drawn.
- Trigger `saves_card`, `after insert or update of data on saves`, upserts the card. It costs one pass over a save
  already in memory, once per cloud push. Pushes are at most every `cloudSyncMinutes`, and no-op pushes are already
  skipped. The work moves from every read to every write.
- The migration ends with a backfill: `insert into player_cards select (player_card_of(user_id, data, updated_at)).*
  from saves on conflict … do update`. That is one pass over `saves`, once.
- For later, not in scope: `leaderboard_rebuild()` could read cards instead of saves.

### 4.4 Functions

All are `security definer set search_path = public` and need `auth.uid()`, except `friend_lookup`. They are granted to
`authenticated`, and `friend_lookup` to `anon` as well.

| Function | What it does |
| --- | --- |
| `friend_code() → text` | The caller's ID, created on the first call. |
| `friend_code_reset() → text` | A new ID; old links stop working. Once an hour. |
| `friend_lookup(p_code text, p_device_id text) → (name, avatar, region, max_level)` | What an invite and the ADD dialog preview. Open to signed-out players, because a link can be opened before signing in. Rate limited (§4.5). |
| `friend_add(p_code text) → (status, user_id, name, avatar)` | The statuses of §2.1. Inserts the pair (`least` / `greatest`), marks it seen for the caller, broadcasts to the other side (§4.6). |
| `friend_remove(p_friend uuid) → void` | Deletes the pair, from either side. |
| `friend_list() → setof (user_id, name, avatar, region, area_id, max_level, team, since, updated_at, is_new)` | One row per friend: friendships joined to `player_cards`. No save is read. A friend without a card yet comes back as "Trainer" with no game. |
| `friend_profile(p_friend uuid) → (card…, versus_team, attack_wins, defense_wins)` | The friend's whole card and their Versus team (`versus_teams`), only if they are the caller's friend; otherwise nothing. |
| `friend_seen() → void` | Marks the caller's unseen friendships as seen. |

### 4.5 Limits and abuse

- **Rate limit:** at most 20 `friend_lookup` + `friend_add` calls per 10 minutes per player (per device id for a
  signed-out lookup, a soft key, as for feedback). With 10¹² codes, guessing gets nowhere anyway; this is mostly
  against a stuck button.
- **Cap:** `maxFriends` (`game_config`, default 100) is checked for both players inside `friend_add`, under a
  `pg_advisory_xact_lock` on each of the two user ids, so two adds at once can't both get past the cap.
- **Leaderboard bans** (`leaderboard_bans`): a banned player stays a friend and keeps their profile. They are only off
  the boards, as today.
- **Deleted accounts:** every table cascades from `auth.users`.

### 4.6 Realtime topic

```sql
drop policy if exists friends_channel_listen on realtime.messages;
create policy friends_channel_listen on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'friends:' || (select auth.uid())::text and extension = 'broadcast');
```

No insert policy, so browsers can't broadcast on it. `friend_add` calls
`realtime.send(jsonb_build_object('name', …, 'avatar', …), 'friend_added', 'friends:' || other_id, true)` inside a
`begin … exception when others then raise warning` block, as `force_reload()` does. A Realtime hiccup never fails an
add.

### 4.7 The leaderboard flag

`leaderboard()` gains `is_friend boolean`. It works out the caller's friends once (100 rows at most) and joins them by
hash against the board, rather than probing `friendships` for each of up to 3,000 rows:

```sql
with mine as (
  select case when f.user_a = auth.uid() then f.user_b else f.user_a end as id
  from friendships f
  where f.user_a = auth.uid() or f.user_b = auth.uid()
)
select …, (m.id is not null) as is_friend
from ( …the board as in 0032… ) r
left join mine m on m.id = r.user_id
```

The return type changes, so: drop and create, as 0032 did, and the same edit in `0016_regions.sql` so that re-running
`supabase/seed.sql` keeps it. `parseLeaderboard` reads a missing `is_friend` as false (a database that hasn't run 0033).

Versus needs no SQL change: `versus_board()` already returns `user_id`.

### 4.8 Deploying

- A README "Rule additions" entry: "Needs `supabase/migrations/0033_friends.sql` run once on the live database
  (re-running `supabase/seed.sql` brings the leaderboard part)."
- `pnpm seed-sql` regenerates `seed.sql` and its parts.
- `maxFriends` goes in the engine defaults (`src/engine/defaults.ts`, `types.ts`) and the Admin → Config section.

---

## 5. Client

### 5.1 New files

| File | What |
| --- | --- |
| `src/lib/friends.ts` | The Supabase calls (`fetchFriends`, `addFriend`, `removeFriend`, `lookupCode`, `myCode`, `resetCode`, `markSeen`, `fetchFriendProfile`). Parsing in the `parseLeaderboard` style: a default for every field, the look through `avatarOf`. `normalizeCode` / `formatCode`, `inviteUrl(code)`. A small zustand store, `useFriends` (`code`, `friends`, `ids: Set<string>`, `unseen`, `load()`), loaded like `useInbox`: when sign-in settles, and when the drawer opens (at most once a minute). |
| `src/lib/share.ts` | `shareOrCopy({ title, text, url }, copiedText)`, taken out of `ShareTutorial`, which then uses it. |
| `src/components/friends/FriendsView.tsx` | The drawer sub-view (B, B′): the ID box, ADD, the list, the `⋯` menu. |
| `src/components/friends/FriendRow.tsx` | One friend: look, name, NEW, region · level · last played. Reused for the previews in C and D. |
| `src/components/friends/AddFriendModal.tsx` | C. |
| `src/components/friends/FriendProfileModal.tsx` | E. |
| `src/components/friends/FriendInvitePopup.tsx` | D, mounted in `GameLayout`, plus the title-screen ribbon. |
| `src/screens/FriendInvite.tsx` | The `/f/:code` route: stores the invite and redirects. |
| `src/components/RegionRow.tsx` | `RegionRow` moved out of `PlayerProfileModal`, with an optional stat line. |

### 5.2 Changes to existing files

- **`src/engine/regions.ts`**: `regionCasesFrom(progressByRegion, data)`. `regionCases(save, data)` becomes a thin
  wrapper around it. Pure and tested.
- **`PlayerMenu.tsx`**: the Friends row (icon `friends`, the count as hint, the dot), and a `view: 'menu' | 'friends'`
  state for the drawer that goes back to `'menu'` when it closes. Hidden without Supabase.
- **`SidePanel.tsx`**: an optional `onBack` that draws ← before the title.
- **`Hud.tsx`** (header): the dot on the avatar button while `unseen > 0`, and the longer label.
- **`PlayerProfileModal.tsx`**: "Friend ID K7QM-4XD9 [COPY]" for signed-in players. `RegionRow` comes from its new file.
- **`lib/leaderboard.ts`**: `isFriend` on `LeaderboardRow`, parsed from `is_friend`. `splitLeaderboard` doesn't change;
  the FRIENDS filter runs after ranking, so ranks stay global: `board.filter((r) => !friendsOnly || r.isMe || r.isFriend)`.
- **`Leaderboard.tsx`**: the tint and icon on rows and `HallCell`s, friend rows as buttons to `FriendProfileModal`,
  and the ALL / FRIENDS switch.
- **`lib/versus.ts` / `Versus.tsx`**: `isFriend` from `useFriends().ids`, the same tint, and `opponentsOf` putting
  friends first among the unbeaten.
- **`store/sync.ts`**: when signed in, join `friends:<uid>` on the same client, and leave it on sign-out. The handler
  calls `useFriends.getState().onAdded(payload)`: a toast (held while in a fight) and a reload of the list. It drops
  and re-joins the same way as the `app` channel.
- **`App.tsx`**: `<Route path="/f/:code" element={<FriendInvite />} />`, outside `GameLayout`.
- **`Title.tsx`**: the invite ribbon while an invite is pending.
- **`icons.tsx`**: a new `friends` icon (two heads), drawn on the same grid as `user`.
- **`tailwind.config.ts`**: `friend` (`#dcebf7`) and `friend-edge` (`#547acc`). Check `text-muted` on the tint against
  the 4.5:1 rule of [docs/04](04-UX-PLAN.md); the score line uses ink anyway.
- **`strings.csv`**: about 35 `ui.friends.*` rows in all 11 columns (the i18n test fails on an empty cell).

---

## 6. Edge cases

| Case | Behaviour |
| --- | --- |
| Guest | The Friends row opens the connect prompt (B′). A pending invite waits for the sign-in. |
| Signs out | `useFriends` is cleared and the channel left. |
| Two Google accounts on one device | Everything reloads when `auth.userId` changes, as the leaderboard already does. |
| A friend renames or changes their look | Shown after their next cloud push (the card trigger). |
| A friend away more than 72 h | Still in the list, muted, "9 days ago". Off the boards, as today, so the FRIENDS filter shows fewer. |
| A friend with no badge in this region | Not on this region's board, as today. Their profile still shows the region. |
| A friend with no card (signed in, never pushed a save) | "Trainer", "No game saved yet". |
| Both add each other at the same moment | The primary key catches the second insert; it returns `already`. |
| The same add from two tabs | Idempotent. |
| A deployment without Supabase | No Friends row; `/f/…` goes on to `/`. |
| A database without 0033 | `friend_*` returns PGRST202, and the Friends view says "Friends aren't set up on this server yet" (the `leaderboardError` pattern). The board ignores the missing `is_friend`. |
| Privacy | No e-mail, Google photo or user id on screen. User ids travel in the RPC payloads, as Versus already does. |

---

## 7. Database load

A budget, after the 2026-10-07 stall:

| Action | Cost |
| --- | --- |
| Open Friends | 1 call: up to 100 card rows by primary key |
| Open a profile | 1 call: 1 card and 1 Versus team |
| Open the leaderboard | One extra hash join on at most 100 friend ids |
| A cloud push | One extra card upsert (the trigger) |
| Being added | 1 broadcast |
| Game load, signed in | 1 `friend_list` |

No polling. The list refreshes when the drawer opens (at most once a minute), on a broadcast, and at sign-in.

---

## 8. Tests

**Vitest**

- `tests/friends.test.ts`: `normalizeCode` / `formatCode` (O→0, dashes, lower case, wrong length), `inviteUrl`,
  defaults in `parseFriends`, the unseen count, the plural of the toast.
- `tests/leaderboard.test.ts`: `is_friend` parsed, missing → false; the FRIENDS filter keeps global ranks and you.
- `tests/versus-board.test.ts`: friends first among the unbeaten.
- `tests/engine/…`: `regionCasesFrom` gives the same result as `regionCases` on the fixtures.

**SQL**, by hand on a Supabase branch with two test accounts: add, already, self, unknown, reset, remove, the cap, the
rate limit; a direct `select` on `friendships` refused for a player; the broadcast received by the other account; the
board's `is_friend`; the card backfill.

**Playwright** (`mockSupabase` learns `rpc/friend_*`)

- `e2e/friends.spec.ts`: drawer → Friends → the ID shows → add by ID (preview, toast, row with NEW) → profile → remove.
- An invite link: `/f/K7QM4XD9` signed in → pop-up → ADD FRIEND; signed out → the CONNECT version.
- The leaderboard: a friend's row has the tint, the icon and the "Friend" text; the FRIENDS filter.
- `layout.spec.ts`: the Friends view, the add dialog and a profile at 360×640 in every language, through the existing
  contrast check.

---

## 9. Build order

| Phase | Ships | Size |
| --- | --- | --- |
| 1. Database | 0033 (tables, cards and backfill, functions, Realtime policy, `is_friend`), the same edit in 0016, `seed.sql` regenerated | M |
| 2. Friend list | `lib/friends`, the share helper, the drawer view, add by ID, the ID in the profile, strings | M |
| 3. Profiles | `RegionRow` moved, `regionCasesFrom`, `FriendProfileModal`, remove | S–M |
| 4. Invite links | `/f/:code`, the pop-up, the title ribbon, the invite kept across sign-in | S |
| 5. Notifications | The channel, toasts, dots, `friend_seen` | S |
| 6. Leaderboards | The tint, the filter, the Hall of Fame, Versus | S |
| 7. Wrap-up | e2e, layout, the README entry | S |

After phase 1, each phase can ship on its own. Phase 2 alone gives add-by-ID and the list; phase 6 can follow phase 2
directly.

---

## 10. Later, out of scope

- Friend requests with Accept / Decline; blocking.
- Web push or e-mail notifications.
- Ranks among friends only ("1st among your friends").
- "MISTY passed you on the Johto board" notices; an activity feed.
- Fight a friend's Versus team from their profile (a deep link, `/versus?vs=<id>`). Small, and a good first follow-up.
- Link previews for `/f/…` naming the sender (a Netlify edge function writing the Open Graph tags).
- Friends for guests (would need Supabase anonymous sign-in).

---

## 11. To confirm before building

1. Instant friendship from an ID or a link (recommended) or friend requests (§1.2)?
2. A cap of 100 friends?
3. Profiles only for friends, or from any leaderboard row? This plan: friends only.
4. Link path: `/f/<code>` (short) or `/friend/<code>`?
5. Do the Versus boards count as leaderboards for the highlight? This plan: yes.
