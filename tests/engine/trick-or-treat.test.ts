// Trick or Treat (docs/28): the gauge, a Treat and a Trick Ball, the card in the deck (only while switched on, only
// where the area has ghosts), the catch's placement, and the balance: the exact best play and a Monte Carlo of simpler
// plays per rarity tier, so no tier is trivial and no simple play wins.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  TRICK_TIERS,
  applyTrickCatch,
  compileGameData,
  createRng,
  deckCounts,
  deckAbilities,
  emptyProgress,
  feedTreat,
  ghostsFromWildPool,
  nextEncounter,
  newSave,
  startTrick,
  throwTrickBall,
  trickBand,
  trickBestPlay,
  trickDealable,
  trickRulesDue,
  markTrickRulesSeen,
  trickZoneAt,
  type Area,
  type GameData,
  type Rng,
  type TrickOrTreatConfig,
  type TrickState,
  type TrickTier,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'

const CFG = DEFAULT_CONFIG.trickOrTreat
const base = compileGameData(BUNDLE)
const route = base.areas.find((a) => a.name === 'Route 1')!
/** Route 1 with a Trick or Treat card and two ghosts, the switch as asked. */
function world(access: TrickOrTreatConfig['access'] = 'all', admin = false): { data: GameData; area: Area } {
  const area: Area = { ...route, encounterWeights: { ...route.encounterWeights, trick: 1 } }
  const data: GameData = {
    ...base,
    areas: base.areas.map((a) => (a.id === route.id ? area : a)),
    config: {
      ...base.config,
      trickOrTreat: {
        ...CFG,
        access,
        areas: {
          [route.id]: [
            { dex: 92, tier: 'common' },
            { dex: 200, tier: 'veryRare' },
          ],
        },
      },
    },
    ...(admin && { viewer: { admin: true } }),
  } as GameData
  return { data, area }
}
const fixed = (values: number[]): Rng => {
  let i = 0
  const next = () => values[i++ % values.length]!
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(l: readonly T[]) => l[Math.floor(next() * l.length)]!,
    weighted: <T>(l: readonly T[], w: (x: T) => number) => l.find((x) => w(x) > 0),
    getState: () => 0,
  } as unknown as Rng
}

describe('the gauge', () => {
  it('cuts each tier into its sections and a flee zone', () => {
    expect(trickBand(CFG, 'common')).toEqual({
      flee: 90,
      zones: [
        { from: 0, to: 40, need: 6 },
        { from: 40, to: 75, need: 5 },
        { from: 75, to: 80, need: 4 },
        { from: 80, to: 90, need: 3 },
      ],
    })
    const band = trickBand(CFG, 'veryRare')
    expect(trickZoneAt(band, 39)?.zone.need).toBe(6)
    expect(trickZoneAt(band, 40)?.zone.need).toBe(5)
    expect(trickZoneAt(band, 55)).toBeNull()
  })

  it('cleans an odd admin value: unsorted, not from 0, past the flee zone', () => {
    const odd = {
      ...CFG,
      tiers: {
        ...CFG.tiers,
        rare: {
          weight: 1,
          flee: 70,
          sections: [
            { from: 40, need: 4 },
            { from: 20, need: 5 },
            { from: 80, need: 2 },
          ],
        },
      },
    }
    expect(trickBand(odd, 'rare').zones).toEqual([
      { from: 0, to: 20, need: 5 },
      { from: 20, to: 40, need: 5 },
      { from: 40, to: 70, need: 4 },
    ])
  })
})

describe('a Treat and a Trick Ball', () => {
  const s0: TrickState = startTrick({ dex: 92, level: 5, tier: 'common' })
  it('a Treat fills by its range; into the flee zone, it flees', () => {
    const lo = feedTreat(s0, CFG, fixed([0]))!
    expect([lo.amount, lo.to, lo.fled]).toEqual([10, 10, false])
    const hi = feedTreat({ ...s0, gauge: 70 }, CFG, fixed([0.999]))!
    expect([hi.amount, hi.to, hi.fled, hi.state.end]).toEqual([30, 100, true, 'fled'])
  })

  it('a Trick Ball rolls against its section; a miss pushes the gauge, maybe into the flee zone', () => {
    const six = throwTrickBall(s0, CFG, fixed([0.999]))!
    expect([six.die, six.need, six.caught, six.state.end, six.to]).toEqual([6, 6, true, 'caught', 0])
    const miss = throwTrickBall({ ...s0, gauge: 50 }, CFG, fixed([0.5]))!
    expect([miss.die, miss.need, miss.caught, miss.to, miss.fled]).toEqual([4, 5, false, 85, false])
    const out = throwTrickBall({ ...s0, gauge: 80 }, CFG, fixed([0]))!
    expect([out.die, out.need, out.fled, out.state.end]).toEqual([1, 3, true, 'fled'])
    expect(throwTrickBall(out.state, CFG, fixed([0.9]))).toBeNull()
  })
})

describe('the card', () => {
  it('is dealt only while switched on for the player, and only where the area has ghosts', () => {
    expect(trickDealable(world('off').data, route)).toBe(false)
    expect(trickDealable(world('admin').data, route)).toBe(false)
    expect(trickDealable(world('admin', true).data, route)).toBe(true)
    expect(trickDealable(world('all').data, route)).toBe(true)
    const { data, area } = world('all')
    expect(trickDealable(data, base.areas[1]!)).toBe(false)
    expect(deckCounts(area.encounterWeights, deckAbilities(area, data)).trick).toBe(1)
    expect(deckCounts(area.encounterWeights, deckAbilities(area, world('off').data)).trick).toBe(0)
  })

  it('brings one of the area’s ghosts at a level of its range, new or not', () => {
    const { data, area } = world('all')
    const save = newSave(1, data, 0, () => 'x')
    for (let seed = 1; seed < 40; seed++) {
      const roll = nextEncounter(
        {
          area,
          progress: { ...emptyProgress(), deck: ['wild', 'trick'] },
          data,
          teamAvgLevel: 5,
          teamHurt: false,
          isFirstInArea: false,
          pokedex: save.pokedex,
        },
        createRng(seed),
      )
      expect(roll.encounter.kind).toBe('trick')
      if (roll.encounter.kind !== 'trick') continue
      expect([92, 200]).toContain(roll.encounter.dex)
      expect(roll.encounter.tier).toBe(roll.encounter.dex === 92 ? 'common' : 'veryRare')
      expect(roll.encounter.level).toBeGreaterThanOrEqual(area.minLevel)
      expect(roll.encounter.level).toBeLessThanOrEqual(area.maxLevel)
      expect(roll.encounter.isNew).toBe(true)
    }
  })

  it('switched off, a Trick or Treat card left in a deck is discarded', () => {
    const { data, area } = world('off')
    const roll = nextEncounter(
      {
        area,
        progress: { ...emptyProgress(), deck: ['wild', 'trick'] },
        data,
        teamAvgLevel: 5,
        teamHurt: false,
        isFirstInArea: false,
        pokedex: [],
      },
      createRng(3),
    )
    expect(roll.encounter.kind).toBe('wild')
    expect(roll.drawn).toEqual(['trick', 'wild'])
  })

  it('prefills an area’s list from its ghost-type wild Pokémon, the tier from its weight', () => {
    const pool = (rows: [number, number][]) => ({
      wildPool: rows.map(([dex, weight], i) => ({ id: `${i}`, dex, weight, minLevel: 3, maxLevel: 5 })),
    })
    expect(
      ghostsFromWildPool(
        pool([
          [10, 30],
          [425, 6],
          [92, 5],
          [16, 30],
          [93, 12],
        ]),
        base,
      ),
    ).toEqual([
      { dex: 425, tier: 'rare' },
      { dex: 92, tier: 'veryRare' },
      { dex: 93, tier: 'common' },
    ])
  })
})

describe('the catch', () => {
  const { data } = world('all')
  const save = newSave(1, data, 0, () => 'starter')
  let n = 0
  const id = () => `id${++n}`
  it('joins the team when it has room, else the Box; new to the Pokédex', () => {
    const c = applyTrickCatch(
      save,
      data,
      { ...startTrick({ dex: 92, level: 6, tier: 'common' }), end: 'caught' },
      1,
      id,
    )
    expect([c.placed, c.isNew]).toEqual(['team', true])
    expect(c.save.pokedex).toContain(92)
    const full = { ...save, team: ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, data.config.maxTeamSize) }
    expect(applyTrickCatch(full, data, startTrick({ dex: 92, level: 6, tier: 'common' }), 1, id).placed).toBe(
      'box',
    )
  })

  it('a stronger one replaces your weakest copy; one as strong merges into yours', () => {
    const first = applyTrickCatch(save, data, startTrick({ dex: 92, level: 6, tier: 'common' }), 1, id).save
    const up = applyTrickCatch(first, data, startTrick({ dex: 92, level: 9, tier: 'common' }), 1, id)
    expect([up.placed, up.replacedLevel]).toEqual(['replaced', 6])
    const same = applyTrickCatch(up.save, data, startTrick({ dex: 92, level: 9, tier: 'common' }), 1, id)
    expect([same.placed, same.save]).toEqual(['merged', up.save])
  })

  it('its rules pop-up is due once, while it is switched on', () => {
    expect(trickRulesDue(save, world('off').data)).toBe(false)
    expect(trickRulesDue(save, data)).toBe(true)
    expect(trickRulesDue(markTrickRulesSeen(save), data)).toBe(false)
  })
})

// ---------------------------------------------------------------- balance (docs/28 §3)

type Play = (s: TrickState, ballAt: boolean[], rng: Rng) => 'treat' | 'ball'
const PLAYS: Record<string, Play> = {
  best: (s, ballAt) => (ballAt[s.gauge] ? 'ball' : 'treat'),
  ballsOnly: () => 'ball',
  treatsThenBalls: (s) =>
    trickZoneAt(trickBand(CFG, s.tier), s.gauge)!.index < trickBand(CFG, s.tier).zones.length - 1
      ? 'treat'
      : 'ball',
  oneTreatThenBalls: (s) => (s.treats < 1 ? 'treat' : 'ball'),
  twoTreatsThenBalls: (s) => (s.treats < 2 ? 'treat' : 'ball'),
  coinFlip: (_s, _b, rng) => (rng.next() < 0.5 ? 'treat' : 'ball'),
}

function monteCarlo(tier: TrickTier, play: Play, runs: number, seed: number): number {
  const rng = createRng(seed)
  const { ballAt } = trickBestPlay(CFG, tier)
  let caught = 0
  for (let r = 0; r < runs; r++) {
    let s = startTrick({ dex: 92, level: 5, tier })
    while (!s.end)
      s = (play(s, ballAt, rng) === 'ball' ? throwTrickBall(s, CFG, rng) : feedTreat(s, CFG, rng))!.state
    if (s.end === 'caught') caught++
  }
  return caught / runs
}

/** The measured rates, printed for docs/28 §3. */
const TABLE: Record<TrickTier, Record<string, number>> = { common: {}, rare: {}, veryRare: {} }

describe('balance', () => {
  const TARGET: Record<TrickTier, [number, number]> = {
    common: [0.7, 0.8],
    rare: [0.5, 0.6],
    veryRare: [0.3, 0.4],
  }
  for (const tier of TRICK_TIERS)
    it(`${tier}: best play lands in its band, and no simple play comes close`, () => {
      const exact = trickBestPlay(CFG, tier)
      for (const [name, play] of Object.entries(PLAYS))
        TABLE[tier][name] = monteCarlo(tier, play, 40_000, 7 + name.length)
      // The Monte Carlo agrees with the exact numbers.
      expect(Math.abs(TABLE[tier].best! - exact.best)).toBeLessThan(0.012)
      expect(Math.abs(TABLE[tier].ballsOnly! - exact.ballsOnly)).toBeLessThan(0.012)
      expect(Math.abs(TABLE[tier].treatsThenBalls! - exact.treatsThenBalls)).toBeLessThan(0.012)
      expect(exact.best).toBeGreaterThanOrEqual(TARGET[tier][0])
      expect(exact.best).toBeLessThanOrEqual(TARGET[tier][1])
      // Every simple play does clearly worse than the best one: the choices matter.
      for (const [name, rate] of Object.entries(TABLE[tier]))
        if (name !== 'best')
          expect([name, rate], `${tier} ${name}`).toSatisfy(
            ([, r]: [string, number]) => r <= exact.best - 0.04,
          )
      // The best play mixes both: Treats somewhere, Trick Balls somewhere.
      expect(exact.ballAt.some(Boolean) && exact.ballAt.some((b) => !b)).toBe(true)
      if (process.env.TRICK_TABLE)
        console.log(
          tier,
          JSON.stringify(TABLE[tier]),
          JSON.stringify({ exact: exact.best, balls: exact.ballsOnly, mixed: exact.treatsThenBalls }),
        )
    })
})
