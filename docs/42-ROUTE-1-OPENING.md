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

Round 2 (5 cards), after the usual round Center (a new round opens with one when it would help, as everywhere):

1. Pidgey Lv 4
2. Rattata Lv 3
3. A find: a Potion
4. **Oddish** Lv 4
5. Pidgey Lv 5

Route 1 needs two rounds, so the area clears at the end of the second. From then on (replays) its deck is shuffled
from its own weights and pool, where Oddish is now a rare wild Pokémon (weight 3 beside Pidgey's and Rattata's 50:
about 1 in 35, Lv 3–5).

## 2. Decisions

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

1. Run [`supabase/migrations/0081_route_1_opening.sql`](https://github.com/Splifingald/pokedice/blob/claude/focused-heisenberg-tmsym1/supabase/migrations/0081_route_1_opening.sql)
   in the Supabase SQL editor: Youngster Joey, Oddish on Route 1, the switch's row (Off) and configVersion + 1.
   `supabase/seed.sql` carries it too (inlined).
2. Admin → Config → **Route 1 opening**: On for admin to try it on a fresh save, then On for everyone.
