# 56 · Welcome-back gifts

The ask, 2026-10-31: a player who comes back after being away for a while gets a gift on return, bigger the longer they
were gone, for retention (D7 is 14 %, D30 2.9 %; about 1,100 players who played 3 days or more haven't been back in a
week). Then the user's call on the delivery: "The welcome back gift can use the same flow as developer message response
and gifting."

So a welcome back **is a message from the developer with gifts** (docs/15 §23), written by the server: the same pop-up,
wrapped gift, gifts' rules the first time, opening (`GiftMoment`), My messages and Inbox count. Nothing of its own
opens on screen.

Behind its own admin switch (docs/15 §20), **Off by default**: while it's Off the server writes nothing and refuses to.

**Status (2026-10-31): built** on `welcome-back-work` (from `version/2_8`), behind its switch, Off. Migration
`0101_welcome_back.sql` (0100 is the analytics', 0102 the Day Care's and offline earnings').

## 1. Decisions

| Question | Answer |
|---|---|
| Days away | **The player's local day today − the last day they played before today** (back the next day = 1), from the days **the server recorded them playing** (`player_days`, the analytics' one call a day, 0028), never the device's clock. That history goes back before this feature, so players who already left get it when they return |
| Tiers | **3, 7 and 14 days** (admin, up to six). **Only the highest tier reached** is given |
| 3+ days | ₽300, 5 Great Balls, 3 Super Potions, 1 Rare Candy |
| 7+ days | ₽1,000, 5 Ultra Balls, 3 Hyper Potions, 2 Revives, 2 Rare Candies |
| 14+ days | ₽2,500, 10 Ultra Balls, 3 Max Revives, 2 Max Ethers, 5 Rare Candies |
| Where they go | Each to the player's **latest region** (`region: 'latest'`, engine/gifts.ts), as a message's gifts. The admin can put a Pokémon or ₽ in a tier with the gifts' own editor |
| How often | **At most one every 14 days** per player (`cooldownDays`, admin) |
| Never | For a **brand-new player** (no earlier day); with **no Supabase** (nothing is asked); while the switch is Off, or On for admin and it isn't the admin |
| Small worlds, Extreme | The message comes; **its gift waits** for the main game outside a small world, as every message's gift does (`giftsWait`). The Extreme save never opens one |
| How it arrives | **A developer's message with the tier's gifts** (the user's call), written by the server on the return. Its words are the game's, in the player's language (below) |
| Rules and INFO (§20) | It has no page: **its rule is in the message itself** (a line under "You were away for 9 days…": from how many days, bigger the longer, how often), and **INFO under that message in My messages** shows its rules (the tiers and what they hold, the cooldown, the main game). The gifts' own rules pop-up still opens before a player's very first gift |
| Needs the gifts | The gift rides on a message, whose gift is hidden while the **Gifts** switch (Admin › Messages) is off. So the server sends a welcome back only while **both** switches are on for the player |

### What changed from the first brief, and why

- **No pop-up of its own** (the user's call above): a welcome back is a message, so it takes the developer's messages'
  turn in the one-time pop-ups' queue (`replies`, right after the offline earnings' "While you were away"), never over a
  fight, one pop-up then the next. When every message shown is a welcome back, that pop-up has its own title ("Welcome
  back, Sam!") and intro, as the league's weekly reward has (docs/44).
- **The claim writes the message** instead of returning the tier for the game to hand over: one path for the gift (the
  server holds it until it's opened, `feedback_claim_gifts` hands it over once), and the gift waits for the main game
  however long the player stays in a small world or Extreme mode, instead of being lost when the day turns.
- **The words are the game's.** A developer's message is plain text in one language. The server writes the numbers
  instead, `@welcome_back:{"days":9,"minDays":7,"from":3,"cooldown":14}` in `reply` (title `welcome_back`), and the game
  says them from strings.csv in the player's language (`welcomeBackNote`, `ReplyBox`), as the league's reward message does
  (`@versus_league:`). The lightest way: no new column, no change to `my_feedback`. Admin › Messages shows it as
  "Welcome back (sent by the game): away 9 days, the 7-day tier".
- **The gifts' switch is checked too** (above), so a player never reads "here's a gift" with no gift under it.

## 2. Days away, in detail

- **The day** is the player's own (`localDay`, as the analytics ping sends it), checked by the server within a day of
  UTC's (`player_ping`'s check). The days compared are the ones `player_ping` recorded in the same local calendar, so a
  player's midnight is theirs. Moving the device's clock or zone can shift a day by one at most (the ±1 check); a day
  played **after** the day asked (the clock moved back, a flight west) gives nothing, and a last welcome back dated after
  it counts as within the cooldown.
- **Asked once a day**: the game asks at load once it knows who is playing, again when that changes (signing in), when
  the content arrives, and back to the tab (a tab left open overnight). A day already asked for that player on this
  device isn't asked again (`localStorage`); asking twice the same day gets **the same answer and no second message**
  (`fresh: false`). The answer only says whether a message was just written: the game then loads the messages again.
- **Guests and accounts**: a guest is `'device:<id>'`, a signed-in player their account, the keys `player_days` uses.
  A signed-in player's days are their account's **and this device's** (0100 moves a guest's days into their account at
  the sign-in's ping; reading both covers a claim that comes before it). Their messages are their account's (seen on
  every device), and a guest's are the device's — `my_feedback` still shows those to whoever signs in on it.
- **Guest → sign-in**: the guest's last welcome back **moves into the account** the first time the account asks from
  that device (the later of the two kept, as 0100 folds the guest's analytics in), and its message with it. So the same
  return never earns a second gift, on that device or any other of the account's, and an unopened gift follows them.
- **Two devices** of one account: one claim row (the account's), so the second device the same day gets the same
  answer; the days played on either end an absence (a phone played daily means no gift on the tablet). Two tabs at once
  take turns (an advisory lock per key).
- **A shared device**: the device's guest days and last welcome back go to the first account that signs in there, as
  the analytics' do since 0100.
- **Delete my data** leaves the claims and the messages as they are (as it leaves the analytics): a fresh start
  within the cooldown doesn't get a second gift.

## 3. The engine (pure, `src/engine/welcomeBack.ts`)

- `welcomeBackOn` (the switch) and `welcomeBackSends` (it and the gifts' switch).
- `welcomeBackTiers`: the admin's tiers as the server reads them (1–365 whole days, each once, every gift readable,
  fewest days first, six at most); `welcomeBackCooldown` (1–365, 14 when unset).
- `welcomeBackOutcome({ today, played, lastClaim }, tiers, cooldown)`: the server's rule step by step (same day → the
  same answer; the cooldown; a day after today; no earlier day; the highest tier). The SQL test runs the same cases
  through both.
- `welcomeBackNote` / `welcomeBackReply`: the message's numbers, read and written.

## 4. The database (`supabase/migrations/0101_welcome_back.sql`)

- game_config `welcomeBack` (`access`, `cooldownDays`, `tiers`), Off, inserted if missing; `welcome_back_cfg()`,
  `welcome_back_open()`, `welcome_back_cooldown()`, `welcome_back_tiers()` (cleaned with 0048's gifts check).
- `welcome_back_claims`: one row per player key (`player`, `day`, `days`, `min_days`, `feedback_id`, `claimed_at`): the
  last welcome back sent. Admin-only reads.
- `welcome_back_claim(p_device_id text, p_day date) returns jsonb`: refuses `welcome_back_off` / `gifts_off`; returns
  null or `{ day, days, minDays, messageId, fresh }`. On a return it inserts the `feedback` row (`from_admin`, title
  `welcome_back`, the note in `reply`, the tier's gifts; the account's `user_id`, or a guest's `device_id`) and records
  the claim.
- `feedback_system()` (0082's) also lets through a message written by a server function **during a player's own
  call**: it checks the current role, which is the database's only inside a security definer function, while a player's
  own insert runs as `anon` / `authenticated` and is stripped by `feedback_reply_stamp` as before, whatever they set.
  0082's two feedback triggers are restated unchanged so the file stands on 0048.
- `configVersion + 1`. Safe to run again. `supabase/seed.sql` doesn't inline it (`player_days` isn't in its prelude).

## 5. What players see

- The developer's messages' pop-up, on its turn: **"Welcome back, Sam!"**, "A gift for coming back. You'll find it again
  under Contact the developer → My messages.", the message ("You were away for 9 days, so here's a gift to get you going
  again!" and its rule line), the wrapped gift ("5 things inside"), **OPEN THE GIFT**. Beside another message from the
  developer, the pop-up is theirs ("A message from the developer!") with each message's title.
- My messages: "Welcome back!", the same words, the gift (opened: what it held), and under it **Welcome-back gifts ·
  INFO**: the rules (Away 3 days or more · Bigger the longer you were away: "3 days → ₽300 +3 · 7 days → ₽1,000 +4 ·
  14 days → ₽2,500 +4" · One every 14 days at most · In your main game).
- Every state is on `/kitchen-sink` (`WelcomeBackBits`).

## 6. The admin

- Admin › Config › Switches: **Welcome back** (Off / On for admin / On for everyone).
- Admin › Config › **Welcome back**: the cooldown, the tiers (days away and their gifts, the gifts' editor, which warns
  while the Gifts switch isn't on for everyone), Add a tier / Remove tier, and what players get as the server reads it.
- Admin › Messages lists each one sent (a "FROM YOU" card to that player), read already, with whether it was opened.

## 7. Setting it up

1. Run the migration in Supabase's SQL editor:
   <https://github.com/Splifingald/pokedice/blob/version/2_8/supabase/migrations/0101_welcome_back.sql>
   (after 0028, 0048 and 0082; safe to run again). `supabase/seed.sql` doesn't carry it.
2. Admin › Messages: the **Gifts** switch must be on (it is, On for everyone, in production).
3. Admin › Config › Switches › **Welcome back**: **On for admin** to try it (the admin's own return), then **On for
   everyone** to open it. **Publish**.

## 8. Tests

- `tests/welcome-back.test.ts`: the defaults and their items, the tiers cleaned, the cooldown, days away across months,
  only the highest tier, a new player, a day after today, the same day, the cooldown, the switches, the note.
- `tests/welcome-back-sql.test.ts` (PGlite, 0019/0025/0028/0048/0101): the row is the engine's defaults and the server
  reads the same tiers; Off refuses, On for admin only the admin, the gifts off refuse; the day and device checks;
  days away and the tiers (3 → 3, 9 → 7, 40 → 14); the message and its gifts, opened once; the same day; a day after;
  the cooldown and the admin's; a signed-in player on two devices; a guest who signs in (the claim and its message
  follow the account, no second gift elsewhere); a guest's history for the account; a player's forged message stripped
  (as the API's own roles) while the claim's goes in; the claims unreadable; the engine and the SQL agreeing on 14 cases.
- `e2e/welcome-back.spec.ts`: back after 9 days (the ask with the local day, the pop-up and its words, the gifts' rules,
  the opening, the save, My messages and INFO, a reload asking nothing more); nothing asked with either switch off.
- `e2e/admin-config.spec.ts`: 26 switches, the Welcome back tab.
