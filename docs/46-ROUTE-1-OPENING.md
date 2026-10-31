# Route 1's set opening

A new player's first two rounds on Route 1 come in a **set order**, card by card, instead of a shuffled deck, so the
first steps of the game are the same for everyone: two easy wild Pokémon, Poké Balls to catch with, a Pokémon Center, a
first trainer that pays. The rounds after them are shuffled as everywhere (the user's request, 2026-10-28). It sits
behind its own admin switch (docs/15 §20), Off by default.

## 1. The rounds

Round 1 (6 cards):

1. Rattata Lv 2
2. Pidgey Lv 2
3. A find: 2 Poké Balls
4. A Pokémon Center
5. Rattata Lv 3
6. **Youngster Joey** (Rattata Lv 4): **₽10** for the win

Round 2 (5 cards), after the usual round Center (every round opens with one, as everywhere):

1. Pidgey Lv 4
2. Rattata Lv 3
3. A find: a Potion
4. **Oddish** Lv 4
5. Pidgey Lv 5

Route 1 needs two rounds, so the area clears at the end of the second. From then on (replays) its deck is shuffled
from its own weights and pool, where Oddish is now a rare wild Pokémon (weight 3 beside Pidgey's and Rattata's 50:
about 1 in 35, Lv 3–5).

## 2. Decisions

- **The game starts with a fight**: every round opens with a Pokémon Center, outside its deck, but the opening's first
  round starts straight with its Rattata (`opensWithoutCenter`; the round gauge leaves that step out too). Its second
  round has the usual one.
- **The round is the one after the rounds done** (`openingRoundDue`): a wipe drops the round in progress (as
  everywhere), so the same round is dealt again from its first card. Once the area is cleared, or past the set rounds,
  decks are shuffled.
- **The deck is the set cards' kinds** (`openingDeck`), so the round gauge, the Center rules (never two in a row) and
  Extreme mode (no Centers) work as with any deck. Which set card a draw is comes from the cards already turned over
  this round, Centers left out (`openingCardAt`): the deal only ever moves a Center, so the others keep their order.
  `AreaProgress.opening` notes that the deck in play is a set round.
- **A wild one is still a wild one**: its level is the set one, the wild shiny odds still roll, it's caught as usual.
- **Youngster Joey** is a trainer row (`251c41f0-…`, the admin can edit him in Admin → Trainers) in no area's trainer
  pool: only the opening deals him. His **prize** is the opening's (`OpeningCard.prize`), paid whole with his last
  K.O. in place of the usual Σ levels × goldMultiplier (`trainerPrize`, `VictoryInput.prize`); Cash Flow still adds
  its share.
- **The extra Center**: Route 1 is an easy area, which sends a Center after any K.O. During the set opening it comes
  only when the **starter** is K.O. (`starterFainted`: the Pokémon held longest, on the team at 0 HP), not for a
  Pokémon caught on the way (the user's rule, 2026-10-28). After it, any K.O. sends one again.
- **Switched off mid-round**: the deck's cards are dealt as any deck's (a trainer card on Route 1, which has no
  trainers, is passed over).
- **No rules pop-up, no INFO**: it adds nothing to do or learn; it only sets the order of what Route 1 already deals
  (docs/15 §20).

## 3. The engine

- `src/engine/opening.ts`: `openingOn`, `openingRound`, `openingRoundDue`, `openingDeck`, `openingCardAt`,
  `trainerPrize`, `starterFainted`.
- `src/engine/encounters.ts`: `dealRound` (a set round or a shuffled deck, for the round Center's deal and the
  deck's), `openingEncounter`, `nextRoundSize` (the gauge before a round is dealt); `EncounterRoll.opening`, recorded
  by `recordDraws`; `dueCenter` reads `EncounterContext.starterFainted` during the opening.
- `game_config.openingRounds`: `{ access, areaId, rounds }`. The rounds are the game's own (`DEFAULT_CONFIG`); the
  database row holds only the switch, so the admin's Config box writes only that.

## 4. Setting it up

1. Run [`supabase/migrations/0083_route_1_opening.sql`](https://github.com/Splifingald/pokedice/blob/version/2_4/supabase/migrations/0083_route_1_opening.sql)
   in the Supabase SQL editor: Youngster Joey, Oddish on Route 1, the switch's row (Off) and configVersion + 1.
   `supabase/seed.sql` carries it too (inlined).
2. Admin → Config → **Route 1 opening**: On for admin to try it on a fresh save, then On for everyone.

## 5. The dice tutorial

Beating Youngster Joey ends the opening's first round with **₽10** in the purse: the wild K.O.s pay nothing and a new
save starts at ₽0, so it is exactly the price of the starter's type die at Lv.2 (Grass, Fire or Water: ₽10 each in the
bundled tables). Right then, a **pointing hand** walks the player to it, step by step, **once** (the user's request,
2026-10-28). It follows the set opening's switch: it is the opening's last step, not a feature of its own.

1. **Home** ("You won ₽10! Spend it to make Charmander stronger. First, head Home."): right after Joey, the round's
   Pokémon Center is on screen, so its own HOME button (the nav is shut there); elsewhere the bottom bar's Home tab on
   a phone, the side rail's on PC. Skipped when the player is on Home already.
2. Home's **Shop** tab ("…Tap Shop: your Pokédollars are spent there."), the bottom bar's on a phone, the side rail's on
   PC: the way to the Mart the player will use from then on, rather than the top bar's money (the user's call,
   2026-10-31). With ₽10 to spend, the tab's dot opens the Mart on Upgrades already, and the next step is skipped.
3. The Mart's **Upgrades** tab.
4. Upgrades' **Dice Types** view.
5. The starter's **type die**'s ₽10 button ("Charmander rolls Fire dice. Upgrade the Fire die for ₽10…").
6. Bought: "Well done! Your Fire die is Lv.2 now…" and **BACK TO Route 1**, which ends it for good and returns to the area.

- **Fully guided**: the screen dims but for the one button to tap (a gold ring around it), the hand points at it (from
  below, or from above when it sits low on the screen) and taps toward it, and Prof. Oak's bubble says why on the
  other half of the screen. Every other tap goes nowhere; the button does its own job, which is what moves the step on.
  Keyboard: the button takes the focus. Calm devices get the hand still.
- **The spotlight zooms in** (the user's request, 2026-10-31): each step's dim closes in from the whole screen onto
  what to tap (and what to look at), in 6 steps over 420 ms (3 under Short animations), so the eye lands there; the
  hand comes once it has closed in. Calm or animations off: at once. Taps only ever reach the target, zoom or not
  (`GuideFrame`'s `zoomKey`: a new step zooms again). The reroll lesson's steps zoom the same way.
- **The step comes from the page** (`diceTutorialStep`): wherever the player is, the next tap is pointed at; a reload
  picks it up where it was. Should a step's button not be on screen (a page laid out otherwise), SHOW ME goes straight
  to where it lives.
- **When**: between fights, as the one-time pop-ups' first (`popups.ts`): it keeps the turn on every page it walks
  through, so nothing comes between its steps. Joey's win leads straight into the next round's Pokémon Center, which
  isn't "between fights" for the other pop-ups: the tutorial alone may start there, once the heal has played (about
  3 s, `PopupContext.atCenter`), so a new player meets it before their next fight. Due once the opening's first round
  is won while the die is Lv.1 and the purse holds its price (`diceTutorialDue`); once shown (`save.diceTutorial: 'started'`) it comes back until BACK TO
  (`'done'`), the die bought or not. A player who upgraded the die on their own never sees it.
- **No rules card, no INFO**: it is the explanation (docs/15 §20).
- **The pieces**: `src/engine/tutorial.ts` (the starter, its die and price, due, the step), `DiceTutorial`
  (`GuideFrame`, `GuideBubble`) and `TutorialHand` (the hand, drawn pixel by pixel), on the kitchen sink. Upgrades'
  buy buttons carry `data-guide="buy-{kind}-{id}"`, the nav's tabs `data-guide="nav-home"`, `nav-shop`…

## 6. The reroll lesson

A new player's **first fight** teaches the reroll and the combos, simply and fast (the user's request, 2026-10-31):

1. The **first throw is an average hit**: the plain throw (no combo, no status face) whose damage is nearest the dice's
   mean, its dice close to each other (Charmander: 3 and 4, 7 damage), and always one that leaves Rattata standing yet
   within the pair's reach (`lessonFirstRoll`, `lessonWindow`). A reroll of it stays in that window. No starter can
   one-shot Rattata Lv.2 then (the user's call, 2026-10-31: only a Grass or Fire 6-6 could, 1 throw in 36).
2. The **second throw is rigged to be bad**: the worst the starter's dice can do (the lowest sum with no combo and no
   status face, `lessonBadRoll`: Charmander's Fire and base dice show 2 and 1). The screen dims but for the dice, the
   hand points at the next one to pick: "Ouch, a bad roll! You can throw dice again: tap both dice to pick them."
3. Both picked, the hand moves to **REROLL** (the dice stay lit): "Now REROLL: the picked dice are thrown again. Each
   battle gives only a few rerolls, so use them well!"
4. The **reroll lands a pair of 4s** (`lessonPairRoll`; every starter's dice have a plain 4, else the highest number
   they all have). Once the combo has counted, the dice and the readout (its "Pair +2" chip) are lit and the hand points
   at **ATTACK**: "A pair! Two dice showing the same number make a combo: +2 damage. Bigger combos hit even harder. Now
   ATTACK!" The hit (4 + 4 + 2 = 10) knocks out the opening's Rattata Lv.2, every time.
5. **Rattata's throws are set** too (`LESSON_FOE`, the user's call, 2026-10-31): its first a 2, its second a 1 that it
   rerolls into a 3. It is faster than the Kanto starters, so their fight always plays: Rattata 2, the average hit,
   Rattata 1 → 3, the lesson; the starter ends it 5 HP down. A faster starter (Treecko, Froakie, Litten, Scorbunny,
   Sobble) strikes first and meets only the 2.

- **The engine rigs it** (`src/engine/lesson.ts`, `BattleState.lesson`): `createBattle`'s `rerollLesson` arms it; the
  reducer counts the player's throws (the first average, the second bad, with a reroll left and 2+ dice) and the foe's
  (`foeThrows`), lands the reroll's pair and marks the lesson done with the ATTACK. The UI only points
  (`RerollLessonGuide`, on `GuideFrame`): it reads the step from the battle state. Every tap but the step's own goes
  nowhere, keys too (the dice's numbers, R, Space).
- **When** (`rerollLessonDue`): fights on the set opening's area while its first round isn't won, played by hand (not on
  auto, not a double battle), the set opening switched on, until the lesson's ATTACK (`save.rerollLesson: 'done'`). A
  player who spent both rerolls on the first throw has no reroll for it: the second throw then falls as it may, and the
  lesson waits for the next fight. A player already past the dice tutorial never gets it.
- **No switch of its own, no rules**: like the dice tutorial, it is the set opening's, and it is the explanation.
- **The pieces**: `src/engine/lesson.ts`, `rerollLessonDue` in `src/engine/tutorial.ts`, `RerollLesson.tsx`;
  `GuideFrame` lights `spots` (seen, not tapped) and points its hand at `handAt` inside the hole. The tray, its dice,
  the readout, REROLL and ATTACK carry `data-guide`. On the kitchen sink, each step on a mock battle panel.

## 7. The item tutorial

The first time a new player's Pokémon in battle is **below half HP** while they hold a **potion that would waste at most
5 HP** (a 20 HP Potion needs 15 missing; a Super Potion 45; a Hyper Potion 115), the hand points at the **Bag**: "You can
use potions in battle to heal your Pokémon and still play your turn." (the user's request, 2026-10-31).

- **It forces the Bag open, never the potion**: on a phone the Bag button is the one thing to tap, and opening it ends
  the tutorial; the player may then use a potion or close the Bag and play on. On a computer the Bag is already open
  (the column at the left): the spotlight is on it, and OK, or picking an item there, ends it. B on the keyboard opens
  the Bag; no other key works meanwhile.
- **When** (`itemLessonItem`): during the player's turn once the dice are down, the Bag usable, nothing else open, the
  reroll lesson not under way, played by hand. Once (`save.itemLesson: 'done'`), for players who began with the
  tutorials (the reroll lesson or the dice tutorial met), so a veteran never gets it. Not in Extreme mode with heal
  items off.
- **No switch of its own, no rules**: it rides the set opening's switch with the other new-player tutorials, and it is
  the explanation.
- **The pieces**: `itemLessonItem`, `ITEM_LESSON_WASTE` and `finishItemLesson` in `src/engine/tutorial.ts`,
  `ItemLessonGuide` (`RerollLesson.tsx`); the Bag button carries `data-guide="bag"`, a computer's Bag column
  `bag-column`. On the kitchen sink, a phone's and a computer's. e2e: `e2e/item-lesson.spec.ts`.
