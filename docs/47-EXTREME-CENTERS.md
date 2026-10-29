# Extreme mode's Pokémon Centers: a boon instead of a heal

The user's ask of 2026-10-28, for Extreme mode (docs/22): keep the Pokémon Center that opens each round, but make it
a roguelike choice instead of a full heal; no Center at all once an area is completed ("or it's too easy, they just have
to go back to easy areas to get healed"); the healing while away stays as it is. It sits behind its own admin switch
(docs/15 §20), Off by default.

**Status: built** on `claude/charming-bohr-kbvip4` (from `version/2_4`), for `version/2_5`. Engine
`src/engine/extremeCenters.ts`; UI `src/components/ExtremeCenter.tsx` and `src/screens/area/CenterView.tsx`; admin
Config → Extreme mode → **Extreme Pokémon Centers**; migration `supabase/migrations/0085_extreme_centers.sql`. Rules
for the screens: docs/15 §19.

## 1. Decisions (the questions asked on 2026-10-28)

| Question | Answer |
|---|---|
| Where | **Extreme mode only.** The main game keeps its full-heal Centers. With Extreme mode's own "Pokémon Centers" ticked (the classic ones, docs/22 §2) none of this applies. |
| The choice | **3 boons, pick 1.** The **30 % team heal is always one of them**; the other 2 are drawn by weight, never the same kind twice, among the kinds that can do something now. |
| Which Centers | **The one that opens each round, and the deck's Center cards** (both boon Centers). None is ever sent for a hurt or fainted team (the "entering hurt" and easy-area Centers are gone). |
| Completed areas | **No Center at all**, ever. |
| Secret areas (they never complete) | **Only the very first one**, and it never comes back. |
| The whole team K.O. | **Back to a Center that only swaps**: no boon and no heal (K.O. Pokémon keep their 12-hour rest); the player swaps in Pokémon from the Box and the round starts over. The round's own boon Center doesn't come back, so losing on purpose can't farm boons. This happens in a completed area too. |
| Heals and K.O. | The **full heal on one** can pick a K.O. Pokémon: it is back at full HP, its rest over. The **30 % heal** only reaches Pokémon still standing. |
| What the cards show | **Everything but the Rocket Trade**: "Hyper Potion", "+1 Water die for Wartortle", "₽540". The Rocket Trade's Pokémon is a surprise until the trade is done. |
| Team changes | At a boon Center, **after the pick** (the boons are drawn for the team that walked in). |
| Pokébuff | **+1 die of one of its types for 24 h of real time** (the user: "the 5 battles might lead to abuse"). A second Pokébuff on the same Pokémon puts its clock back to 24 h; never two dice. A Pokémon at the dice cap is never the one picked. It works alongside a Mega Evolution or a Z-Move. **Never before the region's 2nd badge** (the user, 2026-10-29; `buff.badges`). |
| Healing item | **One item**: the potion of the badges won in the region (Potion, Super Potion from the 3rd, Hyper Potion from the 6th), a Revive or a Max Revive. Weights 82 / 15 / 3. None when the Extreme admin has Potions and Revives off. |
| Generous donor | **₽ = 3 × what an average trainer of the area pays**, so it grows with the game. |
| Rocket Trade | **The region being played, the same evolution stage**, never a legendary or a mythical; full HP, 3 levels higher; counts in the Pokédex; normal shiny odds. A K.O. Pokémon can be given. |
| Weights | Full heal 30 · item 30 · Pokébuff 20 · donor 10 · Rocket Trade 10, all the admin's. |
| Idle mode | **None in Extreme** (the user: "no idle mode in extreme"): while the switch is on, an Extreme save has neither Idle mode nor auto-mode, since every Center is a choice. |
| Healing while away | Unchanged (docs/22 §1.4). |

## 2. The rules (all in `src/engine/extremeCenters.ts`)

- `extremeCentersOn(data)`: the switch (`game_config.extremeCenters.access`, read through `eventOpenTo`).
  `boonCenters(save, data)`: an Extreme save, the switch on, `extreme.centers` off.
- `boonCentersHere(save, area, data)`: a boon Center can still come here: the area is not completed, and a secret area
  (`roundsToClear` null) hasn't met its first (`AreaProgress.centerMet`, noted by `recordDraws` in an Extreme save).
- The encounter context (`EncounterContext`, built by the store): `noCenters` is true where no boon Center can come;
  `boonCenters` stops the Centers sent for a hurt or fainted team (`dueCenter`); `wipeCenter` (`AreaProgress.wiped`,
  set by `applyWipe`) opens the next round with `{ kind: 'center', reason: 'wipe' }` wherever the area stands, and
  `recordDraws` clears it once that Center is met.
- `openBoonCenter(save, data, areaId, reason, rng)`: met, a boon Center draws its boons (`drawCenterBoons`: the heal,
  then distinct kinds by weight from `eligibleBoons`) into `save.extreme.center`, so a reload shows the same ones. A
  `wipe` Center draws none. `pendingBoons(save, areaId)` reads them; the store sends the player back into that Center
  while they wait, and drops them (`dropBoons`) when the player turns up in another area.
- `pickCenterBoon(save, data, areaId, index, target, rng, now, newId, shinyChance)`: the boon applies and the boons go.
  `target` names who a full heal (any Pokémon not at full HP, K.O. ones included: `boonTargets(…, 'full')`) or the
  Rocket Trade (a team member with someone to trade for: `boonTargets(…, 'rocket')`) is for.
  - **heal**: everyone standing in the Box (the team is in it) + `heal.percent` % of max HP.
  - **full**: the one picked to full HP, its `koAt` gone.
  - **item** / **donor**: the item into the bag / the ₽ into the purse.
  - **buff**: `PokemonInstance.buff = { type, until: now + hours }`; `buffDiceFor` gives the battle its die
    (`extraDice`, kept under `buff.maxDice`) while `until` is ahead, on the server's clock when known.
  - **rocket**: `rocketPool`: the region's species (`regionSpecies`) at its `evolutionStage` (first, middle, final; a
    Pokémon that never evolves is final), not a form, an Unown, a legendary or its own species, whose **fight value**
    (`fightValue`: max HP × dice at the new level; Pokédice has no base stat totals) is within `rocket.band` % of its
    own, else the five closest. The new one takes its place in the team and its order.
- `teamSwapsOpen`: at a Center while its boons wait, no team changes.
- `autoAvailable` (engine/autopilot.ts): false while `boonCenters`.
- `centerBoonRules(data)`: the numbers the rules and the admin show.

## 3. The screens

- **The Center** (`CenterView`): no healing machine. The Center's sign, then the boons (`BoonChoiceView`): a panel with
  the Center's pink rule along its top, "Pick one boon", then the boons as big buttons (one column on a phone, three
  from 768 px) with an icon (a heart; a potion; the item; a die of its type with a "+"; a coin; the trade arrows), a
  title and a line with its numbers, and INFO under them. A tap asks first: **who for** (`BoonTargetPicker`: the
  Pokémon it can go to, with their HP; for Team Rocket a red-ringed warning that it leaves for good) or **Take this
  boon?** (`CenterBoonConfirm`, BACK / CONFIRM). Then a toast says what it did, or Team Rocket's reveal
  (`RocketReveal`) shows who left and who came. While the boons wait there is no action bar and no Box: the team's
  cards stay in sight; once picked, the Center is as before (the team, the Box, HOME / CONTINUE).
- **The Center a K.O. sends**: the same screen with `WipeCenterNote` on top ("Back at the Pokémon Center · Your team
  was K.O.: no boon this time…"), the team and the Box to swap.
- **The Pokébuff**: `BuffTag` ("+1 die · 23h 10m", the dice icon, in green) on the Pokémon's cards and its sheet.
- **The rules** (`CenterRulesModal`, the Center's room as its banner): a feature with no page of its own, so a pop-up
  (docs/15 §20) at its own moment, over the first boon Center's choice, once (`extreme.centerRulesSeen`); INFO under
  the boons shows it again. Four rows: one boon per Center (the heal always among them), Centers run out, a lost round,
  the rarer boons.
- **Extreme mode's own rules** say "Centers don't heal" instead of "No Pokémon Centers". Its band names the mode alone
  ("Extreme mode", the user's call of 2026-10-29), whichever Centers are on.
- Every piece is on `/kitchen-sink` (`ExtremeCenterBits`).

## 4. Setting it up

1. Deploy the client (the switch is Off: Extreme mode keeps having no Centers, as before).
2. Run `supabase/migrations/0085_extreme_centers.sql` (the switch's row, Off, and the content version + 1; safe to run
   again):
   https://github.com/Splifingald/pokedice/blob/version/2_5/supabase/migrations/0085_extreme_centers.sql
   `supabase/seed.sql` carries it too (inlined). Without it, the admin's switch still saves (it inserts the row).
3. Admin → Config → **Extreme Pokémon Centers**: **On for admin** to try it signed in, **On for everyone** to open
   it. Its numbers are on the Extreme mode tab. Publish.

No server function acts for it: the boons are drawn and taken in the save on the player's device, as a Center's heal
always was, and the Extreme save syncs as before.

## 5. Tests

- `tests/engine/extreme-centers.test.ts`: the switch (On for admin, the classic Centers, Idle mode off); a round opens
  with one, a completed area has none, none sent for a hurt or fainted team, a secret area's first only; a K.O. sends
  the Center that swaps, even in a completed area, with no boon, spent once met; the boons on offer (the heal first,
  distinct kinds, no full heal with nobody hurt, no item with items off, the potion by badges, the donor's ₽); each boon
  taken (no Pokébuff before the 2nd badge; the heal skips K.O. ones, the full heal on a K.O. one, the item, the ₽, the Pokébuff's 24 h and its reset,
  Team Rocket's trade); the save keeps it all through a reload and drops an odd boon list.
- `tests/extreme-centers-sql.test.ts`: migration 0085 on PGlite and inlined in `seed.sql`.
