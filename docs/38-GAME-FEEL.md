# 38 · The game-feel pass

The changes chosen on the Fix Board after the October 2026 UX review: how the battle, the rewards and the menus look,
sound and feel on a phone, plus the accessibility and simplicity fixes that came with them. The review is
<https://claude.ai/artifact/9cZy7XnTtSkbYzYmMnXxt5>, the board <https://claude.ai/artifact/GmZWQ3rjg7RfmLLViyTEA4>.
Each item keeps its board id (F2a, U3a…), so a change can be traced to the decision behind it.

## 1. The switches

Three admin switches (Admin → Config), each **Off / On for admin / On for everyone, Off by default** (docs/15 §20):

| Switch | `config` key, helper | What it covers |
|---|---|---|
| **Game feel** | `gameFeel`, `gameFeelOn` | The juice: the damage count-up and combo tiers, hits that scale, the KO beat, faster turns, the victory payoff, the catch and progress moments, the extra taps and sounds. Off: everything plays as before |
| **Haptics** | `haptics`, `hapticsOn` | Short vibrations (`src/lib/haptics.ts`), with a Settings switch. Android only: iOS Safari can't vibrate |
| **Battle music** | `music`, `musicOn` | An original 8-bit loop under fights, synthesised like the effects, with a Settings switch |

All three only change how the game looks, sounds and feels on the player's device: the engine has decided everything
first, so no server function acts for them and none reads them, as with the dice throws (docs/37 §7.4). They are
purely sensory, so they have **no rules pop-up and no INFO button** (docs/15 §20).

The bug fixes, the accessibility fixes and the simplifications of existing screens have no switch: they change
features already there.

The new sounds live in `src/audio/feel.ts` (`feelSound`), built from `sfx.ts`'s `tone` and `hiss` on the same Sound
switch; the haptics in `src/lib/haptics.ts` (`haptic(cue)`).

## 2. Battle: hits and pace

<!-- WP1 -->

## 3. Battle: the dice and the readout

<!-- WP2 -->

## 4. Rewards, catches and progress

<!-- WP3 -->

## 5. Taps, haptics and music

<!-- WP4 -->

## 6. Pop-ups and Home

- **U2a · One pop-up queue.** The one-time pop-ups used to decide by themselves when to open: 18 files each copied a
  list of the pop-ups that went before them, every list a different subset, and GameLayout mounted 27 pop-ups and
  services side by side. Some stacked (the two "while you were away" reports, the General upgrades' rules and Prof.
  Oak's invite), some waited on each other in a circle of exceptions, and one never opened: the battle powers' rules
  waited on the gifts' and Trick or Treat's, which only clear at the first gift or the first ghost, so with either
  switched on the Mega, Gigantamax and Z-Move rules never showed (the board's B3). Now the engine decides
  (`nextOneTimePopup(save, data, ctx)` in `src/engine/popups.ts`, tested in `tests/engine/popups.test.ts`): the one
  pop-up due now, or none, in one order. `ctx` carries what the engine can't know: whether it's calm (between fights,
  `run.phase === 'idle'`, no battle, no full-screen moment, no gift being opened), the page, signed in, the server's
  clock, Prof. Oak's invite seen on this device, and what waits outside the save (the away reports, the developer's
  answers, friends' raid gifts, an invite reward, push's question). `PopupQueue` (in GameLayout, around the pages too)
  works the turn out once, `OneTimePopups` mounts every pop-up, and each opens only on its own turn
  (`src/components/popupTurn.ts`); the one on screen keeps its turn while it's due, so one that arrives later (raid
  gifts collected on coming back to the tab) can't snatch the screen. The order keeps the old one wherever it was
  consistent: the away reports (Extreme's, then the General upgrades'), the Day Care tutorial, the leaderboard tip, the
  developer's answers, friends' raid gifts, Support me, a new region's offer, a special event, Versus, Prof. Oak's
  invite, Extreme mode, Trades, the General upgrades, the invite rewards' rules, a reward ready, the portal run, day
  and night, the battle powers, a small world's opening, its finish, its goodbye, a live event (the Underground's rules
  too), a taken trade's scene, push's question. Day and night now comes before the powers (neither waited for the
  other). Each pop-up keeps the pages it never opens on (the Day Care's tutorial off `/daycare`, an event's off
  `/events`, Versus's off `/versus`, Extreme's off Settings, Trades' off `/trades`, the General upgrades' off
  `/upgrades`, the invite rewards' off `/friends`, the portal's off `/area`, a world's and a live event's off the Mart,
  the region offer and the trade scene on Home only); there, the next one due takes the turn. The rules that open at
  their own moment stay where they are and hold nothing back: the gifts' before the first gift, Trick or Treat's at
  the first ghost, the portal's and the nightmare's on their way in, the looks' at the first open, a world's finish and
  a live event asked for from Home. Every "seen" flag is the one the save already had: no migration. A shared trade or
  friend link, the trades' toasts and push's question now also wait for the queue to be empty.
- **U2b · A closable leaderboard tip.** Prof. Oak's leaderboard tip (`LeaderboardTutorial`) was a pop-up with no way
  out but its one button, which left the page. It now has Later and ✕ beside SEE THE LEADERBOARD; both end it for good,
  as the Day Care tutorial's Later does: saved (`leaderboardVisited`, the flag the first visit already set), so it
  syncs. It's a tip, not a choice the player must make.
- **U3a · Squares only for what's open.** On a brand-new game's first Home, three of the four squares were locked or
  empty (the next secret at Lv.5/70, the Day Care at 1/20 caught, Versus at 0/3 at Lv.50, the special events "Coming
  later"), and each answered a tap differently (the areas list, a toast, the Versus page, nothing). Home now shows a
  square only for what can be used: a secret area found and never played (one tap travels there: `featuredSecret`'s
  fresh one), the Day Care once open (`isDayCareOpen`), Versus once open (`versusUnlocked`), each open special event
  (`activeEvents`), a small world and a live event. Under them one line names the next thing to open and how close the
  player is: "Coming up: Day Care · 7/20 caught" (`ComingUpView`, from `comingUp` in `src/engine/comingUp.ts`, tested
  in `tests/engine/coming-up.test.ts`), in the order things usually open: the Day Care, the special events (from the
  teaser's 3rd Kanto badge, "clear {area}"), Versus ("1/3 at Lv.50"), then the secret area closest to opening (its
  condition still to meet, as the locked square counted it). A secret area still to find is a goal rather than a
  feature, so it folds into the line instead of keeping a square. The events' "Coming later" placeholder is gone.
- **U4a · CONTINUE becomes GO TO.** Behind in the region, Home showed a red CONTINUE that replayed a cleared area
  ("Cleared · free play") above a green GO TO {area} that moved the story on: the main button was the wrong one. Now,
  when the player is behind (`latestOpenArea`) and nothing of its own waits where they stand (a cleared area's free
  play), the big red button itself reads **GO TO {area}** and travels there, its second line saying what waits there
  (the round, the gym leader, the legend); **Stay here**, a 44 px link under it, keeps today's free play. With
  something else here (a gym, a legend, a raid, a secret area's rounds, a portal or the nightmare, or a closed or
  sealed area, whose shut CONTINUE says why), CONTINUE stays, with the green GO TO under it. The victory card's forward button follows the same idea.
- **U5a · One red GO in the Areas sheet.** Every area card's GO was red (five in view at once). Now only the GO of the
  area Home's big button leads to is red (the one being played, or the one the story goes on in when behind); the
  others are navy (`frame-dark`). In the Regions view the new region's button is the red one while a region is on
  offer, else the region being played's GO.

On `/kitchen-sink`: Home's section (`HomeBits`): the Coming up line for each thing still to open, the big button
(CONTINUE, a challenge, greyed out, GO TO with Stay here), the leaderboard tip.

## 7. Accessibility and the shell

<!-- WP6 -->

## 8. Onboarding, menus and copy

<!-- WP7 -->

## 9. Setting it up

1. Deploy the client. The three switches are Off: nothing changes for anyone until the admin turns them on.
2. Run migration `supabase/migrations/0072_game_feel.sql` in the Supabase SQL editor (it adds the three switches' rows,
   Off, and bumps `configVersion`). `supabase/seed.sql` carries it too, inlined. Safe to run again.
3. Admin → Config: try **Game feel**, **Haptics** and **Battle music** On for admin first, then On for everyone.
4. The board also chose to turn the existing **Dice throws** On for everyone (F8a): Admin → Config → Dice throws.
