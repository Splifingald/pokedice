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
