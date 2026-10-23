// The Underground (docs/34): a live event type. Explorakits open walls; a strike rolls the pickaxe die and takes that
// many layers off a tile (one fewer off its neighbours); a thing is won once every tile of it is dug out. Orbs go to
// whoever holds their colour and sell in full only in a full team (a tenth outside one); plates let the player's
// Arceus take their type.
import { describe, expect, it } from 'vitest'
import {
  ARCEUS_DEX,
  DEFAULT_CONFIG,
  applyHaul,
  buyKits,
  canSell,
  choiceFormsOf,
  createBattle,
  createRng,
  dealWall,
  formChoices,
  freshUnderground,
  kitsHeld,
  kitsLeftToBuy,
  lockedTypeForms,
  markUgRulesSeen,
  newLiveEvent,
  newSave,
  nextPickaxe,
  openWall,
  orbsValue,
  pickaxeFaces,
  plateTypes,
  reduce,
  regionOfSpecies,
  sellOrbs,
  sellValue,
  settleUnderground,
  strike,
  strikeWall,
  thingDone,
  thingTiles,
  ugRulesDue,
  undergroundLive,
  uniformLevels,
  upgradePickaxe,
  wallHaul,
  wallStatus,
  wallYield,
  type EventAccess,
  type GameData,
  type LiveEvent,
  type SaveData,
  type UgTeam,
  type UndergroundConfig,
  type Wall,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { data as base, makeData, newId } from '../fixtures'

const T0 = Date.parse('2026-11-01T18:00:00.000Z')
const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const UG = DEFAULT_CONFIG.underground

const ugEvent = (over: Partial<LiveEvent> = {}): LiveEvent => ({
  ...newLiveEvent('ug1', iso(T0), iso(T0 + 72 * H)),
  type: 'underground',
  minBadges: 0,
  ...over,
})
function world(
  opts: { access?: EventAccess; list?: LiveEvent[]; cfg?: Partial<UndergroundConfig> } = {},
): GameData {
  return makeData({
    liveEvents: { access: 'all', list: opts.list ?? [ugEvent()] },
    underground: { ...UG, access: opts.access ?? 'all', ...opts.cfg },
  })
}
const data = world()
const fresh = (): SaveData => newSave(4, data, 0, newId)
/** A save inside the event at T0: its block dealt, `gold` ₽ in the purse. */
const inEvent = (gold = 100_000, d = data): SaveData => settleUnderground({ ...fresh(), gold }, d, T0)

/** A hand-made wall: 3 × 3, every tile `depth` deep, the given things. */
function wall(things: Wall['things'], depth = 1, over: Partial<Wall> = {}): Wall {
  return {
    id: 'ug1:1',
    cols: 3,
    rows: 3,
    depth: new Array(9).fill(depth),
    things,
    strikes: 10,
    used: 0,
    neighbourLoss: 1,
    ...over,
  }
}
const dig = (w: Wall): Wall => ({ ...w, depth: w.depth.map(() => 0) })
const withWall = (save: SaveData, w: Wall): SaveData => ({
  ...save,
  underground: { ...save.underground!, wall: w },
})

describe('when the Underground runs', () => {
  it('runs for an underground live event with the switch on, from its badges, outside Extreme mode', () => {
    expect(undergroundLive(fresh(), data, T0)?.id).toBe('ug1')
    expect(undergroundLive(fresh(), data, T0 - 1)).toBeNull()
    expect(undergroundLive(fresh(), data, T0 + 72 * H)).toBeNull()
    expect(undergroundLive(fresh(), data, null)).toBeNull()
    expect(undergroundLive(fresh(), world({ access: 'off' }), T0)).toBeNull()
    expect(undergroundLive(fresh(), world({ list: [ugEvent({ type: 'shop' })] }), T0)).toBeNull()
    expect(undergroundLive(fresh(), world({ list: [ugEvent({ minBadges: 3 })] }), T0)).toBeNull()
    expect(undergroundLive({ ...fresh(), mode: 'extreme' }, data, T0)).toBeNull()
  })

  it('the admin-only switch opens it for the admin alone', () => {
    const d = world({ access: 'admin' })
    expect(undergroundLive(fresh(), d, T0)).toBeNull()
    expect(undergroundLive(fresh(), { ...d, viewer: { admin: true } }, T0)).not.toBeNull()
  })
})

describe('Explorakits', () => {
  it('a new event starts with the free kits at their cap and nothing else', () => {
    const s = inEvent()
    expect(s.underground).toEqual(freshUnderground('ug1', UG))
    expect(kitsHeld(s.underground)).toBe(3)
    expect(settleUnderground(s, data, T0 + H)).toBe(s)
  })

  it('a spent free kit comes back one at a time, every 24 h / 3, up to the cap', () => {
    let s = inEvent()
    for (let i = 0; i < 3; i++) s = closeWall(openWall(s, data, T0, createRng(i))!)
    expect(s.underground!.freeKits).toBe(0)
    expect(s.underground!.freeAt).toBe(T0 + 8 * H)
    expect(settleUnderground(s, data, T0 + 8 * H - 1).underground!.freeKits).toBe(0)
    expect(settleUnderground(s, data, T0 + 8 * H).underground!.freeKits).toBe(1)
    const later = settleUnderground(s, data, T0 + 30 * H).underground!
    expect(later.freeKits).toBe(3)
    expect(later.freeAt).toBeNull()
  })

  it('buys kits at the Mart price, within the limit and the purse', () => {
    const s = inEvent(5_000)
    const b = buyKits(s, data, T0, 2)!
    expect(b.gold).toBe(5_000 - 2 * UG.kits.price)
    expect(b.underground!.boughtKits).toBe(2)
    expect(kitsLeftToBuy(b.underground, UG)).toBe(UG.kits.limit! - 2)
    expect(buyKits(s, data, T0, 6)).toBeNull()
    expect(buyKits(inEvent(), data, T0, UG.kits.limit! + 1)).toBeNull()
    expect(buyKits(inEvent(), world({ cfg: { kits: { ...UG.kits, limit: 0 } } }), T0, 50)).not.toBeNull()
    expect(buyKits(s, data, T0 + 72 * H, 1)).toBeNull()
  })

  it('opening a wall spends a free kit first, then a bought one; one wall at a time', () => {
    const s = { ...inEvent(), underground: { ...inEvent().underground!, freeKits: 1, boughtKits: 1 } }
    const a = openWall(s, data, T0, createRng(1))!
    expect(a.underground!.freeKits).toBe(0)
    expect(a.underground!.boughtKits).toBe(1)
    expect(a.underground!.wall!.id).toBe('ug1:1')
    expect(openWall(a, data, T0, createRng(1))).toBeNull()
    const b = openWall(closeWall(a), data, T0, createRng(2))!
    expect(b.underground!.boughtKits).toBe(0)
    expect(b.underground!.wall!.id).toBe('ug1:2')
    expect(openWall(closeWall(b), data, T0, createRng(3))).toBeNull()
  })
})

/** The wall's haul applied, as the dig screen does at the end (digging it out first if needed). */
function closeWall(s: SaveData): SaveData {
  const w = s.underground!.wall!
  const done = withWall(s, wallStatus(w) === 'digging' ? { ...w, used: w.strikes } : w)
  return applyHaul(done, data, null, T0, newId)!.save
}

describe('dealing a wall', () => {
  it('places 2–4 things inside the wall without overlaps, layers 1 to 3', () => {
    const s = inEvent()
    const rng = createRng(7)
    for (let k = 0; k < 300; k++) {
      const w = dealWall(s, data, `w${k}`, rng)
      expect(w.cols * w.rows).toBe(36)
      expect(w.depth.every((d) => d >= 1 && d <= 3)).toBe(true)
      expect(w.things.length).toBeGreaterThanOrEqual(2)
      expect(w.things.length).toBeLessThanOrEqual(4)
      const seen = new Set<number>()
      for (const t of w.things) {
        expect(t.x + t.w).toBeLessThanOrEqual(w.cols)
        expect(t.y + t.h).toBeLessThanOrEqual(w.rows)
        for (const i of thingTiles(w, t)) {
          expect(seen.has(i)).toBe(false)
          seen.add(i)
        }
      }
    }
  })

  it('layers follow the admin’s shares', () => {
    const d = world({ cfg: { wall: { ...UG.wall, layers: [0, 0, 1] } } })
    const w = dealWall(inEvent(100, d), d, 'w', createRng(1))
    expect(w.depth.every((x) => x === 3)).toBe(true)
  })

  it('never buries a plate the player holds, nor the same plate twice; fossils only from regions opened', () => {
    const d = world({
      cfg: { loot: { ...UG.loot, weights: { orbS: 0, orbM: 0, orbL: 0, fossil: 1, plate: 1 } } },
    })
    const s = { ...inEvent(100, d), plates: ['fire', 'water'] as SaveData['plates'] }
    const rng = createRng(3)
    for (let k = 0; k < 200; k++) {
      const w = dealWall(s, d, `w${k}`, rng)
      const plates = w.things.filter((t) => t.kind === 'plate').map((t) => t.plate)
      expect(plates).not.toContain('fire')
      expect(plates).not.toContain('water')
      expect(new Set(plates).size).toBe(plates.length)
      for (const t of w.things.filter((x) => x.kind === 'fossil')) {
        const item = d.items[t.item!]!
        expect(item.effect.kind).toBe('fossil')
        expect(regionOfSpecies(d, (item.effect as { dex: number }).dex)).toBe('kanto')
      }
    }
  })

  it('with every plate held, plates give way to the other things', () => {
    const d = world({
      cfg: { loot: { ...UG.loot, weights: { orbS: 1, orbM: 0, orbL: 0, fossil: 0, plate: 1000 } } },
    })
    const all = choiceFormsOf(d, ARCEUS_DEX).map((f) => f.type1)
    const w = dealWall({ ...inEvent(100, d), plates: all }, d, 'w', createRng(1))
    expect(w.things.every((t) => t.kind === 'orbS')).toBe(true)
  })
})

describe('digging', () => {
  it('a strike takes the roll off the tile and the roll − 1 off its neighbours, never below 0', () => {
    const w = wall([{ kind: 'orbS', x: 0, y: 0, w: 1, h: 1, colour: 'red' }], 3)
    const a = strikeWall(w, 4, 2)
    expect(a.depth).toEqual([3, 2, 3, 2, 1, 2, 3, 2, 3])
    expect(a.used).toBe(1)
    const b = strikeWall(a, 4, 3)
    expect(b.depth).toEqual([3, 0, 3, 0, 0, 0, 3, 0, 3])
    // A 1 touches the tile only; a corner has two neighbours.
    expect(strikeWall(w, 0, 1).depth).toEqual([2, 3, 3, 3, 3, 3, 3, 3, 3])
    expect(strikeWall(w, 0, 3).depth).toEqual([0, 1, 3, 1, 3, 3, 3, 3, 3])
    // A dug-out tile can't be struck.
    expect(strikeWall(b, 4, 2)).toBe(b)
  })

  it('a thing is won once every tile of it is dug out; the wall ends cleared or collapsed', () => {
    const t = { kind: 'orbM' as const, x: 0, y: 0, w: 2, h: 1, colour: 'blue' as const }
    let w = wall([t], 1, { strikes: 2 })
    w = strikeWall(w, 0, 1)
    expect(thingDone(w, t)).toBe(false)
    expect(wallStatus(w)).toBe('digging')
    w = strikeWall(w, 1, 1)
    expect(wallStatus(w)).toBe('cleared')
    const short = strikeWall(strikeWall(wall([t], 2, { strikes: 2 }), 0, 1), 1, 1)
    expect(wallStatus(short)).toBe('collapsed')
    expect(strikeWall(short, 0, 1)).toBe(short)
  })

  it('strike rolls the pickaxe die at the player’s level', () => {
    const s = withWall(inEvent(), wall([{ kind: 'orbS', x: 2, y: 2, w: 1, h: 1, colour: 'red' }], 3))
    const top = { ...s, underground: { ...s.underground!, pickaxe: 8 } }
    for (let i = 0; i < 30; i++) {
      const r = strike(top, data, 4, createRng(i))!
      expect([2, 3]).toContain(r.roll)
      expect(pickaxeFaces(UG, 8)[r.face]).toBe(r.roll)
      expect(r.save.underground!.wall!.depth[4]).toBe(3 - r.roll)
    }
    expect(strike(inEvent(), data, 0, createRng(1))).toBeNull()
  })
})

describe('the haul', () => {
  const things: Wall['things'] = [
    { kind: 'orbL', x: 0, y: 0, w: 2, h: 2, colour: 'red' },
    { kind: 'orbS', x: 2, y: 0, w: 1, h: 1, colour: 'blue' },
    { kind: 'orbS', x: 2, y: 1, w: 1, h: 1, colour: 'green' },
    { kind: 'plate', x: 0, y: 2, w: 2, h: 1, plate: 'fire' },
    { kind: 'fossil', x: 2, y: 2, w: 1, h: 1, item: 'helix-fossil' },
  ]
  const team3: UgTeam = {
    me: 'red',
    seats: {
      red: { id: 'me', name: 'Lucas' },
      blue: { id: 'u2', name: 'Dawn' },
      green: { id: 'u3', name: 'Barry' },
    },
  }
  const team2: UgTeam = {
    me: 'red',
    seats: { red: { id: 'me', name: 'Lucas' }, blue: { id: 'u2', name: 'Dawn' } },
  }

  it('solo, every orb goes to the bag; a plate is kept, a fossil goes to the Box reviving', () => {
    const s = withWall(inEvent(), dig(wall(things)))
    const boxBefore = s.box.length
    const r = applyHaul(s, data, null, T0, newId)!
    expect(r.lines.map((l) => l.outcome)).toEqual(['bag', 'bag', 'bag', 'plate', 'box'])
    expect(r.sent).toEqual([])
    expect(r.save.underground!.bag).toEqual({
      red: { s: 0, m: 0, l: 1 },
      blue: { s: 1, m: 0, l: 0 },
      green: { s: 1, m: 0, l: 0 },
    })
    expect(r.save.plates).toEqual(['fire'])
    expect(r.save.box.length).toBe(boxBefore + 1)
    expect(r.save.box.at(-1)!.revivesAt).toBeGreaterThan(T0)
    expect(r.save.underground!.wall).toBeNull()
    expect(r.save.underground!.hauls).toEqual(['ug1:1'])
  })

  it('in a team, a teammate’s colour is sent to them; a colour nobody holds stays', () => {
    expect(wallHaul(dig(wall(things)), team3).map((l) => l.outcome)).toEqual([
      'bag',
      'sent',
      'sent',
      'plate',
      'box',
    ])
    const r = applyHaul(withWall(inEvent(), dig(wall(things))), data, team2, T0, newId)!
    expect(r.sent).toEqual([{ colour: 'blue', size: 's', to: 'u2' }])
    expect(r.save.underground!.bag.green.s).toBe(1)
    expect(r.save.underground!.bag.blue.s).toBe(0)
  })

  it('things not fully dug out are lost; a wall still being dug has no haul', () => {
    const half = { ...dig(wall(things)), used: 10 }
    half.depth[0] = 1
    expect(wallHaul(half, null)[0]!.outcome).toBe('lost')
    expect(applyHaul(withWall(inEvent(), wall(things)), data, null, T0, newId)).toBeNull()
  })

  it('a haul is applied once', () => {
    const s = withWall(inEvent(), dig(wall(things)))
    const once = applyHaul(s, data, null, T0, newId)!.save
    const again = applyHaul(withWall(once, dig(wall(things))), data, null, T0, newId)!.save
    expect(again.underground!.bag).toEqual(once.underground!.bag)
    expect(again.plates).toEqual(['fire'])
  })
})

describe('selling and the pickaxe', () => {
  const full: UgTeam = {
    me: 'red',
    seats: { red: { id: 'a', name: 'A' }, blue: { id: 'b', name: 'B' }, green: { id: 'c', name: 'C' } },
  }
  const withOrbs = (): SaveData => {
    const s = inEvent(0)
    return {
      ...s,
      underground: {
        ...s.underground!,
        bag: { red: { s: 2, m: 1, l: 0 }, blue: { s: 0, m: 0, l: 1 }, green: { s: 0, m: 0, l: 0 } },
      },
    }
  }

  it('orbs sell at the admin’s prices in a full team, for a tenth outside one', () => {
    const s = withOrbs()
    expect(orbsValue(s.underground!.bag, UG)).toBe(2 * 100 + 300 + 800)
    const sold = sellOrbs(s, data, T0, full)!
    expect(sold.gold).toBe(1300)
    expect(sold.underground!.bag.red.s).toBe(0)
    // Solo, or in a team of two: a tenth of the price, rounded down.
    expect(canSell(s, data, null)).toBe(true)
    expect(sellValue(s.underground!.bag, UG, false)).toBe(130)
    expect(sellOrbs(s, data, T0, null)!.gold).toBe(130)
    expect(sellOrbs(s, data, T0, { ...full, seats: { red: full.seats.red } })!.gold).toBe(130)
    expect(sellOrbs(s, world({ cfg: { soloShare: 25 } }), T0, null)!.gold).toBe(325)
    // A solo share of 0: nothing sells until the team is full.
    const closed = world({ cfg: { soloShare: 0 } })
    expect(canSell(s, closed, null)).toBe(false)
    expect(sellOrbs(s, closed, T0, null)).toBeNull()
    expect(sellOrbs(s, closed, T0, full)!.gold).toBe(1300)
    // Without the full-team rule, a solo player sells at full price.
    expect(sellOrbs(s, world({ cfg: { sellNeedsFull: false } }), T0, null)!.gold).toBe(1300)
  })

  it('the pickaxe climbs its 8 levels for ₽, each raising one face', () => {
    let s = inEvent(1_000_000)
    expect(pickaxeFaces(UG, 0)).toEqual([1, 1, 1, 1, 1, 2])
    for (let level = 1; level <= 8; level++) {
      const next = nextPickaxe(UG, level - 1)!
      const sum = (f: number[]) => f.reduce((a, b) => a + b, 0)
      expect(sum(next.faces) - sum(pickaxeFaces(UG, level - 1))).toBe(1)
      const up = upgradePickaxe(s, data, T0)!
      expect(up.gold).toBe(s.gold - next.price)
      s = up
    }
    expect(pickaxeFaces(UG, 8)).toEqual([2, 2, 2, 3, 3, 3])
    expect(nextPickaxe(UG, 8)).toBeNull()
    expect(upgradePickaxe(s, data, T0)).toBeNull()
    expect(upgradePickaxe(inEvent(0), data, T0)).toBeNull()
  })
})

describe('the end of the event', () => {
  it('kits, orbs, the pickaxe and the wall go; plates and fossils stay', () => {
    const s = { ...withWall(inEvent(), wall([])), plates: ['fire'] as SaveData['plates'] }
    expect(settleUnderground(s, data, T0 + 71 * H).underground).toBeDefined()
    const after = settleUnderground(s, data, T0 + 72 * H)
    expect(after.underground).toBeUndefined()
    expect(after.plates).toEqual(['fire'])
  })

  it('a new event starts afresh, the pickaxe back at 0', () => {
    const next = ugEvent({ id: 'ug2', start: iso(T0 + 100 * H), end: iso(T0 + 172 * H) })
    const d = world({ list: [ugEvent(), next] })
    const s = { ...inEvent(0, d), underground: { ...inEvent(0, d).underground!, pickaxe: 5, boughtKits: 4 } }
    const u = settleUnderground(s, d, T0 + 101 * H).underground!
    expect(u.eventId).toBe('ug2')
    expect(u.pickaxe).toBe(0)
    expect(u.boughtKits).toBe(0)
  })

  it('switched off, or with the time unknown, nothing is touched', () => {
    const s = inEvent()
    expect(settleUnderground(s, world({ access: 'off' }), T0 + 100 * H)).toBe(s)
    expect(settleUnderground(s, data, null)).toBe(s)
  })
})

describe('the rules pop-up', () => {
  it('once per event', () => {
    const s = inEvent()
    expect(ugRulesDue(s, data, T0)).toBe(true)
    expect(ugRulesDue(markUgRulesSeen(s), data, T0)).toBe(false)
    expect(ugRulesDue(s, world({ access: 'off' }), T0)).toBe(false)
  })
})

describe('Arceus and the plates', () => {
  const arceus = (plates?: SaveData['plates']) =>
    createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: ARCEUS_DEX, level: 80, hp: 9999 }],
        leadUid: 'a',
        enemy: { dex: 94, level: 60 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        ...(plates && { plates }),
      },
      base,
    ).state
  const turn = (s: ReturnType<typeof arceus>) => ({
    ...s,
    phase: 'player_roll' as const,
    actor: 'player' as const,
  })

  it('only with the Underground on: off, Arceus changes type freely', () => {
    expect(plateTypes({ ...fresh(), plates: ['fire'] }, world({ access: 'off' }))).toBeUndefined()
    expect(plateTypes({ ...fresh(), plates: ['fire'] }, data)).toEqual(['fire'])
    expect(plateTypes(fresh(), data)).toEqual([])
  })

  it('the player’s Arceus takes only the types of the plates held', () => {
    const all = choiceFormsOf(base, ARCEUS_DEX).length
    expect(formChoices(turn(arceus()), base)).toHaveLength(all)
    expect(formChoices(turn(arceus([])), base)).toHaveLength(0)
    expect(lockedTypeForms(turn(arceus([])), base)).toHaveLength(all)
    const two = formChoices(turn(arceus(['fire', 'steel'])), base)
    expect(two.map((f) => f.type1).sort()).toEqual(['fire', 'steel'])
    expect(lockedTypeForms(turn(arceus(['fire', 'steel'])), base)).toHaveLength(all - 2)
  })

  it('a foe Arceus still takes any type', () => {
    let s = createBattle(
      {
        kind: 'boss',
        team: [{ uid: 'a', dex: 94, level: 60, hp: 9999 }],
        enemy: { dex: ARCEUS_DEX, level: 80 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        enemyPlan: { formChanges: true },
        plates: [],
      },
      base,
    ).state
    s = { ...s, phase: 'enemy_turn', actor: 'enemy' }
    const r = reduce(s, { t: 'AI_TURN' }, base, createRng(1))
    expect(r.log.some((l) => l.kind === 'form' && l.reason === 'choice')).toBe(true)
  })
})

describe('the save and the yield', () => {
  it('a save with its Underground block and plates survives a round trip', () => {
    const s = { ...openWall(inEvent(), data, T0, createRng(5))!, plates: ['dragon'] as SaveData['plates'] }
    const back = parseSave(JSON.parse(JSON.stringify(s)))
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(back.save.underground).toEqual(s.underground)
      expect(back.save.plates).toEqual(['dragon'])
    }
  })

  it('a better pickaxe digs out more', () => {
    const low = wallYield(UG, 0, 300, createRng(1))
    const high = wallYield(UG, 8, 300, createRng(1))
    expect(high.won).toBeGreaterThan(low.won)
    expect(high.orbGold).toBeGreaterThan(low.orbGold)
    expect(high.cleared).toBeGreaterThan(low.cleared)
  })
})

describe('orbs from teammates', () => {
  it('land in the bag once per delivery', async () => {
    const { receiveOrbs, clearOutbox } = await import('@/engine')
    const s = inEvent()
    const gift = { id: 'g1', orbs: [{ colour: 'blue' as const, size: 'l' as const }] }
    const once = receiveOrbs(s, [gift])
    expect(once.underground!.bag.blue.l).toBe(1)
    expect(receiveOrbs(once, [gift])).toBe(once)
    expect(
      receiveOrbs(once, [gift, { id: 'g2', orbs: [{ colour: 'red', size: 's' }] }]).underground!.bag.red.s,
    ).toBe(1)
    // The outbox empties as the server takes each wall.
    const owed = {
      ...s,
      underground: {
        ...s.underground!,
        outbox: [
          { wallId: 'w1', orbs: [] },
          { wallId: 'w2', orbs: [] },
        ],
      },
    }
    expect(clearOutbox(owed, ['w1']).underground!.outbox).toEqual([{ wallId: 'w2', orbs: [] }])
  })
})
