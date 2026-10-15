# The Link Cable, the Bait and the General upgrades

Status: **built** (2026-10-12) on `claude/pokemon-capture-upgrades-2wsdu4`; the migration is **0049** (0048 is the message gifts'). Everything ships
**Off**: three switches in Admin → Config → "General upgrades & catch items" (docs/15 §20).

Five things, from one request:

| What | In short |
|---|---|
| **Link Cable** (item) | Used on a Pokémon that only evolves by trade: it evolves, no trade needed. ₽1,000, **not in the Mart** by default. |
| **Bait** (item) | When a ball's throw falls short, the catch asks whether to throw one: its own die (1, 1, 1, 2, 2, 3) adds to the total. ₽150, in every region's Mart from the **7th badge**. |
| **Capture Luck** (General upgrade) | A wild Pokémon that broke free may stay for **one** more throw: 10 levels, 10 % to 100 %. Never a legendary, never a raid. |
| **Offline earnings** (General upgrade) | ₽ for each hour the game is closed, up to 24 h an absence, on the server's clock: 10 levels, ₽2 to ₽20 an hour (level 0: none). |
| **I am just rich** (General upgrade) | ₽99,999, one level, for fun: the trainer's name shines gold wherever other players see it. |

## 1. The rules (all in `src/engine`)

### 1.1 The Link Cable — `engine/progression.ts` `linkEvolution`, `engine/run.ts` `applyFieldItem`

- Effect kind `link`. "Evolves by trade" is the admin's list in `game_config.trade.evolveOnTrade` (Kadabra, Machoke,
  Graveler and Alola's, Haunter, Boldore, Gurdurr, Karrablast, Shelmet, Phantump, Pumpkaboo): the same pairs that
  evolve when traded, and never by level. It works whether or not Trades are switched on.
- Gated like a stone on the region being played (`evolutionGate`). Used from a Pokémon's sheet → Use an item, with
  the evolution scene (the cable floats down like a stone). One is used up.
- Its price is what the Mart would charge if the admin puts it on the shelf (`inShop`); until then it comes from loot,
  the wheel, a live event's or a world's shop — wherever the admin lists it.
- Its picture is the game's own (`public/items/link-cable.png`, 30 × 30, PokeAPI's item style; PokeAPI has none), in
  the item atlas like the others (`pnpm item-sprites` reads `/…` paths from `public/`).

### 1.2 The Bait — `engine/catching.ts`

- Effect kind `bait` with its `faces` (`[1, 1, 1, 2, 2, 3]` unless the admin edits the item).
- **When it's offered** (`baitFor`): the throw fell short, no Bait was thrown yet in that throw, the bag holds one
  (switched on), and it could still make it (`total + highest face ≥ need`) — a hopeless Bait isn't offered. The
  likeliest one if the admin adds several.
- **Throwing it** (`rollBait`): one face is added to the throw's total; the catch is decided again on that total. One
  Bait per throw.
- **Its odds** (`baitChance`): the share of faces that reach the need, shown on the prompt.
- Every capture: wild Pokémon, legendaries, raids. (Only Capture Luck is kept out of raids and legendaries.)
- The Mart lists it with the balls ("Poké Balls & Bait"); it is never picked from the bag.

### 1.3 Capture Luck — `engine/general.ts` `captureLuck`

- Once a throw has finally missed (after the Bait, if any): the luck's chance that the Pokémon **stays**, broken free
  but on its platform, and the player throws again (any ball, or none).
- **Once per encounter** (`CatchState.retried`): the second throw's miss is a miss. At 100 % every wild catch has
  exactly two throws.
- Wild Pokémon only: `kind === 'wild'` (a legendary is `boss`; raids have their own catch, without it).
- **Never inside a small world**: the General upgrades are the main game's; a world plays by its own rules (docs/21).

### 1.4 Offline earnings — `engine/general.ts`, `store/general.ts`

- The page going hidden or closed starts an absence at the **server's time** (`trustedNow`, the clock anchored on the
  last server sync): `general.awayFrom`. Unknown time: the absence doesn't start (nothing is ever paid on the
  device's clock). An absence already open keeps its start.
- Coming back (or loading): the real time is read again first (a phone that slept may have stopped the page's own
  clock), then `collectOffline` pays `₽/hour × hours`, the hours capped at `offlineMaxHours` (24), into the live
  region's wallet, in whole ₽: a ₽ never has cents, not even in the save. The time spent towards a ₽ not reached yet
  (`general.carryMs`) counts in the next absence, so short absences add up (20 minutes at ₽2/h pay nothing now; 20
  more pay ₽1 and leave 10 minutes waiting).
- **Inside a small world** nothing is paid (its ₽ is the world's): no absence starts there, and one found open there (a
  save from before 2026-10-15) closes unpaid, so the time spent in a world never pays later in a region.
- The level is read when the player comes back: buying a level while away pays the new rate for that absence (it
  can only be bought while playing, so this never happens in practice).
- An hour or more away: "While you were away" (the coin and +₽, the rate and the cap), between fights. Less: a toast.

### 1.5 I am just rich

- `general.rich` in the save. The trainer's own card (the drawer) shows it; other players see it through the server
  (§3). Nothing else changes.

### 1.6 Buying the General upgrades — `buyGeneral`

- With the ₽ of the region being played; the levels are the save's (`SaveData.general`), so they hold in every region.
  Each save buys its own: an Extreme save's are its own.
- Not inside a small world: its Upgrades page explains the dice instead (docs/21).
- Prices (game_config `general`, Admin → Config): a whole region's combos and dice cost about ₽37,000, so Capture
  Luck and the golden name are long goals; offline earnings are cheap enough to pay themselves back in days (the
  user's call, 2026-10-13: an eighth of the first prices).

  | Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | All |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | Capture Luck | 10 % · ₽1,000 | 20 % · ₽1,800 | 30 % · ₽2,800 | 40 % · ₽4,000 | 50 % · ₽5,500 | 60 % · ₽7,200 | 70 % · ₽9,200 | 80 % · ₽11,500 | 90 % · ₽14,000 | 100 % · ₽17,000 | ₽74,000 |
  | Offline | ₽2/h · ₽100 | ₽4/h · ₽175 | ₽6/h · ₽263 | ₽8/h · ₽375 | ₽10/h · ₽500 | ₽12/h · ₽650 | ₽14/h · ₽825 | ₽16/h · ₽1,025 | ₽18/h · ₽1,250 | ₽20/h · ₽1,500 | ₽6,663 |
  | I am just rich | ₽99,999 | | | | | | | | | | |

## 2. The switches (docs/15 §20)

- `game_config.general.access`: the General tab, its pop-up, and every effect (Capture Luck, offline earnings, the
  golden name). Off keeps the levels bought.
- `game_config.itemSwitches`: `{ "link-cable": …, "bait": … }`. An item switched off is not sold, not found in loot,
  not usable from the bag and never offered at the catch (`itemOn`); bags keep theirs. Items without an entry are always
  on, so the map can switch any future item.
- **Rules**: the General tab has its rules pop-up (once, from the first badge, queued behind the other one-time
  pop-ups; opening the tab counts as seen) and INFO at the bottom of the tab. The two items explain themselves where
  they're met: their descriptions in the Mart and the bag, the Bait's die and odds on the catch prompt.

## 3. The server — `supabase/migrations/0049_general_upgrades.sql`

- The two config rows (insert-if-missing: seeding never writes them) and the two item rows.
- `general_open()`: the switch for the caller (the admin's JWT for "On for admin").
- `player_cards.rich`, written by `player_card_write` from the save (only a JSON `true`).
- `player_rich(user)`: the golden name as the caller may see it (any of the user's cards, and the switch on for the
  caller). A last `rich` column on `leaderboard`, `versus_board`, `friend_list`, `friend_profile`, `friend_day_cares`,
  `raid_friend_teams`, `raid_progress_friend_teams`; `rich` in `trade_row` and `friend_status`'s new friends;
  `withRich` in `trade_mine` and `trade_take`.
- 0039 and 0045 drop those seven functions before making them, so a full `seed.sql` re-run over 0049 works
  (`tests/general-sql.test.ts`, `tests/extreme-realm-sql.test.ts`).
- A card takes `rich` on the player's next upload; PostgREST may need `notify pgrst, 'reload schema'` after the
  return types change.

## 4. The screens

- **Upgrades → General** (third tab, after Combos and Dice Types, only while switched on): one card each, the same
  `UpCard` as combos and dice — its pips, the level, what it does now → at the next level, the price button. "I am
  just rich" shows the player's own name, golden. INFO at the bottom. The tab bar's dot counts what's affordable here
  too.
- **The catch** (`CatchPanel`, the catch timeline): docs/15 §14, "The catch happens on the stage".
- **Golden names** (`TrainerName`, `NameIn`): the leaderboard and its Hall of Fame, the Versus board and opponents,
  the friend list, a friend's card and preview, raid friends (setup and the ally plate), trade listings (row and sheet),
  the trade scene and the Done list, the Day Care's visitors and the friend picker, and the player's own trainer card.
  Inside a translated sentence ("Misty's") only the name is golden.
