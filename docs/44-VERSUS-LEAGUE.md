# 44 · The weekly Versus league

The user's rework of Versus, October 2026: a league that starts again every Monday. Players fight their matches
themselves, win trophies, climb a group of 20 and are rewarded at the end of the week. The opponents are always on
auto. Bots fill the empty places and the opponents' list, and only the admin can tell them from players. A new item,
the **Raid Ball**, is one of the rewards. All of it sits behind its own admin switch (docs/15 §20), Off by default:
while it's Off, Versus is what it was (every team, the attack and defense boards, fights on auto).

**Status (2026-10-27): built** on `claude/quirky-maxwell-ilueyw` (from `version/2_4`), behind its switch, Off.
Migration `0082_versus_league.sql`.

## 1. Decisions (the user's answers)

| Question | Answer |
|---|---|
| Week | **Monday 00:00 to Sunday 24:00, UTC**. Everyone starts again from 0 |
| Gameplay | **The player fights** (active by default), **AUTO** if they like. The opponent always plays on auto |
| Items | **None at all**: no Bag in a league fight, and the server refuses a result with an item used |
| Trophies | A win: **+3 / +6 / +10** with 1 / 2 / 3 of your Pokémon left. A loss: **−3 / −6 / −10** by the opponent's Pokémon left. **Leaving** a fight (closing it, losing the connection, the flag) is the full **−10** |
| Safe line | **Below 100 trophies a loss costs nothing.** There's no floor at 100: 104 can fall to 94, and is safe again from there |
| Defenders | **Only the player who starts the match** wins or loses trophies. A team picked as an opponent never loses anything while its owner is away |
| Match limit | **None** |
| Opponents | **3 choices**, their **teams and trophies** shown. **Fixed until one is fought**. From **any player** with a Versus team whose trophies this week are within **±15 %** of yours (**±30** at least). Bots fill the slots nobody fits |
| Groups | **20 players**. The **number of groups** is set on the week's first match: last week's players × (last Sunday's daily players ÷ the Sunday before) ÷ 16. With no league last week, everyone with a Versus team ÷ 16. Each player's first match puts them in the **emptiest open group**, so early and late players mix. Friends get no priority. When every group is full, a new one opens |
| Bots in groups | **Yes**: on **Wednesday, Thursday and Friday**, up to **5 bots a day** take the empty places of each group. They climb through the week toward a **believable place** among the group's players (a player's trophies, projected to Sunday, ×0.6 to ×1.25), arriving by Sunday 22:00. A bot can finish first |
| Bots' strength | **Tiers by trophies**: 0–99 solid picks and no powers; 100–249 strong picks and one power; 250–499 better picks and two powers; 500+ the best (legendaries too) and all three. Good type coverage at every tier. The thresholds are in Admin |
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
  - `versus_league_bots` (400 names and looks) and `versus_league_bot_teams` (40 teams a tier). Both are written by
    **`pnpm versus-bots`** (`scripts/versus-bots.ts`, from `buildBotTeam`) between the file's GENERATED BOTS lines.
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
  - **My team**: Versus's own team editor.
  - **Leaderboard** (PC: beside the opponents): **This week / Last week**, ranks shared on ties, the trophies on the
    name's line and each top-10 place's Raid Balls and Rare Candies drawn under them, beside the team.
- **The fight**:
  - The battle screen, **played by you**: dice, rerolls, switches, Mega Evolution, Gigantamax and Z-Moves (your own
    powers).
  - **AUTO-MODE: OFF/ON** in the panel, never the Bag.
  - On AUTO, a move waits at least 0.3 s even with animations off, so a fight always takes the time the server
    expects.
  - The result card: VICTORY! / DEFEAT, the trophies won or lost (+6 🏆), "You have 46 trophies." (or "Below 100
    trophies, a loss costs you nothing."); if the result couldn't be sent, it says the match counts as left.
- **Home's Versus card** shows your trophies and your rank in place of the wins.
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
- A warning while Gifts aren't on for everyone (the rewards wait on their messages until they are).

The admin sees **BOT** on the bots, before their names, in the opponents and the group.

## 6. Setting it up

1. Run the migration in Supabase's SQL editor:
   <https://github.com/Splifingald/pokedice/blob/claude/quirky-maxwell-ilueyw/supabase/migrations/0082_versus_league.sql>
   (after 0081; safe to run again). `supabase/seed.sql` doesn't inline it.
2. Turn on **pg_cron** (Database → Extensions) before running it, for the hourly tick. Without it, the players' own
   calls run the tick when it's over 20 minutes late.
3. Admin → Messages: **Gifts** on for everyone (the rewards are gift messages).
4. Admin → Config → Versus league: **On for admin**, try it (Seat bots now fills your group), then **On for everyone**.

After a change to the species, their forms or the gems, run `pnpm versus-bots` and the migration again.

## 7. Tests

- `tests/engine/versus-league.test.ts`: the trophies, the week, the ranks and rewards, the Raid Ball, the bots' teams,
  and a match stepped through like the auto fight.
- `tests/versus-league-sql.test.ts` (PGlite):
  - the defaults and the trophies match the engine's, and the bots block is what the script writes;
  - offers, a match recorded as a leave and then its result;
  - the too-fast, item and bad-result refusals;
  - the safe line;
  - bots seated, hidden from players and climbing;
  - the week's gift messages;
  - a player can't write one;
  - deleting your data.
- `e2e/versus-league.spec.ts`: the page (header, opponents, the group and last week, phone and PC), and a match
  fought on AUTO against a fake server.
- The kitchen sink's **Versus league** section, and `/kitchen-sink/league-fight` (a real fight, offline).
