# 42 · Stage first: the action on top, a phone's panel beside it, fewer stops

The user's brief (2026-10-26), after the area rework (docs/15 §6): the game still feels heavy in flows and confirm
buttons.

- **Home** stays the hub: the team's view at the top, then events, secret areas and features below.
- **In an area**, control only when it matters (the dice, picking a Pokémon). The rest of the time the game plays and
  the player watches the action at the top, with the info a tap away rather than in the way.
- **Phone and PC** both, each layout fitted to its screen.
- **Superficial information** hidden, kept for the very invested player.
- **Game feel** pushed, so each action feels like it counts.

A first pass (§2–§6 of the first version: wild send-outs that go by themselves, the battle's line, More details, the
round's pip and the fight's swipe) was judged far from enough: "the most minor changes possible". This document is the
second, built on the same branch. §1 is the audit both passes start from, §2 the principle the second pass is built on,
§3–§9 what changed, §10 what is left.

## 1. Where the weight was

A fresh game and a mid-game save (three Pokémon around Lv.17, a Box of twenty, three badges, ₽4,280), played by a
script on a 390×844 phone and a 1440×900 window, every screen and every tap kept.

| Where | What weighed |
|---|---|
| **The fight on PC** | A phone column stretched: the team in a column on the left, the stage in the middle, the history on the right. At the send-out the team showed **twice** (that column and the cards under the stage), GO! under the fold. After a K.O., the same: the column lit up, and a big card under the stage |
| **The catch** | The balls as radio buttons (No ball picked first), then a separate ROLL TO CATCH: two taps for one decision |
| **A K.O.'s switch** | A list of detailed rows unlike the send-out's cards, the forfeit as a second full-width button |
| **The result** | A row per Pokémon (name, level, XP figures, Multi): with a catch, its Pokédex card and the team's choice, the scene scrolled off a phone |
| **Between encounters** | No scene at all: a banner strip, the team's cards and HOME / CONTINUE |
| **The Center on PC** | Cards stretched over the whole width, the healing then nothing to look at |
| **Home on PC** | CONTINUE under the scene, so the scene was squeezed to leave it room; the right column often empty |
| **Arrival** | Two pop-ups chained the moment Home opened (the Day Care's rules, then the invite), and a pop-up's LET'S GO led straight into the next on the page it opened |
| **The Mart** | Eleven locked items filling the shelf with what can't be bought |
| **The battle's panel** | A 64 px dialogue box asking "What will … do?" over dice that already say it; a wild fight's GO! the same tap every time |

## 2. The principle: the stage, and the phone's panel beside it

**On a phone** the stage is on top and the panel under it: the line, the dice, the actions, the team, the send-out, the
catch, the result. **On PC the stage takes the screen and the very same panel stands docked at its right**, a phone's
width (380 px), as tall as the stage, scrolling inside itself when it holds more. Nothing is under the stage, nothing
shows twice, and everything designed for the phone is right on PC because it is the same column.

The same shape everywhere the player plays: the fight (all its steps), the Pokémon Center (the healing, then the area
with the team, healed), the page between encounters (the area with its team), Home (the scene, and PLAY with what's
open beside it).

*Since replaced (the user's rule, 2026-10-28, docs/43 §7b's fifth round): the stage on top and the panel under it on
every screen. On PC the fight's middle column is the stage over its framed panel, the Bag open at its left and the
team on rows at its right; the Center, a find and the page between encounters are that middle column. docs/15 §6 has
the rule.*

## 3. The fight

- **PC** (*since replaced, 2026-10-28: the stage on top of the middle column, 798×532 on 1440×900, the panel under
  it, the Bag and the team in columns at its sides; §2's note*): the stage as large as the window's height allows (3:2:
  1012×675 on 1440×900), the panel beside it in its frame; the team as rows with their HP at its foot (the phone keeps its pips), the Bag above them, the dice up to 64 px.
  The left team column and the history column are gone; the history is a button by the Bag with More details.
- **The battle's line**: one line under the stage (on PC, at the panel's top) for what just happened; the waiting
  prompt only with More details.
- **A wild fight's send-out** loads and sends the Pokémon picked by itself (2.6 s; another pick starts the count
  again, a sheet over it holds it). A trainer, a gym or a boss waits for the tap.
- **A K.O.'s switch** is the send-out's step: the cards of those able to come in (at the fight's HP), the first
  picked, GO!; the forfeit a small button at the side (`SwitchStep`, `LeadPicker members`).

## 4. The catch: one tap

Each ball is its throw: a row of tiles in the thumb's reach (its sprite, its chance, how many are left), "Tap a ball to
throw it" over them. No radio to pick first, no ROLL TO CATCH after (`CatchPanel`). A sure catch or a bag with no ball
keeps its one button that loads and presses itself. Idle's pick shows outlined while it waits to throw. The raids' catch
uses the same panel, so it changed too.

## 5. The result: the team in one strip

Without More details the team's XP is **one strip**, a column per Pokémon (`TeamXpStrip`): the sprite, the name, the
level, the bar filling from before the fight, the XP won. A level-up turns its column gold and its level green, the
sprite hops in steps and the confetti flies as the bar rolls over; a milestone or an evolution to come is a chip
under it. With More details, a row each as before (names, figures, Multi XP). On a 390×844 phone a win with a catch now
fits under the stage whole: the strip, the catch, NEXT.

## 6. The Center and the page between encounters

- **Between encounters** the area and its team roam on top as on Home (`AreaSceneBox`: its plate opens the area's
  details, a Pokémon its sheet), the team's cards and HOME / CONTINUE under it; on PC the scene on the left and the
  panel beside it. The auto-mode switch the banner carried sits over the cards.
- **The Center on PC**: the healing plays on the left, then the area with the team, healed; the team, the Box and its
  bar in the panel. Phones keep the healing at the top, then gone (the user's rule). *Since replaced (2026-10-28,
  docs/43 §5.3): the Center is stacked on PC too, no picture beside the cards.*

## 7. Home

The team's scene on top. **On PC** the scene takes the window's whole height on the left; on the right, PLAY first
(CONTINUE and AREAS), then what's open. Under the team, the widgets sit **under headings**: Events, Secret areas (every
one open in the region, the newest first with NEW, the one you're in tagged HERE), Features (the Day Care, Versus). A
heading shows only with something under it.

## 8. Fewer pop-ups at once, less on the shelf, less to read

- **Pacing**: the moment a one-time pop-up is done, the queue rests a minute before the next (`PopupQueue`,
  `POPUP_GAP_MS`); none chains onto another, wherever its button led. In memory: a page loaded afresh starts without a
  wait. The queue's order and every pop-up's own rule are unchanged (engine/popups.ts).
- **The Mart's locked items** fold under one line, "Coming later (11)", as Upgrades' locked ones do.
- **More details** (Settings, off by default) keeps for the invested player: the battle history and the key hints, HP
  and XP figures (the bars stay), the cards' type chips, the waiting prompt, the result's rows.

## 9. Game feel

Under the Game feel switch (docs/38), quicker with short animations, none when the screen should be calm:

- **The way into a fight** (`EncounterSwipe`): the stage opens behind eight ink bars pulling away in steps, with a rush
  of air.
- **The round's pip** (`FreshPip`): the pip a new encounter fills flashes white, stands tall and settles, with a chime.
- **The result's strip**: a level-up is the column's own moment (gold, the hop, the confetti, the roll's sound).

## 10. Not in this build

| Idea | Why not yet |
|---|---|
| A taller stage on tall phones (a 390×844 phone still has room between the stage and the dice) | The stage, its art, every scene and its plates are drawn on one 3:2 grid; growing it is a pass over every timeline |
| Rules pop-ups as cards in the page rather than modals | CLAUDE.md's rule (a rules pop-up once, plus INFO) is the user's |
| Centers that go on by themselves | The user's rule: a Center waits, for the Box |
| The raids, Trick or Treat and the Game Corner on the stage-and-panel layout | Their own screens; the same principle applies when they are next touched |

## 11. Testing it

On the pull request's Deploy Preview (`https://deploy-preview-4--poke-dice.netlify.app`), on a phone and on a PC window:
a wild fight (GO! loads), a trainer (it waits), a K.O. (the switch's cards), a catch (one tap on a ball), the result (the
strip), BACK (the area with its team), a Center (on PC, the scene on the left), Home (on PC, PLAY at the top right), a
save with several pop-ups due (one, then a minute's rest). Settings → More details brings the figures, the rows and the
history back. The Kitchen Sink's rework section shows the strip, the switch's cards and the area scene.

Tests: `tests/details-setting.test.ts`; the e2e specs follow the line, the catch's tiles and the Bag row.

No server change, no migration, no admin switch: it changes screens that exist (docs/15 §20); the sensory parts sit
under the existing Game feel switch.
