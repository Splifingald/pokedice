# 42 · Stage first: a lighter game, the action on top

The user's brief (2026-10-26), after the area rework (docs/15 §6): the game still feels heavy in flows and confirm
buttons. What they want:

- **Home** stays the hub: the team's view at the top, then events, secret areas and features below.
- **In an area**, control only when it matters (the dice, picking a Pokémon); the rest of the time, the game plays and
  the player watches the action at the top, with the info a tap away rather than in the way.
- **Phone and PC** both, each layout fitted to its screen.
- **Superficial information** hidden, kept for the very invested player.
- **Game feel** pushed, so each action feels like it counts.

This is the proposal, built on the branch and tested on its Netlify Deploy Preview. What's below is what is in the
build (§2–§6), then what it doesn't do yet and why (§7).

## 1. Where the weight was

A fresh game played for five minutes on a 390×844 phone by a script, every tap recorded (the area rework's build); the
same on a 1440×900 window:

| Tap | Times | A decision? |
|---|---|---|
| ATTACK / REROLL, a die | 40 | Yes: the game |
| GO! at the send-out step | 11 | Against a trainer or a gym, yes; against a wild Pokémon, seldom: the lead goes |
| NEXT ▸ after a fight | 7 (3 more went by themselves) | Only after a new catch (the team's replace choice) |
| A fainted Pokémon's replacement | 2 | Yes |
| CONTINUE at a Pokémon Center | 2 | The Box (the user's rule: a Center waits) |

So outside the dice, a **wild fight's GO!** was the one tap asked of every encounter that was almost never a choice.
The screens also carried what nobody acts on: a dialogue box asking "What will Bulbasaur do?" over dice that already
say it, a battle history column taking a third of a PC's width, the HP and XP figures next to bars that show them, the
type chips on every card.

## 2. A wild fight sends its Pokémon by itself

At the send-out step of a **wild** fight, GO! is an `AutoButton`: it loads for 2.6 s (`SEND_OUT_AUTO_MS`) and sends the
Pokémon picked. A tap on another card picks it and starts the count again; a sheet open over it (INFO) holds it; a tap
on GO! goes at once. A **trainer, a gym or a boss** keeps a plain GO!: choosing who goes first there is the game.

`BattleView` (`SendOutStep`). No engine change: the same `sendOutLead` is called, only sooner.

## 3. The battle's line, under the stage

The dialogue box (64 px, a frame, "What will … do?" most of the time) is now **one line** under the stage
(`BattleLine`): what just happened ("Pidgey used Gust!", a catch's lines). It keeps its height empty, so the dice never
jump. The waiting prompt shows only with More details (§4): the dice and ATTACK say it.

## 4. More details (off by default)

A Settings switch, **More details** (`settings.details`, `useDetails()` in `store/hooks.ts`; kept in the browser and in
the save's settings). Off — every player until they switch it on — the game shows the action and a tap shows the rest.
On, it adds:

| Where | With More details |
|---|---|
| Battle, wide screens | The history column on the right, and the key hints under it |
| Battle, phones | The history button by the team |
| Battle | The waiting prompt in the battle's line |
| Pokémon cards (Center, the area's team, Kitchen Sink) | The type chips and "HP 23/23"; without it, a bar alone (`PokeCard` is always `brief`) |
| The result card | Each Pokémon's "12/30" XP after its bar |

The rule for new screens (docs/15 §6): a number a player needs to act stays; a number to study goes behind More details.

## 5. Layouts for phone and PC

- **Battle on PC**: without the history the stage takes the room, bigger by the history's width, centred between the
  team column and a matching gutter. With More details, the three columns as before.
- **Center and the area's team on PC**: six cards to a row from 1024 px instead of three stretched ones.
- **Home** (both): the team's scene on top as before; under it the widgets now sit **under headings**: Events, Secret
  areas, Features. Secret areas lists **every** secret area open in the region (the newest, never played, first with
  NEW; the one you're in tagged HERE), not only the newest. A heading shows only with something under it.

## 6. Game feel

Both under the Game feel switch (docs/38), quicker with short animations, none when the screen should be calm:

- **The way into a fight** (`EncounterSwipe`): each new fight opens behind eight ink bars that pull off to alternate
  sides in six steps, from the centre line out, with a rush of air (`encounter.swipe`). It covers the stage while the
  foe's arrival starts under it, so no fight waits for it (480 ms; 280 ms short).
- **The round's pip** (`FreshPip` in `RoundGauge`): the pip a new encounter fills on the stage's round strip flashes
  white, stands tall and settles to gold in steps, with a chime (`round.fill`): every encounter moves the area on, and
  now you see it move.

## 7. Not in this build, and why

| Idea | Why not yet |
|---|---|
| A taller stage on tall phones (the dice tray still leaves room on a 390×844) | The stage, its art, every scene and its plates are laid out on a fixed 3:2 grid. Growing it is a pass over every timeline; worth doing, as its own piece |
| One-time rules pop-ups as cards in the page rather than modals | CLAUDE.md's rule (a rules pop-up once, plus INFO) is the user's; changing its form is their call |
| Centers that go on by themselves | The user's rule: a Center waits, for the Box |
| Removing BACK from the result card | It is the only way to stop between encounters without leaving the area; a pause button on the stage could replace it |
| Home's empty right column on PC for a brand-new game | Nothing is open yet; it fills as events, secrets and the Day Care open |

## 8. Testing it

On the pull request's Deploy Preview (`https://deploy-preview-4--poke-dice.netlify.app`): play a wild fight (GO! loads),
then a trainer (it waits); Settings → More details on and off, in a fight (history, prompt) and at a Center (cards); a PC
window for the wider stage; Home's headings once something is open. The Kitchen Sink's "rework" section plays the
swipe again and switches More details.

Tests: `tests/details-setting.test.ts` (the setting read back, in the save); `e2e/layout.spec.ts`,
`e2e/game-feel-dice.spec.ts` and `e2e/resume.spec.ts` follow the battle's line and the Bag row.

No server change, no migration, no admin switch: it changes screens that exist (docs/15 §20), and the sensory parts sit
under the existing Game feel switch.
