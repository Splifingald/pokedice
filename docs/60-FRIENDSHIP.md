# Friendship streaks and the Friend Market

The user's ask (2026-10-31): *"Each player has a friendship streak with their friends; any interaction counts in the
streak: participation in a raid (one way or the other), trading a Pokémon, getting an Egg with the friend's Pokémon at
the Day Care. Every day a player can get currency to spend in the friend market, a weekly market where stuff can only
be bought with this currency: find a good currency from the main game that fits the idea. Day 1 to 3: +3 per day, day
4 to 7: +4, day 8 to 14: +5, day 15 to 30: +6, day 31+: +7, with a max of 50 obtainable in total per day. The shop
contains Rare Candies, Talent Candies, one rotating shiny Pokémon that fits the theme, and a Friend Ball ("Copain
Ball") that is like an Ultra Ball with an effect we will define later. Build the feature as you see fit, don't ask
questions, take decisions."*

**Status: built** on `version/2_8` (branch `ccr-18cceff8-0y80b6`), behind its switch, **Off** (docs/15 §20). The migration is **0107**.

## 1. Decisions

| Question | Answer |
|---|---|
| The currency | **Heart Scales** (the user's call, 2026-11-01, over the first pick, Festival Coins): the main series' item. Its icon is the games' own Gen IV item sprite redrawn as a pixel map in code (`heartScale`, no request). FR *Écailles Cœur*, ES *Escamas Corazón*, DE *Herzschuppen*, IT *Squame Cuore*, JA ハートのウロコ, KO 하트비늘, ZH 心之鳞片 |
| What a streak is | **One per pair of friends**, shared: both see the same days and both are paid. A UTC day with at least one interaction between the two keeps it; a whole UTC day without one ends it, and the next interaction starts again at day 1. The best streak is kept |
| What counts | **A raid** fought beside a friend's team, won or lost, either way round (you raid with their team, or they raid with yours: it's the same pair). **A trade** between two friends (any listing, public or friends-only, taken by a friend). **An Egg** the Day Care made with a friend's visiting Pokémon. Once a day per pair: the first one of the day moves the streak and pays; the rest that day change nothing |
| What a day pays | By the streak's day: **days 1–3: 3, 4–7: 4, 8–14: 5, 15–30: 6, 31+: 7**, to each of the two. A player's Heart Scales are capped at **50 a UTC day** across all their friends (the day that would go over pays what's left, then 0) |
| The levels | The five brackets are named (the ask said "4 levels" and listed five; the five are kept as listed): **Friends, Good friends, Great friends, Ultra friends, Best friends** |
| When Heart Scales arrive | At once, on the server, the moment the interaction is recorded. A toast says "Friendship streak! +4 Heart Scales" the next time the game asks (game load, return to the tab, the Friends and market pages) |
| Where Heart Scales live | **On the server, per account** (`friendship_wallets`), not in the save: the server pays and the server charges, so a hand-edited save can't make Heart Scales. They are the main game's: Extreme mode has no market |
| The market | **`/market`**, from the Friends page's Friendship card. A **weekly** shelf, turning over every **Monday 00:00 UTC**: the **shiny of the week** (one, ₽-free: 150 Heart Scales, Lv.15), **Friend Ball** 5 each (20 a week), **Rare Candy** 15 (10 a week), **Talent Candy** 60 (2 a week). Limits reset with the week; Heart Scales don't |
| The shiny of the week | Turns through **Pokémon that evolve by friendship**, one a week in order: Togepi, Eevee, Pichu, Cleffa, Igglybuff, Riolu, Happiny, Munchlax, Buneary, Azurill, Chingling, Woobat (12 weeks, then again). The admin can change the list, its price and level |
| The Friend Ball | A new item (`friend-ball`), drawn as the games' green Friend Ball, sold only at the Friend Market (`inShop` false). **+3 on the catch die**, as an Ultra Ball, **and more chances to find the Pokémon's hidden talent on its catch** by the player's best streak (the user's call, 2026-11-01): **×1** on days 0–3, **×2** on 4–7, **×3** on 8–14, **×4** on 15–30, **×5** from 31 (§1b) |
| Buying | The server prices, limits and charges (`friend_market_buy`), then hands back the purchase as gifts; the game puts them away and plays the gifts' own opening ("From the Friend Market!"). ×1 / ×5 / ×10 within what's left. Items go to the Bag of the region being played (`placeGifts`) |
| Where the shiny goes | **Its species' region of origin** (Togepi to Johto, Riolu to Sinnoh: `speciesHome`), the user's call of 2026-11-01. Like a Pokémon sent on from another region or home from a small world, it waits there on the regions' waiting list (`events.worldHome`, marked `market`), **locked until one of the player's Pokémon there reaches its level** — or until that region is started — then arrives by the usual rule (`releaseWorldHome`). With one there at its level already, it arrives at once. The market's card says where it goes and, when it would wait, that it waits locked; the opening says "It waits in your Johto Box, locked until one of your Pokémon there reaches Lv.15."; its sheet's lock says "From the Friend Market" |
| A tab closed mid-purchase | The purchase stays **unapplied** on the server until the game says it has it; the status hands it back and the game puts it away (between fights, once the cloud sync has settled). The save remembers the last purchase ids it put away, so nothing is ever applied twice |
| The Egg | The Day Care runs in the game, so the server can't see an Egg being made. The Egg now keeps its friend parent's **user id** (`EggParent.ownerId`); the engine queues the friend in the save (`friendship.eggs`) and the game tells the server (`friendship_egg`), which checks they are friends and the friend has a Pokémon at their Day Care |
| The raid | Raids with friends are asynchronous (a raider fights beside the teams friends left). When a raid fight ends, won or lost, the game tells the server which friends' teams were there (`friendship_raid`); the server checks each is a friend whose team was on that raid |
| The trade | Counted by the server alone: a trigger on `trade_listings` when a listing is taken between two friends |
| Removing a friend | Ends the streak (the row goes). Coins stay |
| Delete my data | The main save going takes the wallet and the purchases |
| Switch | `friendship.access`, Off / On for admin / On for everyone, **Off** by default; **the server checks it** in every function (nothing is counted, paid or sold while it's off for the caller). On for admin: only the admin's own interactions count and only the admin sees it |
| Small worlds, Extreme | The card and streaks show inside a small world; the market waits ("step out of the small world") since nothing from outside reaches it. Extreme mode has neither (a race of its own) |

## 1b. The Friend Ball's hidden talents

- **Its line**, wherever the ball is described (the market, the Mart's and the Bag's detail, an item's card): "More
  chances to discover hidden talents on catch depending on your best streak, current: ×2." The ×n is the player's now.
- **Which streak**: the longest one **still alive** (kept today or waiting for today) across every friend
  (`bestLiveStreak`): keeping a streak going is what the ball rewards. Signed out, switched off or no streak: ×1.
- **The odds**: a wild Pokémon carries its talent at the wild odds (5 % by default, `hiddenTalents.wildChance`), rolled
  when it's met. Caught in a Friend Ball, one that didn't gets a second draw, so the whole chance becomes the wild odds ×
  the boost (×5: 25 %), `friendBallTalent`. One that carried it already keeps it; a starter line never has one; nothing
  happens while hidden talents are off. The talent shows on the result as any talent caught does.
- **The catch panel**: the Friend Ball's button wears a gold tag (the unknown talent's gem and ×n) while the boost can
  still find this Pokémon's talent, and is never "not needed" then (a weaker ball's sure catch doesn't find a talent);
  screen readers hear "hidden talent chance ×n".
- **Where**: the catches in an area (wild and bosses). A raid's catch rolls its talent its own way and isn't boosted.
- **Admin**: Config → Friendship, *Friend Ball ×* per tier (`friendship.ballBoost`, 1–20).

## 1c. Heart Scales as a message gift

The user's ask (2026-11-01): *"Make sure the heart scale item is an item I can give players through messages and
gifts."* Heart Scales aren't a Bag item: they live in the server's wallet (`friendship_wallets`), so a message gift
of them is paid by the server.

- **Where**: Admin → Messages (an answer) and a player's profile → Messages (a message the admin starts): the gift
  editor's **Heart Scales** row, 1–9,999 a gift (`{ kind: 'heartScales', amount, region: 'latest' }`).
- **Paid**: by `feedback_claim_gifts` (migration **0108**), the moment the player's game opens the message's gifts,
  in the same statement that marks them opened, so never twice. Only the balance moves: not today's earnings (the
  daily cap stays the streaks') nor the total earned.
- **To an account only**: a guest has no wallet, so the server refuses Heart Scales on a message to a device
  (`feedback_scales_need_account`) and the editor's row is shut there.
- **Friendship off**: the editor's row is shut while Friendship is Off; On for admin, it says players won't see them
  yet. A player for whom Friendship is off doesn't see them in the opening (they wait in the wallet).
- **Not offered** for invite rewards, welcome-back gifts or calendars: those gifts are put in the save by the game,
  and nothing there pays a wallet.

**Setting it up**: run in Supabase → SQL Editor, after 0107:
https://github.com/Splifingald/pokedice/blob/claude/practical-euler-vx5wdk/supabase/migrations/0108_heart_scale_gifts.sql
It isn't inlined in `supabase/seed.sql` (safe to run again). The Gifts switch (Admin → Messages) must be on for the
player, as for any gift.

## 2. What players see

- **No Home notice, no pop-up** (the user's call, 2026-11-01: "players should see the feature when they get to the
  friends menu"): it appears on the Friends page, its rules card at the top the first time.
- **The Friends page**: the rules card at the top the first time (GOT IT, `friendship.rulesSeen`); then the
  **Friendship card** (rose, under the invite rewards): the Heart Scales, today's gauge ("Earned today 9/50"), "1 of 3 streaks
  kept today", the **streaks to keep today** (the longest first, at most three, each with what today would pay: "+7
  today"), the one-line how-to, **FRIEND MARKET** and INFO.
- **A friend's row**: a **streak badge** before the chevron: a heart and the days; kept today: rose with the check;
  waiting (keep it today): gold with a red "!". Lost: no badge. The state is said in words for screen readers.
- **A friend's card**: the streak's block: "12-day streak", its level ("Great friends"), the five tiers as a ladder (the
  one reached in gold), and a line: "Keep it today with Misty: +5." / "Kept today. 3 more days to +6 a day." / "Start one
  with Leaf: +3 on day 1." with the best streak when it was longer.
- **The market** (`/market`): back to Friends, the Heart Scales and "New shelf in 4d 6h", the rules card the first time,
  **the shiny of the week** (gold card, its shiny sprite, "✦ Shiny · Lv.15 · goes to Johto", with the lock's line when it would wait there, "1 of 1 left this week",
  BUY with its price), **this week's shelf** (the Friend Ball, Rare Candy and Talent Candy: picture, name, what it
  does, "8 of 10 left this week", ×1 / ×5 / ×10 with their totals), a line on where Heart Scales come from, INFO. Short of
  Heart Scales, a button says "Need 110 more Heart Scales"; sold out, "Sold out this week". Signed out: CONNECT. Extreme mode and a
  small world: a line saying why.

## 3. Code

- **Migration** `supabase/migrations/0107_friendship.sql`: `friendship_cfg()` / `friendship_open()`, the tables
  (`friendship_streaks`, `friendship_wallets`, `friendship_log`, `friend_market_buys`), `friendship_touch()` (the one
  place a streak moves and both are paid, `friendship_pay()` within the cap), the trade trigger, `friendship_raid()`,
  `friendship_egg()`, `friendship_status()`, `friend_market_buy()`, `friend_market_applied()`, the clean-up triggers,
  the Friend Ball's item row.
- **Engine** `src/engine/friendship.ts` (pure): `friendshipOn`, `friendshipTiers`, `friendshipCap`, `streakTier`,
  `streakCoins`, `streakState`, `nextStreakDay`, `marketWeek`, `marketWeekEnds`, `marketShiny`, `marketRows`,
  `marketWhy`, `marketQtys`, `applyMarketBuys`, `friendshipWaits`, `friendshipRulesDue` / `markFriendshipRulesSeen`,
  `queueEggReport` / `clearEggReports`, the Friend Ball's `bestLiveStreak`, `friendBallBoost`, `friendBallTalent`,
  `friendBallHelps`, `isTalentBall`; `breeding.ts` queues an Egg's friend.
- **Types**: `GameConfig.friendship` (`FriendshipConfig`), `SaveData.friendship` (`FriendshipSave`, and the save
  schema), `EggParent.ownerId`.
- **Client**: `src/lib/friendship.ts` (the RPCs), `src/store/friendship.ts` (`loadFriendship`, `buyMarket`,
  `putAwayWaiting`, `sendEggReports`, `raidWithFriends`); `FriendsService` loads the status and tells Eggs; `sync.ts`
  on return to the tab; `raidBattle.ts` at a raid fight's end.
- **UI**: `src/components/friends/Friendship.tsx` (`CoinPlate`, `StreakBadge`, `StreakLadder`, `CapGauge`,
  `FriendshipCard`, `FriendStreakBlock`, `MarketShinyCard`, `MarketItemCard`, `MarketHead`, the rules and INFO),
  `src/screens/FriendMarket.tsx`, the Friends page and the friend's card; every state on `/kitchen-sink`
  (`FriendshipBits`). The Heart Scale icon `heartScale`, the Friend Ball's look (`scenes.ts`, `TrainerArt.tsx`).
- **Admin**: Config → Switches, *Friendship & Friend Market*; Config → *Friendship*: each tier's first day and Heart Scales,
  the daily cap, each item's price and weekly limit, the shiny's price, level and pool (with this week's pick).
- **Strings**: `ui.fship.*`, `ui.market.*`, `ui.rules.fship.*`, `item.friend-ball`, ten languages.
- **Tests**: `tests/friendship-sql.test.ts` (the migration in PGlite), `tests/engine/friendship.test.ts`,
  `e2e/friendship.spec.ts`; Heart Scales as a message gift (§1c): `tests/heart-scale-gifts-sql.test.ts`,
  `tests/engine/gifts.test.ts`.

## 4. Setting it up

1. Run in Supabase → SQL Editor (the switch's row, Off, the tables and functions, the Friend Ball):
   https://github.com/Splifingald/pokedice/blob/ccr-18cceff8-0y80b6/supabase/migrations/0107_friendship.sql
   It isn't inlined in `supabase/seed.sql`: run the file itself (it's safe to run again).
2. Admin → Config → **Friendship**: check the numbers (the defaults are the ones above).
3. Admin → Config → Switches → **Friendship & Friend Market**: *On for admin*, Save & Publish, and try it signed in as
   admin with a friend's account (a trade between the two, a raid with their team, an Egg with their Pokémon); then *On
   for everyone*.
4. Heart Scales as a message gift (§1c): run, after 0107,
   https://github.com/Splifingald/pokedice/blob/claude/practical-euler-vx5wdk/supabase/migrations/0108_heart_scale_gifts.sql
   (not inlined in `supabase/seed.sql`; safe to run again).

## 5. Balance

At the cap (50 a day), a week is 350 Heart Scales; the whole shelf costs 150 + 100 + 150 + 120 = 520, so even a player with
many best friends chooses. One best friend kept every day (7 a day, 49 a week) buys the shiny of the week about every
three weeks, or a Rare Candy every two days. A new streak with two friends (3 + 3 a day) makes 42 a week: a Talent
Candy in a week and a half.
