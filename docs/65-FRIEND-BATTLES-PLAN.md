# 65 · Friend Battles: live PvP between friends (plan)

The user's ask, 2026-11-02: *"Build a realtime pvp feature, send a friend invite for a battle, let them answer, pick
their team as a draft, one by one, the one who picks first is random (toss a coin). Players pick their pokemon one by
one. The player who picked first gets a bonus shield (takes half the damage on first turn) so it's more fair. The
feature is locked between off / on for admin / on for everyone and a new category "on for beta testers" I can control
the list of beta testers in admin. There are 2 game modes: Classic: every player goes with their selected team, full
surprise. Draft: as explained above. Build a plan and mockup."*

**Status (2026-11-02): built**, behind its switch, **Off**, on `claude/trusting-mendel-7lu85u` (from `version/2_9`).
The user approved the plan and the three proposals of §12 as they stood. Migration
**`0131_friend_battles.sql`** (version 2.9's SQL file carries it too, last). What was built, and where it differs from
the plan, is §13; how to switch it on is §14.

**The mockup** (15 screens, Daybreak with a Dusk toggle on each, the game's own sprites):
https://claude.ai/artifact/DvqovnATbfQns2gvBbxREa

| Row | Screens |
|---|---|
| 1 · Challenge a friend | Friends page with BATTLE · the mode sheet (Classic / Draft) · waiting for the answer · the friend's side (banner + push) · the Friend Battles page with its rules card |
| 2 · Draft | Coin toss (tap "Toss again") · your pick (tap a Pokémon) · their pick · set your order |
| 3 · Classic and the battle | Classic's READY · your turn · their turn, the shield halving a hit · a player drops · the result |
| 4 · Admin | The 4-way switch, the numbers, the Beta testers list |

---

## 1. Decisions (proposed; the three marked ❓ are for the user, §12)

| Question | Proposal |
|---|---|
| Name | **Friend Battles** (FR *Combats entre amis*). `/battles`, from the Friends page's card and each friend's BATTLE |
| Who can be challenged | **Friends only, online now** (in the game in the last 2 minutes, §5.3). An offline friend's button says *Offline* |
| Who can play | Signed in, the switch open to them, **Versus unlocked** (3 Pokémon at Lv.50). Not in Extreme mode (a race of its own, as Trades). One battle at a time |
| The challenge | The challenger picks the mode and sends it. The friend sees a **banner** (not a modal) with ACCEPT / NO and a 2-minute gauge, on any page; **mid-fight it waits for the fight's end**. Expires after **120 s** (admin). Cancel any time before an answer |
| The fight's rules | **Versus's**: 3 v 3, **Lv.50 with the dice and rerolls of the Pokémon's own level** (`versusSeedLevels`), hidden talents carried, **no battle powers** (built: §13), **no Bag**, **switching on your turn, which costs the turn** (2.9.2, §17; it was none), no XP, no ₽. The save is never touched |
| Classic | Each brings **their registered Versus team** (`versus_teams`, held by the server), can CHANGE it in the lobby, then READY. Neither sees the other's team until the fight starts. **No coin, no shield**: Speed decides who moves, as in every fight |
| Draft: the coin | The **server** tosses (heads: challenger). Both see the same animated coin. The winner picks first |
| Draft: the picks | **A-B-A-B-A-B**, one Pokémon at a time, **30 s a pick** (admin). Each picks from **their own** Lv.50+ Pokémon (`versusChoices`: every region's Box, one per species, shiny apart). Every pick is shown to both as it lands. ❓ **A species one player took is gone for the other** (no mirror), unless they have nothing else left. Time out: the best one left on their list is picked for them (§4.3) |
| Draft: the order | After the 6th pick, **20 s** to set your order (drag or tap two to swap). The lead is secret until sent out; each next one is too. Time out: the order shown is kept |
| The Bonus Shield ❓ | **The first picker's team takes half damage (rounded up) from the opponent's first attack**, whenever that attack comes (if the shielded player moves first, it waits for the reply). A burn or poison tick isn't an attack and doesn't use it. Shown as a blue **◆ Shield** tag on the plate, struck out once used; the hit's log line says "The Bonus Shield softens the hit: 38 → 29." **A quarter blocked since 2.9.2** (§17; it was half); admin |
| Turns | **45 s a turn** (admin), a chip at the top right. Time out: the server files a time-out move (asked by the waiting game), and **the dice in hand attack** (built: §13). **No AUTO-MODE** (2.9.2, §17: it was offered): each player plays their own turns |
| Who moves | The faster lead first (a tie: the battle's seed). Then **turn about**: a stunned Pokémon's turn passes by itself, and a K.O.'d one's next comes out in order |
| Watching | On the opponent's turn you see **their dice live**: each reroll and the attack as they press it |
| Leaving | FORFEIT (the flag) is a loss. A dropped connection: the other game says "{name} lost connection" after 30 s; back within **90 s** (admin) the match goes on where it is (a turn that ran out meanwhile attacked with the dice in hand); otherwise the other player wins |
| Rewards ❓ | **None in ₽ or items** (between friends it would be farmed). What it gives: a **head-to-head record** per friend ("You lead 5–3"), a total W–L on the trainer card, and it **counts as a friendship interaction** (docs/60: keeps the streak, Heart Scales once a day per pair) when Friendship is on |
| Rematch | A new challenge, same mode, answered like any other; Draft tosses again |
| Switch | `friendBattles.access`: **Off / On for admin / On for beta testers / On for everyone**, Off by default, checked by every server function (§3) |
| Rules | Its page's `RulesCard` the first time `/battles` opens (`friendBattlesRulesSeen`), INFO at the page's foot (docs/15 §20). A Home notice when it opens ("Friend Battles are here"), as other features with a page |

## 2. How the realtime works (the core choice)

**Lockstep, ordered by the server, randomness from the server.** No fight is replayed on the server (docs/63's rule
stays), yet neither device can cheat on the dice.

1. Both devices hold the **same engine state** and apply the **same list of moves** in the same order: the fight is a
   pure function of (both teams, the shield, the moves, the seeds).
2. Each move goes through one RPC, `pvp_move(match, seq, move)`. The server checks the sequence number (no gap, no
   replay), that it is that player's turn, and the deadline; stores it in `pvp_moves`; answers with **this move's
   seed** (`hmac(match secret, seq)`, the secret never leaves the server); and broadcasts move + seed on the match's
   private Realtime topic. Both devices apply it on receipt (the mover too: its own move lands when the server says).
3. **Every die thrown comes from the seed of the move that throws it**: the turn's first throw from the seed of the
   move that started the turn, a reroll from its REROLL's seed, a freeze chance from its ATTACK's. A modified game
   can't see a reroll before asking for it, because the number doesn't exist yet. (A shared seed for the whole match
   would let a modified game peek at every future throw.) The cost: one round trip per throw, ~100–200 ms, covered by
   the dice animation.
4. **Whose turn** is the engine's answer; the mover's game sends it with the move (`next: 'a' | 'b'`), the server
   stores it and uses it for the next move's check, and the other device checks it against its own engine. A
   disagreement ends the match as **void** (no record), kept for the admin.
5. **The end**: when the engine says it's over, both devices call `pvp_finish(match, winner, left, foeLeft, hash of
   the state)`. Two equal claims settle it; one claim and 30 s of silence settle it too; two different claims void it.
6. **Missed messages**: on (re)joining the topic, `pvp_state(match, after_seq)` returns every move after the last one
   applied, so a reload or a dropped socket catches up exactly.
7. **Presence of the two players**: each device calls `pvp_ping(match)` every 20 s during a match (and every RPC
   counts as seen). A player not seen for the grace period loses on `pvp_claim(match)` by the other.

Realtime topics (private broadcast, the 0029 pattern, `realtime.send` from the functions):

| Topic | Who listens | What |
|---|---|---|
| `pvp:<match id>` | The two players, while the match lives | Coin, picks, order ready, moves + seeds, timeouts, the end |
| `pvp-inbox:<user id>` | That player, while the feature is open to them and the tab is visible | A challenge, its answer, its cancel |

An RLS policy on `realtime.messages` lets a user read `pvp:<id>` only if they are one of its two players, and
`pvp-inbox:<id>` only if it is their own id. The inbox is one more join on the socket the `app` channel already holds
(docs/16 §8.3 kept Realtime out of friends for cost; this is a single topic per open tab, and only where the feature
is open).

## 3. On for beta testers (a 4th access level for every feature)

- **The engine**: `EVENT_ACCESS = ['off', 'admin', 'beta', 'all']`. `eventOpenTo(access, data)`: `all`; `admin` and
  the viewer is the admin; **`beta` and the viewer is the admin or a beta tester**. `GameData.viewer.beta`.
- **Where the game learns it**: `friend_status()` (already called at game load and on return to the tab) adds
  `beta: boolean`; `withViewer` puts it in `data.viewer`. Signed out: never beta.
- **The database**: `beta_testers (user_id pk → auth.users, added_at, added_by, note)`, admin-only RLS;
  `is_beta_tester()` (`is_admin()` or a row); **`access_open(access text)`**: the one SQL check every feature can use
  (`all`, or `admin` and `is_admin()`, or `beta` and `is_beta_tester()`). Admin RPCs: `beta_tester_add(query)` (a
  name, friend ID or e-mail; refuses an unknown or ambiguous one), `beta_tester_remove(user)`, `beta_testers_list()`
  (name, look, friend ID, when added).
- **Only for features that understand it**: a feature's server functions today check `= 'all' or ('admin' and
  is_admin())`, so a feature set to beta would show to testers and be refused by the server. The admin's switch
  offers *On for beta testers* only on rows marked `beta: true` (`Feature` in `ConfigSection.tsx`), the ones whose
  functions call `access_open`: **Friend Battles first**. Moving an older feature over is one migration each (its
  `*_open()` helper calls `access_open`); docs/15 §20 says so.
- **Admin**: Config → Switches, a **Beta testers** box beside the switches (search + ADD, rows with REMOVE). The
  switch draws the beta choice in blue so it reads apart from admin-only. Removing a tester hides those features at
  their next load; their data stays.

## 4. The engine (pure, `src/engine/friendBattle.ts`)

### 4.1 The match

- `FriendBattleConfig` and `FRIEND_BATTLE_DEFAULTS` (expiry 120, pick 30, order 20, turn 45, grace 60, shield 50,
  modes `{ classic: true, draft: true }`); `friendBattleConfig(data)`, `friendBattlesOn(data)` (the switch, not
  Extreme).
- `PvpMatch`: built on `VersusMatch` (docs/44 §2), with **canonical sides** A (challenger) and B, never "player" and
  "enemy": the engine's `player` is A, its `enemy` is B, and each device draws the fight from its own side (§6.4).
- `startPvp(teamA, teamB, shield, data)`: both teams via `cloneForVersus` / `versusSeedLevels`, the powers as
  Versus's, `shield: 'a' | 'b' | null`.
- `pvpStep(match, side, move, seed)`: applies one move of either side (REROLL with its selection, ATTACK, a power,
  SKIP TURN when stunned), drawing every die of that step from `seed` (`createRng(seed)`), and returns the log and
  `next`. The existing `reduce` takes the enemy side's moves from the stream instead of `EnemyPlan`.
- `pvpAutoMove(match, side, data)`: `versusAutoMove` for either side (a timed-out turn).
- `pvpOutcome(match)`, `pvpStateHash(match)` (for `pvp_finish`).

### 4.2 The Bonus Shield

`BattleState.shield?: { side, pct, used }`. In the damage step (`damage.ts` → the attack's resolve), an attack
landing on the shielded side while unused deals `ceil(damage × pct / 100)` and sets `used`; the log gains
`{ kind: 'shield', side, before, after }`. Status ticks don't touch it. Z-Moves and powers' attacks do.

### 4.3 The draft

- `draftOrder(firstPicker)`: `['a','b','a','b','a','b']` from the winner.
- `draftChoices(own candidates, picks)`: what a player may pick now (own Lv.50+, each species once in their team,
  minus the opponent's species unless that would leave none).
- `draftAutoPick(choices, data)`: the strongest left by `versusPower` (docs/44), the time-out's pick. The game sends
  its ranked list with `pvp_ready`, so the server can make that pick itself when the player is gone (§5.2).
- `coinFromSeed(seed)`: the coin, so both devices animate the same face the server chose.

### 4.4 Tests (`tests/friendBattle.test.ts`)

Two replicas fed the same moves and seeds end equal (1,000 random fights); a different seed changes only that
step; the shield halves exactly one attack, on the right side, and never a tick; draft rules (mirror refused,
allowed when nothing else); timeouts pick the strongest; the record's maths.

## 5. The database (`supabase/migrations/0131_friend_battles.sql`, the number as of version/2_9)

### 5.1 Tables (players never touch them: `security definer` functions only)

- `game_config.friendBattles` (the switch and the numbers) and `friend_battles_open()` → `access_open(...)`.
- `beta_testers` (§3).
- `pvp_matches`: id, `a`, `b`, `mode`, `state` (`invited`, `declined`, `expired`, `cancelled`, `coin`, `draft`,
  `order`, `battle`, `done`, `void`), `secret` (never returned), `first_picker`, `shield`, `picks` jsonb, `team_a`,
  `team_b` (read from the save or `versus_teams` by the server, never from the page), `order_a`, `order_b`,
  `turn` (`a`/`b`), `seq`, `deadline`, `seen_a`, `seen_b`, `winner`, `left_a`, `left_b`, `claims` jsonb,
  `created_at`, `ended_at`.
- `pvp_moves`: match, seq, side, move jsonb, seed, at (pk match + seq).
- `pvp_records`: the pair (lower id first), wins each, last battle. `pvp_here`: user, at (§5.3).

### 5.2 Functions (each checks `friend_battles_open()`, friendship, one match per player)

| Function | Does |
|---|---|
| `pvp_challenge(friend, mode)` | Checks both can play (Versus unlocked, not in a match, the friend online), creates the match, sends to `pvp-inbox:<friend>` (and a push, §7) |
| `pvp_answer(match, accept)` / `pvp_cancel(match)` | The answer within the expiry. Accept → Classic: `order`; Draft: `coin` then `draft` (the server tosses) |
| `pvp_ready(match, ranked, team?)` | Classic: the team (or the registered one). Draft: the player's ranked candidates, checked against their save (Lv.50+, owned) |
| `pvp_pick(match, dex, shiny)` | Draft: the turn's player, a legal species, before the deadline |
| `pvp_order(match, order)` | The team's order; both in → `battle`, with the first move's seed |
| `pvp_move(match, seq, move, next)` | §2 |
| `pvp_timeout(match)` | Called by the waiting device after a deadline: a pick or order made by the server (§4.3), or, in battle, permission to send `pvpAutoMove` for the absent side |
| `pvp_ping(match)`, `pvp_claim(match)` | Presence and the win by absence |
| `pvp_finish(match, …)` | §2.5; writes `pvp_records`, and the friendship interaction (docs/60's log, kind `battle`) |
| `pvp_state(match, after_seq)` | The match as the caller may see it (never the secret, never the other's order before it's revealed) and the moves after `after_seq` |
| `pvp_home()` | The page: pending challenge, current match, record per friend, last 20 battles |
| `pvp_here()` | §5.3 |

### 5.3 "Online now"

While the feature is open and the tab is visible, the game calls `pvp_here()` every 60 s (and on return to the tab).
A friend is online if seen in the last 2 minutes; `friend_status()` and the Friends page return it. About one call a
minute per open tab where the feature is open; with beta testers, a handful.

### 5.4 Cleanup

pg_cron every 10 minutes: challenges past expiry → `expired`; matches with no move for 10 minutes → `void`; moves of
matches ended over 30 days ago deleted (the records stay).

## 6. The game (React)

### 6.1 Files

- `src/lib/pvp.ts`: the RPCs and the two topics (join, catch up with `pvp_state`, leave), as `lib/trades.ts` does.
- `src/store/pvp.ts`: the match being played, the incoming challenge, applying moves in order, the deadlines' timers.
- `src/screens/Battles.tsx` (`/battles`): rules card, record, last battles, INFO.
- `src/components/pvp/`: `ChallengeSheet`, `ChallengeBanner` (mounted in `GameLayout`, shown between fights),
  `WaitingCard`, `CoinToss`, `DraftBoard` (the two rows of three, the order strip, the picker list with matchup lines),
  `OrderPicker`, `ClassicLobby`, `PvpResultCard`, `ShieldTag`, `TurnGauge`, `DropOverlay`.
- The fight is **the battle screen** (`BattleView`) with a new `pvp.live`, like Versus's `versus.live`: the player's
  own controls on their turn, the opponent's dice shown live (not buttons) on theirs, no Bag, no AUTO-MODE switch,
  FORFEIT as Versus's.

### 6.2 Friends page

The Friend Battles card (record, NEW until the page is seen) under the friendship card; a **BATTLE** button on each
friend's card (red on the first online friend, navy on the others, *Offline* hatched); the online dot and "Online now".
A friend who can't play shows why on tap ("Kiro needs 3 Pokémon at Lv.50").

### 6.3 The flow

Friends → BATTLE → mode sheet → SEND → waiting card (CANCEL) → their answer → Draft: coin → picks → order / Classic:
lobby, READY → the fight → the result (head to head, the friendship line, REMATCH, BACK TO FRIENDS). Each step's
deadline is a gauge plus seconds (a dark chip in the top bar).

### 6.4 The two sides

The engine's state is canonical (A, B); the challenged player's device flips it for drawing: their Pokémon from the
back, bottom right, their dice in the tray. One `perspective` prop on the battle's pieces; the log's lines are written
from the reader's side.

### 6.5 Leaving the page mid-match

The match lives on the server, so leaving `/battles` (or reloading) brings you back to it: Home shows a "Battle in
progress · back to it" notice card while one is running, and the grace timer runs meanwhile.

## 7. Push

A challenge to a friend whose tab is closed but who has push on (docs/27) sends one at once: "Grégoire challenges you
to a Draft battle! 2 minutes to accept." (topic `battle`, its own switch in Settings → Notifications; never in their
quiet hours). Sent by `netlify/functions/push-send.mts` called from `pvp_challenge` through `pg_net`, not the
scheduled run. **Phase 4**: the feature works without it (the friend must be online to be challenged).

## 8. Words (`src/i18n/strings.csv`, all ten languages)

About 70 strings: the page, the rules card (4 rows), the mode sheet, the banner, the waiting card's outcomes, the coin,
the draft, the order, the turn gauge, the shield's tag and log line, the drop overlay, the result, the push, the admin
(English only, as the admin is). `pnpm i18n:fonts` after the CJK columns.

## 9. Docs/15 and the kitchen sink

A new §50 *Friend Battles*: the banner (a dialogue frame under the top bar, never a modal), the coin, the draft board,
the shield tag (the sky blue `#3a7bd5` of INFO, struck out when used), the turn gauge, the drop overlay, the access
switch's 4th value. Every new component on `/kitchen-sink` in every state (each timer state, shield on / used,
picks taken, the two perspectives).

## 10. Phases

| Phase | What | Alone it gives |
|---|---|---|
| **P0 · Beta testers** | `'beta'` access, `beta_testers`, `access_open`, `friend_status().beta`, the admin box, the switch's 4th option | The beta switch, usable by any feature moved onto `access_open` |
| **P1 · Engine** | `friendBattle.ts`, the shield, per-move seeds, the draft, canonical sides, tests | — |
| **P2 · Database** | 0131: tables, functions, Realtime policies, cron; SQL tests as `tests/versus-league-sql.test.ts` | — |
| **P3 · Game** | `/battles`, the flow, the banner, `pvp.live`, Friends page, strings, docs/15 §50, kitchen sink, e2e with two pages | The feature, behind its switch, **Off** |
| **P4 · Extras** | Push for challenges, the trainer card's W–L, the friendship hook | — |

Each phase on its branch with a pull request into `version/2_9` (or the next version branch) and its Netlify
preview; the migration's GitHub link given with the push; patch notes only when it opens to everyone.

## 11. Risks

- **Desync** (two devices disagreeing): the engine is pure and the moves ordered, so it can only come from a bug or a
  modified game; the state hash per `pvp_finish` catches it, the match is void and the admin sees it. The 1,000-fight
  replica test guards the engine.
- **Latency**: each throw waits for the server (~150 ms); the dice animation already takes longer.
- **Cost**: a fight is ~40–80 small RPCs and as many broadcasts, plus a ping every 20 s; the inbox adds one join per
  open tab where the feature is open. Under beta this is nothing; before opening to everyone, measure on the preview.
- **A player who never answers a turn**: the waiting device plays auto for them at the deadline, so a fight always
  ends.

## 12. Open questions for the user

1. **The shield**: half damage from the opponent's **first attack** (whenever it comes, as proposed), or only during
   the battle's very first turn (which does nothing if the shielded player moves first)?
2. **The draft pool**: each player picks from **their own** Lv.50+ Pokémon and a species taken by one is gone for the
   other (proposed), or a **shared pool** of rental Pokémon both draft from (fairer between a new and an old player,
   more to build)?
3. **Rewards**: none but the record and the friendship streak (proposed), or a small daily ₽ for the first win of the
   day?

## 13. Built

- **Engine** `src/engine/friendBattle.ts` (pure): `FRIEND_BATTLES_DEFAULTS`, `friendBattlesConfig/On/For`,
  `friendBattlesRulesDue`, `markFriendBattlesRulesSeen`; the draft (`draftCandidates`, `draftOrder`, `draftTurn`,
  `draftChoices`, `draftAutoPick`, `coinFace`); the fight (`startPvp`, `applyPvpMove`, `pvpView`, `pvpLogFor`,
  `flipEntry`, `pvpStanding`, `pvpHash`). Each turn is the battle engine's one-turn duel step (`startDuelStep`, the
  raids') with the side whose turn it is in the player seat, so both sides run the same code; the match keeps both
  teams between turns. `battle.ts`: `BattleState.shield` and the `shield` log entry (the hit cut before it lands).
  `EVENT_ACCESS` gains `'beta'`; `eventOpenTo` reads `viewer.beta`. Tests: `tests/engine/friend-battle.test.ts` (120
  whole fights on two replicas end equal, the shield, the draft, time-outs, forfeits, the views, the switch).
- **Database** `supabase/migrations/0131_friend_battles.sql`: as §3 and §5, tested on PGlite by
  `tests/friend-battles-sql.test.ts`. Whose turn it is in the fight is the games' (the server doesn't run the engine):
  a move out of turn is stored and ignored the same by both engines; a time-out move only ever costs the side whose turn
  it is. A forfeit is settled by the server at once.
- **Game** `src/lib/pvp.ts` (the calls, the topics), `src/store/pvp.ts` (the lockstep, the clock, catching up),
  `src/components/pvp/` (`FriendBattlesService` with the banners, `ChallengeSheet`, `FriendBattleBits`, `ShieldTag`),
  `src/screens/Battles.tsx` (`/battles`), `src/screens/battles/Live.tsx` (`/battles/live`: waiting, coin, draft,
  order, the fight on `BattleView` with `versus.live` and `noSwitch`, the result). The Friends page's card and BATTLE
  buttons; Home's notice; How to play's feature list; Admin → Config: the row (with the beta choice), the Friend
  Battles tab, the Beta testers box. Strings in the ten languages. docs/15 §50; the kitchen sink. e2e:
  `e2e/friend-battles.spec.ts` (with a fight's move checked against the engine on the same seeds, and a reload's
  catch-up), `e2e/admin-config.spec.ts`.
- **Different from the plan**:
  - **No battle powers** in Friend Battles: the engine's powers are tied to the "player" seat and the foe's AI plan;
    letting both people use them needs its own work. Talents are carried.
  - **A time-out attacks with the dice in hand** rather than playing the AI's turn: the server can file it alone
    (`pvp_timeout`), the same on both games.
  - **No switching during the fight** (until 2.9.2, §17: now on your turn, costing it): the order step sets it, the
    next one comes out on a K.O.
  - **Push for challenges** (§7, phase 4) is **not built**: a friend must be in the game (Online now) to be challenged.
  - The trainer card's W–L isn't shown; the record is on `/battles` and the Friends page's card.

## 14. Setting it up

1. Run the migration in Supabase → SQL Editor:
   https://github.com/Splifingald/pokedice/blob/version/2_9/supabase/migrations/0131_friend_battles.sql
   (or version 2.9's file, `supabase/releases/2026-11-01-version-2-9.sql`, which carries it last). Not in
   `supabase/seed.sql`. Realtime must be on for the project (it is: the `app` channel uses it).
2. Admin → Config → Switches: add the beta testers (name, friend ID or e-mail) in the Beta testers box.
3. Set **Friend Battles** to *On for beta testers* (or *On for admin* to try it alone first), Save, Publish.
4. Admin → Config → Friend Battles: the timers, the shield, each mode on or off.
5. Battle tickets (§15): run
   https://github.com/Splifingald/pokedice/blob/version/2_9/supabase/migrations/0132_battle_tickets.sql
   after 0131 (version 2.9's file carries it too, last). Not in `supabase/seed.sql`.

6. Lv.50 or Lv.100 (§16): run
   https://github.com/Splifingald/pokedice/blob/version/2_9/supabase/migrations/0133_friend_battle_levels.sql
   after 0132 (version 2.9's file carries it too, last). Not in `supabase/seed.sql`.

7. Switching and the quarter shield (§17, version 2.9.2): run
   https://github.com/Splifingald/pokedice/blob/claude/determined-feynman-wqflg9/supabase/migrations/0137_friend_battle_switch.sql
   after 0133 (the same file on `version/2_9_2` once merged). Not in `supabase/seed.sql`. Run it before the 2.9.2 build
   goes live: the build sends switches the server refuses until then.

## 15. Battle tickets

The user's ask, 2026-11-02: *"Add battle tickets as a new currency, one battle ticket is given to all players at
midnight and max 3 tickets can be held at the same time. Battle tickets are bought in the friend shop too for 10 heart
scales up to 10 per week (if the player buys them it can go over 3). A pvp fight costs 1 battle ticket to both
players. Spent on start."* Migration **`0132_battle_tickets.sql`**.

| Question | Answer |
|---|---|
| Where they live | **On the server**, per account (`pvp_tickets`), like Heart Scales: the server takes them, so a hand-edited save can't make any |
| Midnight | **UTC midnight** (the friendship streaks' day): +1 while a player holds **fewer than 3**, never past 3. Counted lazily: the first look after N midnights gives up to N, still capped at 3 |
| A new player | **Starts at 3** (the cap), so a first match never waits for a midnight |
| The Friend Market | **Battle ticket, 10 Heart Scales, 10 a week** (the market's week), last on the shelf while Friend Battles is open to the player. Bought ones **can go past 3**, and a midnight then gives none until they're spent below 3. Credited at once: no gift to open |
| The cost | **1 from each player, taken as the fight starts** (both ready, after the draft or Classic's order). A challenge needs both to hold one (`pvp_no_ticket`, `pvp_friend_no_ticket`), and so does the answer. A match left before its fight costs nothing; one started and then void keeps its tickets spent |
| Admin | Config → Friend Battles: tickets a midnight, the cap, the price, the week's limit (`friendBattles.ticketDaily`, `ticketCap`, `ticketPrice`, `ticketWeekly`) |

**On screen**: the ticket is the wheel's stub redrawn in blue with a red cross of blades (`battleTicket`), the count
beside it (`TicketCount`). `/battles` has the tickets card (the count, "+1 at midnight, in 5 h (up to 3)" or "Full",
BUY MORE to the Friend Market); the Friends page's card shows the count; the challenge sheet says the cost (none held:
a rose line saying why, SEND off); the challenge banner shows "−1" by the ticket; the market's card says how many you
hold. The rules card's 4th row is the tickets' (the turn's time joined the first row). Tests: the SQL suite's
"battle tickets (0132)", the engine's market row, two e2e.

## 16. Lv.50 or Lv.100

The user's ask, 2026-11-02: *"Add choice between lvl 50 or lvl 100 battles too."* Migration
**`0133_friend_battle_levels.sql`**.

| Question | Answer |
|---|---|
| Who picks | **The challenger**, beside the mode, in the challenge sheet (Lv.50 first). The friend sees it on the banner (a level tag beside the mode), and the match shows it at every step and in the history. A rematch keeps it |
| The rule | **Versus's rule at either level**: every Pokémon shows the fight's level and has that level's **HP and Speed**, and keeps the **dice and rerolls of its own level** (`pvpBattler`). At Lv.50 a stronger one is brought down (as before); at Lv.100 a weaker one is brought up to Lv.100's HP and Speed, its dice its own. So Lv.100 fights are longer, and the dice of a better-raised Pokémon count for more |
| Who can play | The same at both: Pokémon at Lv.50 or more (the Versus team for Classic) |
| Admin | Config → Friend Battles: *Lv.100 battles* (on by default; off, the sheet offers Lv.50 only and the server refuses 100: `pvp_level_off`) |

Built in `src/engine/friendBattle.ts` (`PVP_LEVELS`, `pvpBattler`, `startPvp`'s level), the match's `level` column and
`pvp_challenge(friend, mode, level)`, the sheet's level choice (`LevelTag` elsewhere: Lv.100 in ink, Lv.50 plain),
tests in the engine, SQL and e2e suites.

## 17. Switching, and a quarter shield (version 2.9.2)

The user's ask, 2026-11-03: *"Players should be able to change pokemon in versus battles and friend battles. Also, the
shield value should be 25% not 50% in friend battles draft mode."* Migration **`0137_friend_battle_switch.sql`**.

| Question | Answer |
|---|---|
| Switching | **On your turn, as in every fight**: a team pip (or the PC's team column), the send-out's cards, GO!. **It costs the turn**: the dice in hand are dropped and the other side plays. A stunned turn still passes by itself (no switching then, as everywhere) |
| After a K.O. | Unchanged: **the next one in order comes out** (the order step still sets it). A switch on the turn that follows changes it, at a turn's cost |
| The move | `{ k: 'switch', uid }` (`PvpMove`): the engine's own voluntary switch in the turn's duel step, logged as `pvp_out` with `switched` (the engine's `switch` entry names no side). Refused alike on both games when it can't be made (not that side's turn, the one out, fainted, not theirs). The server takes it only with one of the mover's own uids (`a0`–`a5` for side a) |
| On screen | Your switch: "Come back… Go!" as in any fight. Theirs: the next battle opens on your screen with the one they sent in, as after a K.O.; the dots on their plate count only K.O.s now |
| AUTO-MODE | **Gone from Friend Battles** (the user's follow-up, 2026-11-03): two people fight it, each plays their own turns. A turn left to run out still attacks with the dice in hand (the time-out). `BattleView`'s `live` without `onAuto` draws no AUTO-MODE switch |
| Versus league | **Already had it** (docs/44 §4: "dice, rerolls, switches"): checked on a phone and a PC; an e2e now keeps it so |
| The shield | **Blocks a quarter** of the opponent's first attack (it took half): `friendBattles.shield`, the share of the hit still taken, **75** (was 50). The migration moves a stored 50 to 75 and leaves another value the admin set. The admin's field now says the share **blocked** (25), the way the rules card says it ("25% less"). The log line no longer says "half" |

Built in `src/engine/friendBattle.ts` (`applyPvpMove`'s switch, `FRIEND_BATTLES_DEFAULTS.shield` 75), `src/lib/pvp.ts`
(`parseMove`), `src/screens/battles/Live.tsx` (SWITCH sent as a move; `noSwitch` is gone from `BattleView`), the admin's
Friend Battles box, the rules card's first row ("Switching costs your turn.") and the shield's log line in the ten
languages. Tests: the engine's (switches mixed into the 120 replica fights, a switch's turn and log, the refused ones,
the quarter), the SQL suite's "switching and the quarter shield (0137)", e2e `friend-battles.spec.ts` (my switch sent and
played; theirs arriving) and `versus-league.spec.ts` (a switch on your turn).
