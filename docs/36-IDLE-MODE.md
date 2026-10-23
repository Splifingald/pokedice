# Idle mode and the play styles

The user's ask of 2026-10-23: "Change the auto mode to be even more automatic: it skips most of the UI and only asks
the player the choice when catching a Pokémon. It goes to the next area when it can. If it loses an area, it goes back
for one round of the previous area and then comes back to the area it lost. It doesn't swap Pokémon in Pokémon
Centers, it doesn't use items. When the player starts a new game, before everything they are prompted with a choice
with all the available modes (except if there is only one available); among these there is now also Idle mode: the
game plays automatically, you control Poké Ball throws. Idle mode is not a different save, it's an option in the
settings: Classic (you play, you choose everything), Auto on explored areas (it becomes idle only when you decide:
today's auto mode, upgraded), Idle mode. Switchable anytime."

The user's ask of the same day, later: "Actually in full idle we should catch too, the catching rule is: If the pokemon
is not owned, take the lowest value ball that will give me the highest % of catch, never take master ball. If it's
owned, don't use a ball. And don't show a rules pop up for this mode." (§3.1; the pop-up: §2.)

**Status: built.** Engine `src/engine/autopilot.ts` (every decision); glue `src/store/autopilot.ts` (each step carried
out through the run store's own actions); the clock `src/screens/area/useAutopilot.ts` (mounted by the area's page);
UI `src/components/IdleMode.tsx` (the style cards, a new game's question, Settings' panel and its INFO),
`src/components/AutoModeToggle.tsx` (the area's switch), `src/screens/area/AutopilotNote.tsx`; admin Config →
**Idle mode**; migration `supabase/migrations/0068_idle_mode.sql`. Rules for the screens: docs/15 §34.

## 1. Before: auto-mode

Auto-mode was one setting, `settings.autoMode` (device and save), switched by AUTO-MODE under a **cleared** area's
header (`AutoModeToggle`) or from a cleared area's battle (its extras; STOP hands the fight back). While on, only the
**fights** played themselves: `BattleView` dispatched the engine's `autoEvents` (`engine/sim.ts`: the roll, rerolls
toward a lethal total, a switch to a Pokémon that can hurt the foe, the battle powers; never an item) at a faster pace
and `short` motion, and `createBattle` got `auto: true` (`store/run.ts startBattle`). Everything else — the encounter
preview, the result cards, the Center, catches, travel — waited for the player as usual.

## 2. Decisions

| Question | Answer |
|---|---|
| One save | **A setting, not a save**: `settings.playStyle` (`'classic' \| 'explored' \| 'idle'`), kept like every setting on the device and in the save. `settings.autoMode` stays and means "auto engaged now". The autopilot's own state is in the save: `save.idle` (a lost round's `detour`; `rulesSeen`, written by the builds that had the rules pop-up, is no longer read and stays only so those saves load as ever). |
| Settings from before | **No style = "Auto on explored areas"** (`playStyleOf`): every player had auto-mode in cleared areas, so nothing changes for them; their switch stays on or off as it was. Nothing is rewritten. A style a newer build wrote that this one doesn't know reads as unset (the save never fails over it). |
| Switch | **Off / On for admin / On for everyone**, Off by default (`game_config.idleMode`, docs/15 §20). **Off: the whole feature is nowhere** — no question at a new game, no Settings panel — and auto-mode is exactly what it was (§1: a cleared area's fights only, `autoLevel` = `'fights'`). The styles and the autopilot run on the player's device, and the choice lives in the save's settings, so no server function acts for this feature and none reads the switch (as day and night, docs/32). Turning it off keeps every player's choice. |
| Where auto plays | `autoAvailable` / `autoLevel`: **Classic** nowhere (no switch in the area, none in battle). **Auto on explored areas**: cleared areas, once the player switches it on there (as before). **Idle**: every area, on from the moment it's picked; the area's switch (Idle mode: ON/OFF) or STOP in a fight pauses it, the switch resumes it. Never in a portal run's or the nightmare's area (their own steps, docs/28, docs/30); an Elite Rebattle only has its fights on auto. |
| What runs | `autoLevel` = `'full'`: **the autopilot** (§3) — the whole run, not only the fights. |
| A new game | **The question comes before Prof. Oak** (`PlayStylePrompt`): the three styles as cards, NEXT once one is picked, "You can change it any time in Settings". Only when there is a choice (`newGameAsksStyle`: the switch on for the player; Classic and Auto on explored areas alone would be the old game). Its answer is the style's settings (`settingsForStyle`: Idle starts on, the others off). |
| Settings | **Play style** under Game (`PlayStylePanel`): the same cards, switched any time (the next step follows the new style), and INFO with the rules. |
| Its rules | **No rules pop-up, ever** — the user's explicit exception to docs/15 §20's "once" rule ("don't show a rules pop up for this mode"). The rules are **INFO's only**, in Settings → Play style (`IdleRulesModal`, OK): a banner drawn in code (the trail, the dice, the ball), four rows (three ways to play; it catches by itself, §3.1; on to the next area, one round back after a lost one; no other items, no swaps). The style cards say the gist on their face (Idle: "catches too: new Pokémon, never with the Master Ball"). |

## 3. The autopilot

Every step is `autopilotStep(save, data, style, view)` (pure), carried out by `runAutoStep`. The page paces it
(`useAutopilot`: about a second between encounters, a quarter for a card it takes, a little longer on a K.O.) and
re-checks after every step, so a wait picks up by itself. It runs while the area's page is up (Home's CONTINUE goes
there); on any other page the run waits until the player is back.

| Moment | What it does | Shown |
|---|---|---|
| Between encounters | **Moves** if it should (§4), else the next encounter or the gym or legendary waiting (Home's CONTINUE, `continueExploring`). **Waits** while a pop-up is open (a feature's rules, a sheet the player opened: any dialog), while the energy is out (until it refills), while everyone rests (Extreme mode), or in a lair with nothing left. | The area's page, "Back on the trail…", briefly |
| An encounter's card | **Takes it**: fights with the lead the preview would pick (the first able, two for a double battle), picks a find up, walks into the Center or the Game Corner. Gyms and legendaries are fought as they come. | **Skipped**: a line stands in for it — Idle: "On auto: everything plays by itself, catches included."; Auto on explored areas: "…A catch will wait for you." |
| Trick or Treat | **Waits for the player**: it is a catch of its own. | Its card and screen, as ever |
| A fight | Plays on auto (`autoEvents`, as before): **never an item**. **Waits** while a pop-up is over it (the trainer menu, Settings opened mid-fight: docs/15 §14); a style picked there that plays the fight takes over from its next move, once Settings close. | The battle, at the auto pace |
| The catch | **Idle: plays it itself** (§3.1): the ball it picked shows chosen on the panel for 0.9 s, then flies on the stage as the player's throw would; a Pokémon it leaves passes after the same 0.9 s (a toast when it was for want of a ball). A Bait offered is **kept**; Capture Luck's THROW AGAIN is taken 1.4 s after the result, and the rule picks again from what is left. **Auto on explored areas: waits for the player** (the ball, the Bait, THROW AGAIN). Either way, once the throw's result has been read (1.4 s) it moves on by itself. | The catch panel, the throw |
| The result card | Shows whole at once (no row-by-row reveal), stays 1.6 s, closes: the trainer's next Pokémon (the one still in, else the first able) or back on the trail. **"Add to team?"**: Idle answers no, as CONTINUE does (the catch to the Box; both after a wild pair); Auto on explored areas waits for the player. Evolutions **play in full** and each moves on 1.8 s after its reveal. | Briefly |
| The Pokémon Center | Heals (as walking in always did) and leaves at once: **no team swaps**. A toast says the team was healed. | **Skipped** (no healing scene) |
| The Game Corner | Leaves without a spin (money is the bag's, like items). | **Skipped** |
| A stalemate | Goes on. | Its card, briefly |
| A full K.O. | **Retreats** (§4). | The wipe card, briefly, then a toast |

**Kept by design**: under Auto on explored areas, the catch (the player's choice); Trick or Treat (a catch of its own,
in either style); every one-time pop-up (the autopilot waits for it), evolutions (they play, they don't block), the
catch's throw, the result card and the K.O. card for a moment (what happened is still seen). **Never done**: an item
other than Idle's Poké Balls (bag, battle or Center; a Bait included), the Master Ball, a team change, a Game Corner
spin, a raid, a portal run, the nightmare, a new region.

### 3.1 Idle's catches

The user's rule, decided by `chooseIdleBall(save, data, dex)` (`engine/autopilot.ts`, pure) and read through
`autopilotStep`'s `'catch'` phase (`throw` / `pass` / `keepBait` / `retry`); `BattleView` carries the step out so the
throw plays on the stage.

- **Owned** (`idleOwns`) = for a plain Pokémon, the species is in the save's Pokédex (`save.pokedex`, by dex number),
  as the Pokédex and the catch count it; a **regional form** is a species of its own (its own dex number, its own
  entry), so an Alolan form not yet caught is new even with the Kanto one owned; a battle form (Mega, Gigantamax…) is
  its base Pokémon. A **shiny is not the same Pokémon** (the user's rule): it is owned only while a shiny of its species
  is in this region's Box, since the Pokédex keeps no shiny record (one traded or released away makes the next shiny
  new again). Owned: **no throw**, even when the catch would offer a stronger copy (replacing the weaker one) or a small
  world's boss; it moves on as a catch not on offer does (nothing added to the result card).
- **Not owned**: the balls held (quantity above 0), **the Master Ball never** (`MASTER_BALL`, `master-ball`), each with
  its chance by the catch's own formula for this Pokémon (`catchChance(catchValueOf(dex), ballBonus)`: the d6 plus the
  ball's bonus against the species' catch value — the formula has no HP, status or other modifier, so nothing else
  enters). The **highest chance** wins; among the balls tied at it, the **lowest value**, its Mart price (`item.price`:
  Poké Ball 20, Great Ball 50, Ultra Ball 100), then the weaker ball, then the key, so the bag's order never matters.
  **Tied** means the formula gives the same number: the chances are exact sixths, and two balls share one only with the
  same bonus or once both are certain (or both hopeless), so no tolerance is used.
- **No ball needed** (certain with none, the panel's CATCH): thrown with no ball, whatever the bag holds — the cheapest
  of all.
- **No eligible ball held, or none with any chance**: no throw (a ball spent on a sure miss is a ball lost); a toast
  says "No ball you hold can catch {name}: left behind."
- **After a throw**: a Bait offered is kept (no items); Capture Luck's second throw is taken, the rule applied again to
  what is left, until it is caught, flees or no ball is left. "Add to team?" is answered no (to the Box), so the team
  never changes; with room in the team, a catch joins it as every catch does.

## 4. The way between areas

`autoTravel` and `retreatFrom`, along the region's main chain (secret areas aren't in it):

- **On**: between encounters, once the area is **cleared** and the next area of the chain is **open** (unlocked, not
  closed, its date come), it goes there. Auto on explored areas only goes into a **cleared** next area (it plays
  nowhere else), so switched on behind the front, it walks forward to the last explored area and plays there.
- **A round lost** (a full K.O.): the wipe card is skipped and it goes to **the area before** in the chain for **exactly
  one round** — the detour, `save.idle.detour = { from, to, rounds }`, `rounds` being what that area had done — then,
  the round counted, **back to the area lost**. The first area of a region, or a secret one, has nothing before it: the
  same area again.
- **Lost again during the detour**: one area further back, for one round, then forward again from there (each area
  cleared moves it on), so a team that can't hold the area before still finds one it can.
- **The player goes elsewhere** (Areas, Home's GO TO): the detour is forgotten; the autopilot carries on from where the
  player put it.
- Toasts: "Now exploring {area}", "Round lost: one round in {area}, then back to {lost}.", "Round done: back to
  {area}!".

## 5. Setting it up

1. Deploy the client (the switch is Off: nothing changes for anyone; auto-mode stays as it was).
2. Run `supabase/migrations/0068_idle_mode.sql` (the switch's row, Off, and the content version + 1; safe to run again):
   https://github.com/Splifingald/pokedice/blob/claude/gifted-cray-t73mqb/supabase/migrations/0068_idle_mode.sql
   (the branch this was committed on; the same path on whichever branch it is pushed to). `supabase/seed.sql` carries it
   too (inlined). Without it, the admin's switch still saves (it inserts the row).
3. Admin → Config → **Idle mode**: **On for admin** to try it signed in, **On for everyone** to open it. Publish.

## 6. Tests

- `tests/engine/autopilot.test.ts`: the styles and the switch (where auto plays, 'fights' while off), a new game's
  question; on to the next area, Explored only into cleared ones; the retreat for exactly one round
  and the way back, further back when lost again, nothing before the first area, a stale detour forgotten; every
  step (cards taken but Trick or Treat, catches and "Add to team?" waiting under Auto on explored areas, Idle throwing,
  passing, keeping the Bait, throwing again and answering no; the Center left with no swap, no item in a whole auto
  fight); `chooseIdleBall`: not owned → the best chance, the cheapest among ties; never the Master Ball, even the best
  or the only one; owned → none; no ball, or none with a chance → none; no ball needed → none thrown; a stock of 0
  skipped.
- `tests/play-style-setting.test.ts`: old settings read as Auto on explored areas, the style on the device and in the
  save with the detour, an unknown style never failing a save.
- `tests/idle-mode-sql.test.ts`: 0068 against PGlite (Off, the version bumped, the admin's switch kept on a re-run),
  inlined in seed.sql.
- `e2e/idle-mode.spec.ts`: the new game's question (on), none (off); Idle playing from CONTINUE and catching by
  itself; Idle catching a new Pokémon with no tap (a Poké Ball where one is needed, none where none is, the Great and
  Master Balls untouched, the catch to the Box with a full team) and leaving one it owns (no ball, the weaker copy
  kept); Idle moving on to the next area by itself; an existing save with no rules pop-up, its old auto-mode as Auto
  on explored areas, Settings switching (and arrow keys), INFO with the catch rule; nothing in Settings when off;
  Settings in dusk with no serious axe issue.
