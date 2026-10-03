# Pokédice — Region Balance Report

What the headless campaign says about Johto and Hoenn, measured against Kanto. Reproduce with:

```
pnpm balance 1500 1 all          # the per-area table for every region
pnpm balance 900 3 johto         # one region, one seed
```

Kanto is the reference for every number here: a new region is balanced when its curve looks like Kanto's, not when
it hits an absolute target.

---

## Method

`src/engine/campaign.ts` plays the real run loop headlessly — the encounter deck, battles with the greedy AI on both
sides, rewards, catches, Centers, wipes and upgrade buying. A campaign runs **one region**: `chainArea` never wanders
into the next region's chain.

Six seeds (1–6) × three starters × three regions, 900 encounters each. "Chain" figures exclude the league itself and
the post-league catch-all area, which is an endless grind and would drown the signal.

---

## Results

| Region | Starter | League win % | League wipes | Chain wipe % | Chain turns | Lv at league | Band | Encounters to league |
|---|---|---:|---:|---:|---:|---:|---|---:|
| Kanto | Bulbasaur | 65 | 42.3 | 19.0 | 2.51 | 78 | 45–55 | 284 |
| Kanto | Charmander | **13** | 2.0 | **71.7** | 4.73 | **14** | 45–55 | **793** |
| Kanto | Squirtle | 68 | 27.3 | 19.9 | 2.76 | 79 | 45–55 | 253 |
| Johto | Chikorita | 76 | 13.2 | 7.8 | 3.48 | 88 | 49–59 | 274 |
| Johto | Cyndaquil | 82 | 7.2 | 2.3 | 2.54 | 80 | 49–59 | 239 |
| Johto | Totodile | 76 | 14.5 | 1.4 | 2.56 | 79 | 49–59 | 231 |
| Hoenn | Treecko | 61 | 31.7 | 4.5 | 2.86 | 93 | 50–58 | 416 |
| Hoenn | Torchic | 54 | 6.0 | 5.1 | 2.66 | 96 | 50–58 | 514 |
| Hoenn | Mudkip | 64 | **120.7** | 4.0 | 2.61 | 96 | 50–58 | 500 |

Both new regions sit inside Kanto's envelope on every measure that matters, and are **gentler on the way there**:
chain wipe rates of 1–8% against Kanto's 19–20%, and fight lengths of 2.5–3.5 player turns against Kanto's 2.5–2.8.

---

## What the numbers changed

**Johto's league was too soft, and was raised.** Faithful HGSS levels put its Elite Four at L42–52 against Kanto's
L53–61, and it showed: 80–86% win first time out, against Kanto's 65–68%. Its five rosters were lifted **+5 levels**
(Will L47–51 … Lance L55–59) and the area band moved to 49–59. Teams and order stay the originals'.

That single change moved Johto from 80/86/80 to **76/82/76** — Kanto's range — without making it punishing: league
wipes are 7–15, where Kanto's are 27–42. A first attempt at +8 overshot badly (Chikorita: 169 wipes, 435 encounters
to the league), which is why the change is +5.

**Region deck sizes were rebuilt from card counts.** Kanto's committed areas were long since retuned in admin to
4–11 card decks; `content.ts`'s `W` percentages (78/12/10 and friends) predate that and would have dealt 100-card
decks. `DECK` in `content.ts` is the card-count set the regions use.

**Legendary catch values follow Kanto's bands, not capture rate.** Every Gen 2 and 3 legendary has capture rate 3,
which maps to catch value 9 — a 6 on the die even with an Ultra Ball. Kanto sets the reference instead: the box
legendaries take Mewtwo's 7, the trios take the birds' 6, the mythicals take Mew's 5.

---

## Known asymmetries, left as they are

**Hoenn is longer.** 416–514 encounters to its league against Kanto's ~270 and Johto's ~250. It has 26 chain areas to
Kanto's 22, and it is the last region — a longer final act is the shape Emerald has. Its per-area experience is inside
the envelope, so the length is deliberate rather than a balance fault.

**Mudkip wipes at Hoenn's league** (120 against its siblings' 6–32) while still winning 64% of the time: it gets
there, then grinds. Worth a look if Hoenn's league feels like a wall in play, but not out of line with Kanto, where
Bulbasaur takes 42.

**Kanto's Charmander is genuinely stuck** — 13% at the league, 71.7% chain wipe rate, 793 encounters, arriving at
L14. This is pre-existing Kanto tuning, unrelated to the regions, and it is the widest spread in the game. It is the
strongest argument that Kanto's own early game deserves a pass of its own.

---

## A crash the simulations found

Winning a trainer battle while your last Pokémon faints with it left the gauntlet trying to send out nobody:
`createBattle` threw `No able Pokémon to send out`. A sweep of 18 seed/starter runs hit it three times — all in
**Kanto**, on content that predates this work, so it is reachable in the shipped game (`continueAfterVictory` starts
the next battle without checking anyone can fight). Both gauntlet paths now stop there, which is what the Center
logic already expects. Covered by `tests/engine/campaign.test.ts`.

---

## Sinnoh, and a re-measurement of the other three

Added with Gen 4 (`docs/07-SINNOH-PLAN.md`). The table above was produced by a one-off harness; the summary is now a
mode of the script, so it can be reproduced:

```
pnpm balance table 6 900         # every starter of every region, seeds 1–6
pnpm balance table 6 900 sinnoh  # one region
```

Because that harness is not identical to the one that made the first table, all four regions were re-measured
together. **Compare the rows below only with each other** — the Hoenn and Kanto numbers here and in the table above
disagree on the league columns, and these are the ones Sinnoh was balanced against.

| Region | Starter | League win % | League wipes | Chain wipe % | Chain turns | Lv at league | Band | Encounters to league |
|---|---|---:|---:|---:|---:|---:|---|---:|
| Kanto | Bulbasaur | 60 | 122.3 | 21 | 2.64 | 78 | 45–55 | 222 |
| Kanto | Charmander | 72 | 16.5 | 28 | 3.12 | 79 | 45–55 | 361 |
| Kanto | Squirtle | 65 | 32.7 | 25 | 3.07 | 77 | 45–55 | 200 |
| Johto | Chikorita | 80 | 8.0 | 14 | 4.55 | 92 | 49–59 | 307 |
| Johto | Cyndaquil | 84 | 5.3 | 2 | 2.48 | 81 | 49–59 | 208 |
| Johto | Totodile | 81 | 6.8 | 2 | 2.63 | 80 | 49–59 | 203 |
| Hoenn | Treecko | 38 | 123.5 | 5 | 2.82 | 96 | 50–58 | 276 |
| Hoenn | Torchic | 36 | 25.3 | 6 | 2.65 | 98 | 50–58 | 290 |
| Hoenn | Mudkip | 22 | 42.2 | 4 | 2.62 | 98 | 50–58 | 258 |
| **Sinnoh** | **Turtwig** | **76** | **13.5** | **7** | **2.76** | **94** | **50–60** | **281** |
| **Sinnoh** | **Chimchar** | **80** | **7.7** | **4** | **2.34** | **98** | **50–60** | **260** |
| **Sinnoh** | **Piplup** | **76** | **12.8** | **4** | **2.68** | **93** | **50–60** | **252** |

Sinnoh is inside the envelope on every column, and its three starters are the closest to each other of any region:
4–7% chain wipes against Kanto's 21–28%, 2.3–2.8 player turns a fight against Kanto's 2.6–3.1, and 252–281
encounters to the league against Johto's 203–307 and Hoenn's 258–290.

## What the first pass got wrong

**Every area wanted clearing several times.** Sinnoh shipped its first build with `roundsToClear` of 3 to 5, which
Johto and Hoenn reserve for their opening two areas and nothing else. 588 encounters of chain against their ~180:
the team hit L100 at the Great Marsh, fourteen areas in, and the back half of the region — Byron, Candice, Volkner,
Cynthia — was a walk. One round per area past the second, which is the convention the other regions already follow,
brought it to 183 and put the league back at L93–98.

That is the whole of the tuning. No wild pool, level band or roster was touched: the region was routed on Platinum's
own numbers and they held.

## Not Sinnoh's, but visible from here

**Hoenn's league is the hardest thing in the game** on this harness: 22–38% win rate against Johto's 80–84 and
Sinnoh's 76–80, and Treecko wipes 123 times a run getting through it. Kanto's Bulbasaur is the same shape (122
wipes at 60%). Both predate this work and neither was touched. If a league is ever re-tuned, those two are the
candidates — not Sinnoh's.

---

## Unova

Added with Gen 5 (`docs/08-UNOVA-PLAN.md`), measured with `pnpm balance table 6 900 unova sinnoh` on the live
database of 2026-09-27. Sinnoh is re-measured alongside because its live rows (admin tuning, and its Victory Road II /
League II lap) no longer match the Sinnoh table above; **compare Unova with the Sinnoh rows here**.

| Region | Starter | League win % | League wipes | Chain wipe % | Chain turns | Lv at league | Band | Encounters to league |
|---|---|---:|---:|---:|---:|---:|---|---:|
| Sinnoh (live) | Turtwig | 69 | 50.7 | 22 | 2.77 | 71 | 50–60 | 387 |
| Sinnoh (live) | Chimchar | 72 | 26.5 | 14 | 2.26 | 68 | 50–60 | 336 |
| Sinnoh (live) | Piplup | 74 | 18.5 | 20 | 2.49 | 70 | 50–60 | 356 |
| **Unova** | **Snivy** | **57** | **244.0** | **21** | **3.33** | **68** | **46–56** | **370** |
| **Unova** | **Tepig** | **69** | **67.7** | **20** | **2.57** | **64** | **46–56** | **322** |
| **Unova** | **Oshawott** | **44** | **171.2** | **12** | **2.50** | **67** | **46–56** | **350** |

**The chain is in the envelope**: 12–21% wipes, 2.5–3.3 turns a fight, 322–370 encounters to the league, arriving
about ten levels over the league band — the same shape as live Sinnoh. The first build arrived only ~3 levels over
(282–305 encounters); a second round on the four areas before the league (Icirrus, Dragonspiral, Opelucid, Victory
Road) closed that, which is the lever the admin used on Sinnoh's Spear Pillar.

**The league is not, and levels are not why.** Counting the lost gauntlet battles over 12 runs: Shauntal's Chandelure
~1,700, Ghetsis's Hydreigon ~700, everything else under 250 combined. Both beat teams at L100. The simulated player's
usual Unova team is Stoutland (Unova's commonest early catch), an unevolved Munna and a water starter — Normal and base
dice cannot touch a Ghost, Psychic cannot touch a Dark — so this is a type wall, the same class as Kanto's Giovanni and
Hoenn's league. Lowering both aces by two levels changed nothing, and was reverted: they stay at Black/White's 50 and
54. Whether to bend the roster for it is left open (see the plan).

---

## Kalos

Added with Gen 6 (`docs/11-GEN6-9-REGIONS-PLAN.md`), measured with `pnpm balance table 6 900 kalos unova` on the
live bundle of 2026-10-03 plus Kalos. Unova is re-measured alongside; **compare Kalos with the Unova rows here**.

| Region | Starter | League win % | League wipes | Chain wipe % | Chain turns | Lv at league | Band | Encounters to league |
|---|---|---:|---:|---:|---:|---:|---|---:|
| Unova | Snivy | 38 | 161.0 | 20 | 3.37 | 66 | 46–56 | 348 |
| Unova | Tepig | 59 | 194.3 | 11 | 2.29 | 66 | 46–56 | 339 |
| Unova | Oshawott | 51 | 188.3 | 15 | 2.58 | 70 | 46–56 | 379 |
| **Kalos** | **Chespin** | **67** | **119.0** | **18** | **2.50** | **80** | **60–70** | **515** |
| **Kalos** | **Fennekin** | **68** | **92.5** | **15** | **2.28** | **71** | **60–70** | **371** |
| **Kalos** | **Froakie** | **72** | **29.5** | **19** | **2.74** | **73** | **60–70** | **377** |

**Kalos sits in the envelope on the first build**: 15–19 % chain wipes, 2.3–2.7 turns a fight, about ten levels
over its league band on arrival, and a league won 67–72 % of the time — closer to Kanto, Johto and Sinnoh than
Unova is. Its league band is the highest yet (60–70) because X/Y's levels are, and it holds.

**Chespin takes longer**, 515 encounters against 371–377, and the per-area run says where: Lysandre (79 fights,
25 wipes, against 35 / 9 for Froakie — his Pyroar and Honchkrow both hit Grass) and Malva at the league. That is a
type wall, the same shape as Unova's Snivy against Shauntal. Ramos's gym is the one early spike for every starter
(74–79 % wins at Coumarine), where X/Y jumps from Korrina's 32 to Gogoat's 34. Both are left at X/Y's levels.
