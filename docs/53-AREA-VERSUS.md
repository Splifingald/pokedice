# 53 · Real-player battles in areas

The user's ask, 2026-10-31: "Versus battles inside the areas. A new card in areas. It creates a versus-like battle
against a real player who played in this area, only players who played in this area when it was their latest unlocked
one. It clearly shows that it is against a real player's team. A Pokédollar reward like normal trainers but ×1.5
(admin), the player can skip it and not get the ₽. It takes recent players' teams. When the battle is over it proposes
to add the player as a friend."

All of it sits behind its own admin switch (docs/15 §20), **Off by default**: while it's Off, no deck holds the card and
the server answers nothing.

**Status (2026-10-31): built** on `ccr-6bff124e-axbz00` (from `version/2_8`), behind its switch, Off. Migration
`0098_area_versus.sql`.

## 1. Decisions (the user's answers)

| Question | Answer |
|---|---|
| The card | **A new card in the area's encounter deck**, `versus` in its encounter weights. **1 a round**, **2 in each Victory Road**. Admin › Areas sets any area's count |
| Which areas | **After the region's first gym**, only areas **with trainers** and **no gym leader** (about 88 of the 281 areas, 12 a region at most). The **main regions' areas and their secret areas** (Cerulean Cave, the Isle of Armor, Kitakami…). Not the small worlds, the events' areas, the nightmare or the Distortion World. **Never in Extreme mode** |
| Where in the round | **Among the round's last 3 cards** (the round gauge shows it there, a person on its segment). Every round, cleared area too |
| Nobody fits | **The card isn't dealt**: the round has no such step, and its gauge doesn't show one |
| Whose team | A signed-in player who **stood in this area while it was their newest one** (a main-chain area not cleared yet, or a secret area), in the last **14 days** (admin). Their **last team there**: each cloud save while there updates it, and it stays once they move on. **No opt-out** |
| Their strength | **As they were**: their Pokémon at their levels, their hidden talents, their dice and combo upgrades. Their ace may use a battle power as an area trainer's would. **Any level**: the card shows their team, the player chooses |
| Repeats | **Players not met yet first** (or met longest ago); with nobody else, the same one again |
| What the card shows | A **REAL PLAYER** tag, their look and name, "Played here 2 days ago", their Pokémon with levels, the ₽ to win, and a **Friend** tag if they're a friend already |
| The fight | **Like an area trainer's**, with the Bag, and XP for every K.O. Their team plays on auto. **The team is healed before the fight and after it** |
| A win | **₽ for each K.O., ×1.5 a trainer's** (admin; a cleared area's backtrack and Pay Day / Amulet Coin as for a trainer) |
| A loss | **Only the ₽**: no wipe, the round goes on, the team is healed, the XP of the K.O.s made is kept, items used are gone |
| SKIP | **No ₽**, the card is used, nothing else |
| After the fight | **SEND FRIEND REQUEST**, win or lose (not to a friend, nor twice). They see it in a new **Requests** list on the Friends page (a dot on the Friends row and the avatar), **ACCEPT** or **NO**. Unanswered, it goes after **30 days** (admin) |
| The owner | **Gets nothing but the friend requests**: their team plays without them and never loses anything |
| Launch | **The migration fills the pool from today's saves** (every player standing in their newest area in the last 14 days), so the cards come from the first day |

## 2. The engine (pure, `src/engine/areaVersus.ts`)

- `AREA_VERSUS_DEFAULTS`, `areaVersusConfig(data)` (game_config `areaVersus`), `areaVersusOn(data)` (the switch).
- `areaVersusCards(area, save, data)`: the area's `versus` weight while the feature is open to this save (on, not
  Extreme, not in a small world), else 0.
- `AreaFoe` (a real player's team, as the server sends it) and `parseAreaFoe(raw, data)`: unknown species dropped,
  levels kept to 1–100, upgrade levels to the game's tracks.
- `foeEncounter(foe, data)`: the card's encounter, a **trainer** (`trainerId: 'player:<id>'`) carrying `player`: the
  fight, the K.O.s, the ₽ and the victory card are a trainer's, the rest asks `isPlayerFoe(enc)`.
- `foeLevels(foe)`: their dice and combo upgrades for the fight.
- `placeVersusCards(order, n, last, rng)` (encounters.ts): the cards go among the round's last `last` cards.
- The deck (`buildDeck`) deals them only when the context has a foe (`EncounterContext.versusFoe`); a card turned over
  without one (a reload offline) is set aside, as any card the area can no longer produce.
- `withVersusCards(save, area, data, rng)`: a round dealt before the team arrived (the area just entered: the round's
  deck is dealt at its opening Center, before the server answers; a reload) gets its cards among its last ones once
  it does. Never twice: not when the round has one, met or to come.
- `applyVictory`'s `goldMultiplier`: the ×1.5 on each K.O.'s ₽.
- Talents aren't drawn for a real player's team (`dealTalents`): theirs are as they were.

## 3. The database (`supabase/migrations/0098_area_versus.sql`)

- **`game_config.areaVersus`** (the switch and the numbers) and `area_versus_open()`.
- **`areas.encounter_weights.versus`**: 1 in the picked areas, 2 in the Victory Roads (an area that has one keeps it).
- **`area_versus_teams`** (one row per player and area: name, look, team, upgrades, when). Written by a trigger on
  `saves` (`area_versus_write`, main game only) while the save stands in a main-chain area it hasn't cleared, or a
  secret area, of a region it plays, and that area deals the card. The team is read from the save, never from the page.
- **`area_versus_meets`** (who met whom, where, when): the order of the offers, and who may send whom a request.
- **`friend_requests`** (from, to, the area, when).
- **Functions** (every one checks the switch):
  - `area_versus_offer(area, skip)`: one team for the area, not yours, not a banned player's, the least met first.
    Readable signed out (guests meet real players too; no request then).
  - `area_versus_met(foe, area, outcome)`: the meet, once the fight is over or skipped.
  - `friend_request_send(to)`: only to someone you met in the last 30 days, not a friend; if they had asked you
    already, you're friends at once.
  - `friend_requests()`: yours to answer, not older than 30 days.
  - `friend_request_answer(from, accept)`: ACCEPT makes you friends (the friend cap as for an ID), NO drops it.
- **The fill** (`area_versus_fill()`): every save written in the last 14 days, through the same writer. The migration
  runs it once; the admin's **Fill from recent saves** runs it again.
- `delete_my_data` deletes the player's rows too.

## 4. What players see

- **The intro** (the user's asks, 2026-10-31: "a small animated intro that indicates it is a real player battle",
  then "it should feel awesome and stay simple"; `RealPlayerIntro`): a rival's entrance over the whole screen. Your blue
  band slams in from the left and their red one from the right, speed lines rushing across; each trainer slides in as
  a black silhouette and lands in a white frame into colour; a big VS slams onto the diagonal seam with the hit (a
  short shake, one white flash, the seam lit gold, a boom); "REAL PLAYER BATTLE!" and their name wipe in; VS beats
  while it holds; then the bands split apart onto the card. 1.7 s in pixel steps, a rival's sting on its beats
  (`versus.intro`). A phone stacks the two (you above the seam, them below); a wide screen sets them side by side.
  A tap ends it. In full under Short (an encounter's intro); calm: the still scene for 0.9 s, no shake or flash;
  animations off: none.
- **The card** (`PlayerFoeCard`, the encounter's pop-up): REAL PLAYER over their look, their name (golden for the
  rich), Friend, "Played here 2 days ago", their team (sprites, levels, shiny stars, talent gems), "Win ₽540 (×1.5 a
  trainer's)" and INFO. **FIGHT** (red) and **SKIP · no ₽**.
- **Its rules** (the feature has no page): a pop-up the first time a card is turned over (`RulesModal`, GOT IT; the
  save's `areaVersusRulesSeen`), and INFO on the card.
- **The fight**: a trainer's, their look as the foe's sprite, their name.
- **The result**: the victory card's ₽, then "You beat Misty's team!", "Your team is healed." and SEND FRIEND REQUEST;
  a loss: "Misty's team won", "No ₽ this time. Your team is healed and the round goes on.", SEND FRIEND REQUEST and
  CONTINUE. After sending: "Request sent". Already friends: no button.
- **Friends page**: **Requests** at the top while there are some: their look, name, "Fought you in Route 4", ACCEPT /
  NO. A dot on the Friends row and the avatar, with the count.
- **The round gauge**: a person on the card's segment, as a heart on a Center's.

## 5. The admin

- Admin › Config › Switches: **Real-player battles**; its tab: the ₽ ×, the days a team stays, the request's days,
  the round's last cards, **Fill from recent saves** (with how many teams it wrote).
- Admin › Areas: the **Real player** weight beside the other cards.

## 6. Setting it up

1. Run the migration in Supabase's SQL editor:
   <https://github.com/Splifingald/pokedice/blob/ccr-6bff124e-axbz00/supabase/migrations/0098_area_versus.sql>
   (after 0033, 0039 and 0040; safe to run again). It fills the pool from the saves of the last 14 days at once.
   `supabase/seed.sql` doesn't inline it.
2. Admin › Config › Switches › **Real-player battles**: **On for admin**, try it in an area after the first gym, then
   **On for everyone**.

## 7. Tests

- `tests/engine/area-versus.test.ts`: the switch and the areas, the cards among the round's last 3, no card without a
  foe, the foe's encounter and upgrades, the ×1.5, no talents drawn, the parsing.
- `tests/area-versus-sql.test.ts` (PGlite): the writer (newest area only, main game only, the team from the save),
  the offer (not yours, the least met first, the switch), the meets, the requests (met only, once, accepted, refused,
  crossed, expired, the cap), the fill, deleting your data.
- `e2e/area-versus.spec.ts`: the card, the fight on AUTO, the request sent, against a fake server; the Friends page's
  requests.
- The kitchen sink's **Real-player battles** section: the card (a stranger, a friend, a guest), the results, the
  requests.
