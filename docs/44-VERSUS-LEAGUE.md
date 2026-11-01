# 44 · The weekly Versus league

The user's rework of Versus, October 2026: a league that starts again every Monday. Players fight their matches
themselves, win trophies, climb a group of 20 and are rewarded at the end of the week. The opponents are always on
auto. Bots fill the empty places and the opponents' list, and only the admin can tell them from players. A new item,
the **Raid Ball**, is one of the rewards. All of it sits behind its own admin switch (docs/15 §20), Off by default:
while it's Off, Versus is what it was (every team, the attack and defense boards, fights on auto).

**Status (2026-10-27): built** on `claude/quirky-maxwell-ilueyw` (from `version/2_4`), behind its switch, Off.
Migration `0082_versus_league.sql`. The global board (§8, 2026-10-29): migration `0091_versus_league_global.sql`, its
own switch, Off. New bot teams every week (§9, 2026-10-30): migration `0092_versus_bot_weeks.sql` and the hourly
Netlify job `netlify/functions/versus-bots.mts`. The trainer card's best (§10, 2026-10-31): migration
`0097_versus_best_trophies.sql`.

## 1. Decisions (the user's answers)

| Question | Answer |
|---|---|
| Week | **Monday 00:00 to Sunday 24:00, UTC**. Everyone starts again from 0 |
| Gameplay | **The player fights** (active by default), **AUTO** if they like. The opponent always plays on auto |
| Levels | **Lv.50, like a raid's team cap** (the user's rule, 2026-10-29): every Pokémon shows Lv.50 and has its Lv.50 HP, but **keeps the dice and rerolls of its own level** (`versusSeedLevels`, as `raidSeedLevels`). A team stores each Pokémon's real level (migration 0090); one saved before keeps Lv.50 until it is saved again, and the team editor offers SAVE while a level differs. The bots stay at Lv.50 |
| Items | **None at all**: no Bag in a league fight, and the server refuses a result with an item used |
| Trophies | A win: **+3 / +6 / +10** with 1 / 2 / 3 of your Pokémon left. A loss: **−3 / −6 / −10** by the opponent's Pokémon left. **Leaving** a fight (closing it, losing the connection, the flag) is the full **−10** |
| Safe line | **Below 100 trophies a loss costs nothing.** There's no floor at 100: 104 can fall to 94, and is safe again from there |
| Defenders | **Only the player who starts the match** wins or loses trophies. A team picked as an opponent never loses anything while its owner is away |
| Match limit | **None** |
| Opponents | **3 choices**, their **teams and trophies** shown. **Fixed until one is fought**. From **any player** with a Versus team whose trophies this week are within **±15 %** of yours (**±30** at least). Bots fill the slots nobody fits |
| Groups | **20 players**. The **number of groups** is set on the week's first match: last week's players × (last Sunday's daily players ÷ the Sunday before) ÷ 16. With no league last week, everyone with a Versus team ÷ 16. Each player's first match puts them in the **emptiest open group**, so early and late players mix. Friends get no priority. When every group is full, a new one opens |
| Bots in groups | **Yes**: on **Wednesday, Thursday and Friday**, up to **5 bots a day** take the empty places of each group. They climb through the week toward a **believable place** among the group's players (a player's trophies, projected to Sunday, ×0.6 to ×1.25), arriving by Sunday 22:00. A bot can finish first |
| Bots' strength | **Tiers by trophies**: 0–99 solid picks and no powers; 100–249 strong picks and one power; 250–499 better picks and two powers; 500+ the best (legendaries too) and all three. Good type coverage at every tier. The thresholds are in Admin |
| Bots' teams | **A new set every week** (the user's ask, 2026-10-30): drawn on the week's own seeds, **40 different teams a tier and 80 from 500 trophies**. A bot keeps the team it was seated with all week (§9) |
| Bots' disguise | **A player to everyone but the admin**: a name, a look, a team and trophies, and an id like a player's. The admin sees **BOT** |
| Ties | **A shared rank**, and the same reward |
| Rewards | **Gift messages** (Admin's gifts, docs/15 §23) after the week ends: **₽1 a trophy**, and for the top 10 of each group 1st **5 Raid Balls + 10 Rare Candies**, 2nd **2 + 5**, 3rd **1 + 3**, 4th–5th **3 Rare Candies**, 6th–10th **1 Rare Candy**. Everything goes to the region being played when the gift is opened |
| Raid Ball | **+5 to the catch die, in every raid and only in raids** (progression raids, Arceus's daily raid, event raids, small worlds' and nightmares' raids). A special picture and a pink-and-gold trail on its throw. **Weekly rewards and admin gifts only**: not sold, not tradable |
| Board | The current group, and **last week's** final standings. The old attack and defense boards are hidden (their data is kept) |
| Extreme mode | **No league**: Versus stays as it was there |
| Cheating | **Trust plus limits**: the result comes from the player's device. The server works out the trophies itself and refuses: an impossible result (more than 10 trophies, Pokémon counts that can't be), a win **too fast** to have been played, and a fight with an **item used** |

## 2. The engine (pure, `src/engine`)

- **`versus.ts`**: a Versus fight as plain data you can step through (`VersusMatch`: the battle being fought, what the
  earlier ones left, both random streams as their states).
  - `startVersus`, `versusStep` (one event; items and running refused), `versusAutoMove` (the auto player's next move),
    `versusNextRound` (the next defender, or the end) and `versusStanding` (each side's Pokémon left).
  - `simulateVersus` (the old auto fight) is now built on these, and gives the same results for the same seed.
  - `versusRulesDue`: with the league on, the league's own flag (`save.versusLeagueRulesSeen`).
- **`versusLeague.ts`**:
  - `VERSUS_LEAGUE_DEFAULTS` and `leagueConfig` (game_config `versusLeague`); `versusLeagueOn` (the switch) and
    `versusLeagueFor` (on, and not Extreme).
  - The rules: `trophyChange` and `winTrophies`, `opponentRange`, `winTooFast`.
  - The week: `weekStartOf`, `weekEndOf`, `weekId`, `leagueGroupCount`.
  - The ranking and rewards: `rankLeague` (tied players share a rank), `leagueReward`, `leagueGifts`.
  - The bots: `botTierOf`, `versusPower` (a species' strength at Lv.50), `teamCoverage` and `buildBotTeam` (three
    fully evolved Pokémon from the tier's share of the strength ranking, picked for the coverage they add, with the
    tier's powers and the Pokémon to use them).
  - The week's set (§9): `BOT_TEAMS_PER_TIER` (40, 40, 40, 80), `botTeamSeed(week, n)` and `weekBotTeams(data, week)`
    (each tier's teams all different).
- **`items.ts`** `isBallFor(item, raid)`: the Raid Ball (`effect.raidOnly`) only in a raid's catch. The run's catches,
  Idle's own throws and the simulator never offer it.
- **`gifts.ts`** `GIFT_CURRENT` (`'current'`): a gift that lands in the region being played when it's opened.

## 3. The database (`supabase/migrations/0082_versus_league.sql`)

- **`game_config.versusLeague`** (the switch and the numbers) and `versus_league_cfg()` / `versus_league_open()`.
  Every function acting for a player checks the switch.
- **Tables** (players never touch them: the functions are `security definer`):
  - `versus_league_weeks`, `versus_league_groups`, `versus_league_members` (players and bots, trophies);
  - `versus_league_choices` (the 3 offers, as offered);
  - `versus_league_matches` (each match: the teams, the seed, the trophies before, the outcome, the moves);
  - `versus_league_bots` (400 names and looks) and `versus_league_bot_teams` (the teams: each week's set, and the
    built-in set, §9). The names and the built-in set are written by **`pnpm versus-bots`** (`scripts/versus-bots.ts`,
    from `buildBotTeam`) between the GENERATED BOTS lines, in 0092 now (0082's copy stays as it was).
- **Functions**:
  - `versus_league_choices()`: the 3 offers, topped up.
  - `versus_league_start(slot)`: joins the week's league, records the match as a leave and returns the seed and the
    opponent.
  - `versus_league_finish(match, outcome, left, foe_left, moves)`: the checked result.
  - `versus_league_home(last)`: the week, your trophies, your group ranked, a pending match.
- **The hourly tick** (`versus_league_tick`, pg_cron `versus-league-tick` at :07; the players' calls run it when it's
  over 20 minutes late):
  - closes the weeks that have ended (`versus_league_close_week`: each player's gift message);
  - seats bots on the bot days (`versus_league_seat_bots`);
  - moves the seated bots' trophies along.
  - `versus_league_admin('tick' | 'seat_bots')` is the admin's way to run it now.
- **Reward messages** are written by the server (`feedback_system()`): 0048's feedback triggers accept the server's
  message as they accept the admin's. A player can't set it. The title is `versus_league`; the words are the numbers
  (`@versus_league:{week, rank, trophies, size}`), and the game says them in the player's language.
- **The Raid Ball**'s row in `items`; and `delete_my_data` also deletes the player's league rows.

## 4. What players see

- **Versus** (switch on, main game):
  - The league's **rules card** on the first visit (players who knew Versus read it too), and **INFO** at the bottom.
  - Home's notice says **Versus league**.
  - A header: your trophies, "#2 of 20 in your group" (or "Your first match of the week puts you in a group"), and
    "Ends in 3d 5h".
  - **Opponents**: the 3 offers, each with its look, name and trophies on one line, its team with FIGHT beside it, and
    the matchup ("2 / 3" and a thumb up: how many of theirs your team hits super effectively); one red FIGHT (the one
    your team hits hardest). A match left before its end says so.
  - **My team**: Versus's own team editor: the three slots in fight order (drag one onto another, or tap one then the
    other, to swap them), the list sorted by **Level** (highest first, the default), Pokédex No. or name, each row
    with its level; each species once, its highest level. A slot shows "Lv.72 → 50".
  - **Leaderboard** (PC: beside the opponents): **This week / Last week** (and **Global**, §8), ranks shared on ties,
    the trophies on the name's line and each top-10 place's Raid Balls and Rare Candies drawn under them, beside the
    team.
- **The fight**:
  - The battle screen, **played by you**: dice, rerolls, switches, Mega Evolution, Gigantamax and Z-Moves (your own
    powers).
  - **AUTO-MODE: OFF/ON** in the panel, never the Bag.
  - On AUTO, a move waits at least 0.3 s even with animations off, so a fight always takes the time the server
    expects.
  - The result card: VICTORY! / DEFEAT, the trophies won or lost (+6 🏆), "You have 46 trophies." (or "Below 100
    trophies, a loss costs you nothing."); if the result couldn't be sent, it says the match counts as left.
- **Home's Versus card** shows your trophies and your rank in place of the wins.
- **The trainer card** (Stats) says **Versus best**: the most trophies you ever held, any week (§10). A friend's card
  says theirs.
- **Monday**: the week's gift message, opened like every gift. Its pop-up is the league's own, not the developer's:
  "Your Versus league week", "Your place in your group and your rewards…", then the message signed **Versus league**
  ("You finished #2 of 20 in your group with 152 trophies. Here are your rewards.") and OPEN THE GIFT.
- **The Raid Ball** in raid catches and on a raid's odds; its own picture (`public/items/raid-ball.png`: the Ultra
  Ball's shape, gold with pink bars, so it never reads as a Poké Ball; `tsx scripts/raid-ball-sprite.ts` draws it) and
  a pink and gold trail on its throw.

## 5. The admin

Admin → Config → **Versus league**:

- The switch.
- The numbers: trophies, safe line, group size, players a group, bots a day and the bot days, the opponents' range,
  the fastest win and seconds a move, the bot tiers, ₽ a trophy, the reward bands.
- **Run the hourly tick now** and **Seat bots now**.
- **This week's bot teams** (which set this week's bots take their teams from, when it was made, its teams a tier) and
  **Make this week's bot teams now** (draws them in the admin's page as the hourly job would, and stores them if the
  week has none yet), §9.
- A warning while Gifts aren't on for everyone (the rewards wait on their messages until they are).
- **The week's groups** (migration 0086, `versus_league_admin_board`, the admin's alone): nothing loads until
  **Fetch the groups** (or **Last week**) is pressed, then the league as it is at that moment:
  - the week, when it ends (or that its rewards are sent), and when it was fetched;
  - the totals: groups (and how many the week opened with), members, players, bots, the players who have fought, the
    matches and those still being fought;
  - each group, "5/20 · 2 players · 3 bots · 5 matches", its members ranked as their board: the look, PLAYER or BOT,
    the name, the team and the trophies; under them a player's matches this week (won, lost, left, being fought, the
    last one), a bot's trophies by Sunday night, how often each was fought and when they joined.

  An admin tool, so no switch of its own: the server answers the admin alone, and it only reads.

The admin sees **BOT** on the bots, before their names, in the opponents and the group.

## 6. Setting it up

1. Run the migration in Supabase's SQL editor:
   <https://github.com/Splifingald/pokedice/blob/claude/quirky-maxwell-ilueyw/supabase/migrations/0082_versus_league.sql>
   (after 0081; safe to run again). `supabase/seed.sql` doesn't inline it.
2. Turn on **pg_cron** (Database → Extensions) before running it, for the hourly tick. Without it, the players' own
   calls run the tick when it's over 20 minutes late.
3. Admin → Messages: **Gifts** on for everyone (the rewards are gift messages).
4. Admin → Config → Versus league: **On for admin**, try it (Seat bots now fills your group), then **On for everyone**.
5. For the teams at their own levels (dice and rerolls of their level, Lv.50 HP), run
   <https://github.com/Splifingald/pokedice/blob/claude/new-session-aiwjy4/supabase/migrations/0090_versus_true_levels.sql>
   (after 0039; safe to run again). `supabase/seed.sql` inlines it. Without it the game still runs: teams are saved
   at Lv.50 as before.
6. For **The week's groups**, run
   <https://github.com/Splifingald/pokedice/blob/ccr-1727200f-jjadrr/supabase/migrations/0086_versus_league_admin_board.sql>
   (after 0082; safe to run again). `supabase/seed.sql` doesn't inline it either.

6. For **the global board** (§8), run
   <https://github.com/Splifingald/pokedice/blob/main/supabase/migrations/0091_versus_league_global.sql>
   (after 0090; safe to run again; `supabase/seed.sql` doesn't inline it), then Admin → Config → Switches → **Versus
   global board**: On for admin, look, then On for everyone.

7. For **new bot teams every week** (§9), run
   <https://github.com/Splifingald/pokedice/blob/ccr-1be8c8e6-8dsxnn/supabase/migrations/0092_versus_bot_weeks.sql>
   (after 0082, 0086 and 0091; safe to run again; `supabase/seed.sql` doesn't inline it). The hourly job needs
   `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Netlify's environment variables (there already for the push
   sender, docs/27) and runs on the published site only: on a Deploy Preview, Admin → Config → Versus league → **Make
   this week's bot teams now** does its work.

8. For **the trainer card's Versus best** (§10), run
   <https://github.com/Splifingald/pokedice/blob/version/2_8/supabase/migrations/0097_versus_best_trophies.sql>
   (after 0082 and 0033; safe to run again; `supabase/seed.sql` doesn't inline it). Without it the card's line says
   "—" while the league is on.

After a change to the species, their forms or the gems, the next week's set has them already. To bring the built-in
set along too, run `pnpm versus-bots` and then 0092 again (not 0082: its copies of `versus_league_offer` and
`versus_league_seat_bots` would undo 0092's).

## 7. Tests

- `tests/engine/versus-league.test.ts`: the trophies, the week, the ranks and rewards, the Raid Ball, the bots' teams
  (and the week's set: 40 / 40 / 40 / 80, all different, the same for the same week, new the next), and a match
  stepped through like the auto fight.
- `tests/versus-league-sql.test.ts` (PGlite):
  - the defaults and the trophies match the engine's, and the bots block is what the script writes;
  - offers, a match recorded as a leave and then its result;
  - the too-fast, item and bad-result refusals;
  - the safe line;
  - bots seated, hidden from players and climbing;
  - the week's gift messages;
  - a player can't write one;
  - deleting your data;
  - the admin's groups (0086): refused to players, every member of the week once, bots told apart, ranked as the
    boards, a player's matches adding up;
  - the global board (0091): its own switch (and the league's), every group's players ranked together with ties
    shared, no bots, the banned left out but for themselves, readable signed out.
  - the bots' weekly teams (0092): the job's and the admin's alone, the built-in set until the week has its own, a set
    stored once (whole, on a Monday), the bots seated and offered taking their teams from it, the next weeks using it
    until they have their own, old sets going but for the teams bots were seated with.
- `tests/versus-best-sql.test.ts` (PGlite): 0097's high mark, from the matches for the weeks before it ran, then kept
  by its trigger (a win raises it, a loss leaves it); `versus_league_best` the best of every week, 0 for a player who
  never fought, a friend's and nobody else's, nothing while the league is closed.
- `e2e/versus-league.spec.ts` and `e2e/friends.spec.ts`: the trainer card's Versus best, yours and a friend's, at 360 px.
- `tests/versus-bots-job.test.ts`: the hourly job only asks when the week has its set, else draws it and stores it.
- `tests/versus-true-levels-sql.test.ts` (PGlite): 0090 keeps each Pokémon's own level, Lv.50 or more only.
- `tests/engine/versus.test.ts`: a Versus Pokémon fights at Lv.50 with its own level's dice and rerolls, both sides.
- `tests/versus-league-admin-board.test.ts`: the admin's groups read into players and bots, and the week's totals;
  the global board's rows read.
- `tests/engine/versus-league.test.ts` also: `versusGlobalOn`, its switch only with the league's.
- `e2e/versus-league.spec.ts`: the page (header, opponents, the group and last week, phone and PC; no Global while
  its switch is off), the global board (its line, no rewards, phone and PC), and a match fought on AUTO against a fake
  server.
- `e2e/admin-config.spec.ts`: Admin → Config → Versus league's groups, fetched only when asked (this week and last).
- The kitchen sink's **Versus league** section, and `/kitchen-sink/league-fight` (a real fight, offline).

## 8. The global board (2026-10-29)

The user's ask: "a global leaderboard next to this week and last week. It only counts real players and doesn't give
rewards, for the fame only."

- **What it ranks**: **this week's trophies of every player in every group**, together. The trophies start again every
  Monday, so the global board does too. Ties share a rank, as in a group.
- **Real players only**: the bots are left out (they're group fillers), and so are the players the admin banned from the
  leaderboard (0011's `leaderboard_bans`), but for their own row.
- **No rewards**: the week's gifts are still the groups' alone (§1). The board draws no Raid Balls or Rare Candies, and a
  line over its rows says "Every player of every group, this week. No rewards here: just the glory."
- **Where**: a third option, **Global**, beside This week and Last week (`LeagueBoard`), on PC's side panel (headed
  "Leaderboard" then, not "Your group") and phones' Leaderboard tab. Fetched the first time it's opened. Long, it shows
  its top 100, you and your friends with their real places, no one else (the user's ask of 2026-11-01: `boardWindow`
  with nobody around you, where the leaderboard keeps 10 either side); a gap row says how many are left out between.
- **Its switch**: Admin → Config → Switches → **Versus global board** (`versusLeague.globalAccess`), Off by default, and
  only with the league on (`versusGlobalOn`). The server checks both (`versus_league_global_open`).
- **Its rules**: the line over its rows (a rule explained where it happens, docs/15 §20): no pop-up, and the league's
  INFO stays the league's.
- **The server**: `versus_league_global()` (0091), readable signed out like `versus_league_home`: `{week, endsAt,
  rows}`, the rows as a group's (id, isMe, name, avatar, team, trophies, rank, rich) without `bot`.

## 9. New bot teams every week (2026-10-30)

The user's ask: "I want the seed to change every week and the bots to be automatically regenerated, and double the
amount of bots above 500 trophies."

- **A set a week**: every week's bots take their teams from a set of that week's own, drawn by the engine
  (`weekBotTeams`) on seeds made from the week ("2026-10-26") and each team's number. The same week always gives the
  same set, whoever makes it; the next week gives a new one.
- **80 teams from 500 trophies** (the last tier, wherever Admin puts it), 40 in each other tier. The last tier draws
  from some 30 species, so a set draws a team again when it holds those three already: its 80 teams are 80 different
  ones. Below 500 trophies, a week's teams are all new; from 500, most come back from one week to the next, since that
  tier has few teams to give (its share of the strength ranking is in `TIER_POOL`).
- **Who makes it**: `netlify/functions/versus-bots.mts`, a Netlify scheduled function at :13 every hour. It asks the
  database first (`versus_league_bot_set`: one request), and only when the week has no set yet and the league isn't
  Off does it read the live content, draw the 200 teams (about 2 s) and store them (`versus_league_put_bot_teams`).
  So a week has its set within the hour of Monday 00:00 UTC, and a missed run is made up an hour later. The admin's
  **Make this week's bot teams now** does the same from the admin's page.
- **Until then**: a week without its own set takes the latest one made before it (last week's), else the **built-in
  set** (0082's 160 teams and 40 more for the last tier, written in 0092 by `pnpm versus-bots`). Nothing breaks while
  the job isn't set up.
- **A seated bot keeps its team**: a week's set is stored once and never replaced; sets over 4 weeks older than the one
  stored go, but for the teams bots were seated with (their week's board still shows them).
- **The database** (0092): `versus_league_bot_teams` gets `week` (null: the built-in set) and `made_at`;
  `versus_league_team_set(week)` and `versus_league_bot_team(week, tier)` pick a team, and `versus_league_offer` and
  `versus_league_seat_bots` use them (0082's otherwise). `versus_league_bot_set` and `versus_league_put_bot_teams` are
  the job's (the service role) and the admin's alone.
- No switch of its own: it changes where the league's bots get their teams, under the league's switch.

## 10. Versus best on the trainer card (2026-10-31)

The user's ask: "Change the player card stats to show best ever score in versus (trophies)." The card's Versus line
said the old board's wins ("0 won · 3 held"), which the league no longer counts.

- **What it says**: with the league on, the line is **Versus best** (beside Best level, the same way) and the most
  trophies you ever held, in any week, this one included: the number and the league's trophy (`TrophyCount`, in the
  card's own font: `inherit`), "152 trophies" to a screen reader. It's the high mark, not a week's final total, so it
  never goes down: a week where you reached 150 and finished on 120 counts 150. "—" until the server answers.
- **A friend's card** says theirs the same way (a friend who never had a Versus team: "—").
- **Without the league** (its switch Off for you, or Extreme, which keeps Versus as it was) the line is Versus and the
  old board's wins and holds, as before. Versus not open yet: Locked.
- **The database** (`0097_versus_best_trophies.sql`):
  - `versus_league_members.best`, a week's high mark, raised by a trigger whenever the trophies go past it, whatever
    moved them (a match's start and its result, the bots' climb). None of 0082's functions is written again.
  - The weeks fought before it ran get theirs from their matches: the trophies before each one, and after each one
    finished.
  - `versus_league_best(p_user)`: the caller's best across every week (0 if they never fought), or a friend's; null
    signed out, for someone who isn't a friend, or while the league is closed to the caller.
- No switch of its own: it's how the card reads the league, under the league's switch (as §9).
