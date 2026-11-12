// Type Rush (docs/71 §3): its defaults, the week's type of a rotation, what each quest counts and only while it runs,
// the cards' order and chained steps, validating (points, then the gauge's rewards, once), the last pop-up after the
// end, the boost on the player's attacks of its type, a fight's facts, and the admin's checks.
import { describe, expect, it } from 'vitest'
import {
  computeDamage,
  countRush,
  defaultRushGauge,
  liveProblems,
  newLiveEvent,
  newSave,
  normaliseLiveEvent,
  rushBoost,
  rushCards,
  rushFightFacts,
  rushPending,
  rushProgressOf,
  rushToSettle,
  rushTotalPoints,
  rushType,
  uniformLevels,
  validateRush,
  withRush,
  type LiveEvent,
  type LogEntry,
  type RushFact,
  type SaveData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const T0 = Date.parse('2027-03-10T12:00:00Z')
const START = new Date(T0 - DAY).toISOString()
const END = new Date(T0 + 2 * DAY).toISOString()

const rush = (patch: Partial<LiveEvent> = {}): LiveEvent => ({
  ...newLiveEvent('fire-rush', START, END),
  type: 'rush',
  minBadges: 0,
  ...patch,
})
const FIRE = rush()
const save0 = (): SaveData => newSave(4, data, 0, newId)
const fire: RushFact['types'] = ['fire']
const facts = (kind: RushFact['kind'], n: number, extra: Partial<RushFact> = {}): RushFact[] =>
  Array.from({ length: n }, () => ({ kind, types: fire, ...extra }))
const count = (s: SaveData, f: RushFact[], e = FIRE) => countRush(s, [e], f, T0)

describe('Type Rush: its defaults', () => {
  it('Fire, +20 %, seven quests paying 330 points, five rewards, the last a Pokémon of the type with its talent', () => {
    expect(FIRE.rush.type).toBe('fire')
    expect(FIRE.rush.boost).toBe(1.2)
    expect(FIRE.rush.quests.map((q) => q.kind)).toEqual([
      'catch',
      'ko',
      'evolve',
      'damage',
      'hatch',
      'combo',
      'raid',
    ])
    expect(rushTotalPoints(FIRE)).toBe(330)
    expect(FIRE.rush.gauge.map((g) => g.at)).toEqual([50, 100, 175, 250, 300])
    expect(defaultRushGauge('water').at(-1)?.reward).toEqual({
      kind: 'pokemon',
      dex: 7,
      level: 30,
      talent: true,
      qty: 1,
    })
  })

  it('an older row gets them, and its picture is the type’s gym stage', async () => {
    const { rush: _gone, ...old } = FIRE
    expect(normaliseLiveEvent(old).rush.quests).toHaveLength(7)
    const { liveDefaultBanner } = await import('@/engine')
    expect(liveDefaultBanner(rush({ rush: { ...FIRE.rush, type: 'water' } }))).toBe('gym-water')
  })

  it('a rotation gives each week its type, in order', () => {
    const e = rush({ rush: { ...FIRE.rush, rotate: ['fire', 'water', 'grass'] } })
    const at = (ms: number) => rushType({ ...e, start: new Date(ms).toISOString() })
    const types = [0, 1, 2, 3].map((w) => at(T0 + w * 7 * DAY))
    expect(new Set(types.slice(0, 3)).size).toBe(3)
    expect(types[3]).toBe(types[0])
  })
})

describe('Type Rush: what counts', () => {
  it('a fact of the type counts; another type, or a Pokémon of neither, doesn’t', () => {
    let s = count(save0(), facts('catch', 2))
    s = count(s, [{ kind: 'catch', types: ['water'] }])
    s = count(s, [{ kind: 'catch', types: ['water', 'fire'] }])
    expect(rushProgressOf(s, FIRE).counts.catch).toBe(3)
  })

  it('damage counts its amount; a combo quest of one combo counts only that one', () => {
    const only = rush({
      rush: {
        ...FIRE.rush,
        quests: [
          { id: 'fh', kind: 'combo', combo: 'full_house', steps: [{ target: 2, points: 10 }] },
          FIRE.rush.quests[3]!,
        ],
      },
    })
    const s = countRush(
      save0(),
      [only],
      [
        { kind: 'damage', types: fire, amount: 120 },
        { kind: 'damage', types: fire, amount: 80 },
        { kind: 'combo', types: fire, combo: 'pair' },
        { kind: 'combo', types: fire, combo: 'full_house' },
      ],
      T0,
    )
    expect(rushProgressOf(s, only).counts).toEqual({ damage: 200, fh: 1 })
  })

  it('nothing counts without a Type Rush running: the same save', () => {
    const s = save0()
    expect(countRush(s, [], facts('catch', 3), T0)).toBe(s)
  })
})

describe('Type Rush: the cards', () => {
  it('one step at a time, the counter kept: 12 catches show 12 / 5 ready, then 12 / 20 once validated', () => {
    let s = count(save0(), facts('catch', 12))
    const card = () => rushCards(s, FIRE).find((c) => c.quest.id === 'catch')!
    expect(card()).toMatchObject({ step: 0, count: 12, target: 5, ready: true })
    expect(rushPending(s, FIRE)).toBe(true)
    s = validateRush(s, data, FIRE, T0, newId)!.save
    expect(card()).toMatchObject({ step: 2, count: 12, target: 20, ready: false })
  })

  it('ready ones and the closest to done come first; finished ones sink', () => {
    let s = count(save0(), [...facts('ko', 9), ...facts('evolve', 1), ...facts('hatch', 3)])
    s = validateRush(s, data, FIRE, T0, newId)!.save
    const order = rushCards(s, FIRE).map((c) => c.quest.id)
    expect(order[0]).toBe('ko')
    expect(order.at(-1)).toBe('hatch')
    expect(rushCards(s, FIRE).at(-1)?.finished).toBe(true)
  })
})

describe('Type Rush: validating', () => {
  it('pays every step reached, then gives every reward the points reach, once', () => {
    const before = save0()
    // Catch 20 (10 + 15 + 25 = 50 points) and K.O. 10 (10): 60 points, the first reward (10 Poké Balls).
    const s = count(before, [...facts('catch', 20), ...facts('ko', 10)])
    const v = validateRush(s, data, FIRE, T0, newId)!
    expect(v.ticks.map((t) => `${t.questId}:${t.step}`)).toEqual(['catch:0', 'catch:1', 'catch:2', 'ko:0'])
    expect([v.before, v.after]).toEqual([0, 60])
    expect(v.rewards.map((r) => r.row.at)).toEqual([50])
    expect(v.save.inventory['poke-ball'] ?? 0).toBe((before.inventory['poke-ball'] ?? 0) + 10)
    expect(rushPending(v.save, FIRE)).toBe(false)
    expect(validateRush(v.save, data, FIRE, T0, newId)).toBeNull()
  })

  /** A Type Rush whose only reward, at 10 points, is this Pokémon. */
  const monRush = (dex: number, level: number) =>
    rush({
      rush: {
        ...FIRE.rush,
        gauge: [{ at: 10, reward: { kind: 'pokemon', dex, level, talent: true, qty: 1 } }],
      },
    })

  it('a reward Pokémon goes to its own region, locked until one there reaches its level (docs/71 §5)', () => {
    const d = makeData({ hiddenTalents: { access: 'all', wildChance: 0, evolveChance: 0, families: {} } })
    // A Lv.30 Charmander for a Kanto player whose best is Lv.5: it waits in Kanto, with its talent.
    const one = monRush(4, 30)
    const v = validateRush(countRush(save0(), [one], facts('ko', 10), T0), d, one, T0, newId)!
    expect(v.save.box.some((p) => p.level === 30)).toBe(false)
    expect(v.save.events?.worldHome?.map((h) => [h.region, h.inst.dex, h.inst.talent, h.reward])).toEqual([
      ['kanto', 4, true, true],
    ])
    expect(v.rewards[0]!.landed[0]).toMatchObject({ region: 'kanto', locked: true })
  })

  it('with one of the player’s Pokémon there at its level, it arrives at once', () => {
    const base = save0()
    const strong = { ...base, box: base.box.map((p) => ({ ...p, level: 40 })) }
    const one = monRush(25, 30)
    const v = validateRush(countRush(strong, [one], facts('ko', 10), T0), data, one, T0, newId)!
    expect(v.save.box.some((p) => p.dex === 25 && p.level === 30)).toBe(true)
    expect(v.save.events?.worldHome ?? []).toEqual([])
    expect(v.rewards[0]!.landed[0]!.locked).toBeUndefined()
  })

  it('from a region not started yet (Lucario, Sinnoh), it waits there', () => {
    const one = monRush(448, 5)
    const v = validateRush(countRush(save0(), [one], facts('ko', 10), T0), data, one, T0, newId)!
    expect(v.save.events?.worldHome?.map((h) => h.region)).toEqual(['sinnoh'])
    expect(v.rewards[0]!.landed[0]).toMatchObject({ region: 'sinnoh', locked: true })
  })
})

describe('Type Rush: after its end', () => {
  it('a step done in time and never validated waits for its last pop-up; a validated one doesn’t', () => {
    const d = makeData({ liveEvents: { access: 'all', list: [FIRE] } })
    const s = count(save0(), facts('catch', 5))
    const after = Date.parse(END) + HOUR
    expect(rushToSettle(s, d, after).map((e) => e.id)).toEqual(['fire-rush'])
    expect(rushToSettle(s, d, T0)).toEqual([])
    const done = validateRush(s, d, FIRE, after, newId)!.save
    expect(rushToSettle(done, d, after)).toEqual([])
  })
})

describe('Type Rush: the boost', () => {
  const tackle = [
    { type: 'fire' as const, face: 6 },
    { type: 'fire' as const, face: 5 },
  ]

  it('× its boost on the player’s attacks of its type, shown in the recap; another type untouched', () => {
    const levels = withRush(uniformLevels(1), [FIRE])
    expect(rushBoost([FIRE])).toEqual({ type: 'fire', multiplier: 1.2 })
    const dice = tackle.map((d) => ({ ...d, id: `${d.face}` })) as never
    const plain = computeDamage(dice, ['fire'], ['normal'], uniformLevels(1), data)
    const boosted = computeDamage(dice, ['fire'], ['normal'], levels, data)
    expect(boosted.final).toBe(Math.round(plain.final * 1.2))
    expect(boosted.rush).toEqual({ type: 'fire', multiplier: 1.2 })
    const water = withRush(uniformLevels(1), [rush({ rush: { ...FIRE.rush, type: 'water' } })])
    expect(computeDamage(dice, ['fire'], ['normal'], water, data).final).toBe(plain.final)
  })
})

describe('Type Rush: a fight’s facts', () => {
  it('the player’s hits, combos and K.O.s, for the Pokémon in front; a foe’s hits count nothing', () => {
    const result = { combo: { key: 'pair' } } as never
    const log: LogEntry[] = [
      {
        kind: 'damage',
        side: 'player',
        target: 'enemy',
        targetUid: 'e',
        amount: 30,
        hpAfter: 0,
        dice: [],
        result,
      },
      { kind: 'faint', side: 'enemy', uid: 'e', dex: 19 },
      {
        kind: 'damage',
        side: 'enemy',
        target: 'player',
        targetUid: 'p1',
        amount: 9,
        hpAfter: 1,
        dice: [],
        result: {} as never,
      },
      { kind: 'turn', side: 'player', turn: 2, uid: 'p2' },
      {
        kind: 'damage',
        side: 'player',
        target: 'enemy',
        targetUid: 'e2',
        amount: 5,
        hpAfter: 3,
        dice: [],
        result: {} as never,
      },
    ]
    const out = rushFightFacts(log, 'p1', { p1: 4, p2: 7 }, data)
    expect(out).toEqual([
      { kind: 'damage', types: ['fire'], amount: 30 },
      { kind: 'combo', types: ['fire'], combo: 'pair' },
      { kind: 'ko', types: ['fire'] },
      { kind: 'damage', types: ['water'], amount: 5 },
    ])
  })
})

describe('Type Rush: the admin’s checks', () => {
  it('one Type Rush at a time; a last reward beyond what the quests pay is refused', () => {
    const other = rush({ id: 'water-rush' })
    expect(liveProblems([FIRE, other], other, data, T0).join(' ')).toMatch(/overlaps another Type Rush/)
    const far = rush({ rush: { ...FIRE.rush, gauge: [{ at: 999, reward: { kind: 'gold', amount: 1 } }] } })
    expect(liveProblems([far], far, data, T0).join(' ')).toMatch(/needs 999 points; the quests pay 330/)
    expect(liveProblems([FIRE], FIRE, data, T0)).toEqual([])
  })
})
