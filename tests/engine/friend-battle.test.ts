import { describe, expect, it } from 'vitest'
import {
  applyPvpMove,
  createRng,
  draftAutoPick,
  draftChoices,
  draftOrder,
  draftTurn,
  eventOpenTo,
  flipEntry,
  friendBattlesFor,
  friendBattlesOn,
  pvpHash,
  pvpLogFor,
  pvpStanding,
  pvpView,
  startPvp,
  VERSUS_LEVEL,
  type DraftMon,
  type GameData,
  type PvpEntry,
  type PvpMatch,
  type PvpMove,
  type PvpSide,
  type VersusMon,
} from '@/engine'
import { data } from '../fixtures'

const team = (dexes: number[], level = VERSUS_LEVEL): VersusMon[] => dexes.map((dex) => ({ dex, level, shiny: false }))

/** A player's move as a simple bot makes it: a reroll of the lowest dice now and then, else the attack. */
function botMove(m: PvpMatch, rng: ReturnType<typeof createRng>): PvpMove {
  const step = m.step!
  const me = step.player[step.activeIndex]!
  if (me.rerollsLeft > 0 && rng.next() < 0.4) {
    const mask = step.dice.map((d) => d.faceIndex <= 2)
    if (mask.some(Boolean)) return { k: 'reroll', mask }
  }
  return { k: 'attack' }
}

/** A whole fight, both games fed the same moves and seeds; returns both ends and every entry. */
function playOut(teamA: VersusMon[], teamB: VersusMon[], seed: number, shield: PvpSide | null = null) {
  const rng = createRng(seed)
  const server = createRng(seed ^ 0x9e3779b9)
  const opened = startPvp(teamA, teamB, shield, data, seed)
  let one = opened.match
  let two = structuredClone(opened.match)
  const log: PvpEntry[] = [...opened.log]
  let moves = 0
  while (!one.winner && moves < 2000) {
    const move = botMove(one, rng)
    const s = server.int(0, 2 ** 31 - 1)
    const r1 = applyPvpMove(one, one.actor, move, s, data)
    const r2 = applyPvpMove(two, two.actor, move, s, data)
    one = r1.match
    two = r2.match
    log.push(...r1.log)
    moves++
  }
  return { one, two, log, moves }
}

describe('Friend Battles: the fight', () => {
  it('opens on the first turn with its dice thrown, the faster lead first', () => {
    // Jolteon (Speed 130) against Snorlax (30): Jolteon's side moves first.
    const { match, log } = startPvp(team([143]), team([135]), null, data, 7)
    expect(match.actor).toBe('b')
    expect(match.step?.phase).toBe('player_reroll')
    expect(match.step!.dice.length).toBeGreaterThan(0)
    expect(log[0]).toEqual({ kind: 'start', first: 'enemy' })
  })

  it('two games fed the same moves and seeds play the same fight, to its end', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const a = team([6, 9, 3])
      const b = team([94, 130, 68])
      const { one, two, moves } = playOut(a, b, seed, seed % 2 ? 'a' : 'b')
      expect(one.winner, `seed ${seed}`).toBeDefined()
      expect(pvpHash(one)).toBe(pvpHash(two))
      expect(moves).toBeLessThan(2000)
    }
  })

  it('a different seed changes the fight', () => {
    const hashes = new Set<string>()
    for (let seed = 1; seed <= 10; seed++) hashes.add(pvpHash(playOut(team([6, 9, 3]), team([94, 130, 68]), seed).one))
    expect(hashes.size).toBeGreaterThan(1)
  })

  it('the Bonus Shield halves the first attack on its side, once, and never the other side', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { log } = playOut(team([6, 9, 3]), team([94, 130, 68]), seed, 'b')
      const shields = log.filter((e) => e.kind === 'shield')
      expect(shields.length).toBeLessThanOrEqual(1)
      for (const e of shields) {
        if (e.kind !== 'shield') continue
        // In side a's view, b is the foe.
        expect(e.side).toBe('enemy')
        expect(e.after).toBe(Math.ceil(e.before / 2))
        // The damage that follows is the halved one.
        const next = log[log.indexOf(e) + 1]
        expect(next?.kind === 'damage' && next.amount).toBe(e.after)
      }
    }
  })

  it('the shield is spent on the first attack that lands on its side', () => {
    // Side b moves first (Jolteon); side a holds the shield: b's first hit is the halved one.
    const { match } = startPvp(team([143, 143, 143]), team([135, 135, 135]), 'a', data, 11)
    const r = applyPvpMove(match, 'b', { k: 'attack' }, 99, data)
    const hit = r.log.find((e) => e.kind === 'damage')
    if (hit && hit.kind === 'damage' && hit.amount > 0) {
      expect(r.log.some((e) => e.kind === 'shield' && e.side === 'player')).toBe(true)
      expect(r.match.shield?.used).toBe(true)
    }
  })

  it('a move out of turn, or a reroll with none left, changes nothing', () => {
    const { match } = startPvp(team([143]), team([135]), null, data, 7)
    expect(applyPvpMove(match, 'a', { k: 'attack' }, 1, data).match).toBe(match)
    const empty = structuredClone(match)
    empty.step!.player[empty.step!.activeIndex]!.rerollsLeft = 0
    const mask = empty.step!.dice.map(() => true)
    expect(applyPvpMove(empty, 'b', { k: 'reroll', mask }, 1, data).match).toBe(empty)
    expect(applyPvpMove(match, 'b', { k: 'reroll', mask: [true] }, 1, data).match).toBe(match)
  })

  it('a reroll keeps the turn and spends one reroll', () => {
    const { match } = startPvp(team([143]), team([135]), null, data, 7)
    const before = match.step!.player[match.step!.activeIndex]!.rerollsLeft
    const r = applyPvpMove(match, 'b', { k: 'reroll', mask: match.step!.dice.map(() => true) }, 5, data)
    expect(r.match.actor).toBe('b')
    expect(r.match.step!.player[r.match.step!.activeIndex]!.rerollsLeft).toBe(before - 1)
    expect(r.log.some((e) => e.kind === 'reroll')).toBe(true)
  })

  it('a time-out is the turn side’s attack, whoever reports it', () => {
    const { match } = startPvp(team([143]), team([135]), null, data, 7)
    const r = applyPvpMove(match, 'a', { k: 'timeout' }, 3, data)
    expect(r.log.some((e) => e.kind === 'damage' && e.side === 'enemy')).toBe(true)
  })

  it('a forfeit ends it for the other side, at any moment', () => {
    const { match } = startPvp(team([6, 9, 3]), team([94, 130, 68]), null, data, 3)
    const r = applyPvpMove(match, 'a', { k: 'forfeit' }, 0, data)
    expect(r.match.winner).toBe('b')
    expect(r.match.reason).toBe('forfeit')
    expect(r.log.at(-1)).toEqual({ kind: 'end', result: 'lost', reason: 'forfeit' })
  })

  it('K.O.s bring out the next one in order, and the end counts who stands', () => {
    const { one, log } = playOut(team([6, 9, 3]), team([94, 130, 68]), 42)
    const outs = log.filter((e) => e.kind === 'pvp_out')
    expect(outs.length).toBeGreaterThan(0)
    const left = pvpStanding(one)
    expect(one.winner === 'a' ? left.b : left.a).toBe(0)
  })
})

describe('Friend Battles: each game’s view', () => {
  it('turns the log to the other side', () => {
    const e: PvpEntry = { kind: 'damage', side: 'player', target: 'enemy', targetUid: 'b0', amount: 3, hpAfter: 9, dice: [], result: {} as never }
    expect(flipEntry(e)).toMatchObject({ side: 'enemy', target: 'player' })
    expect(flipEntry({ kind: 'end', result: 'won' })).toEqual({ kind: 'end', result: 'lost' })
    expect(pvpLogFor([{ kind: 'start', first: 'player' }], 'b')).toEqual([{ kind: 'start', first: 'enemy' }])
  })

  it('puts the viewer in the player seat, their dice on their turn only', () => {
    const { match } = startPvp(team([143]), team([135]), 'a', data, 7)
    const b = pvpView(match, 'b', data)
    expect(b.player[0]!.dex).toBe(135)
    expect(b.enemy.dex).toBe(143)
    expect(b.phase).toBe('player_reroll')
    expect(b.shield).toMatchObject({ side: 'enemy', used: false })
    const a = pvpView(match, 'a', data)
    expect(a.phase).toBe('enemy_turn')
    expect(a.shield).toMatchObject({ side: 'player' })
  })
})

describe('Friend Battles: the draft', () => {
  const mon = (dex: number, level = 60): DraftMon => ({ dex, level, shiny: false })

  it('alternates from the coin’s winner', () => {
    expect(draftOrder('b')).toEqual(['b', 'a', 'b', 'a', 'b', 'a'])
    expect(draftTurn('a', 0)).toBe('a')
    expect(draftTurn('a', 5)).toBe('b')
    expect(draftTurn('a', 6)).toBeNull()
  })

  it('never offers a species already taken, by either side, unless nothing else is left', () => {
    const own = [mon(6), mon(9), mon(3)]
    expect(draftChoices(own, [mon(6)], [mon(9)]).map((m) => m.dex)).toEqual([3])
    // Only taken species left: the mirror is allowed.
    expect(draftChoices([mon(6), mon(9)], [mon(6)], [mon(9)]).map((m) => m.dex)).toEqual([9])
  })

  it('a time-out picks the strongest left', () => {
    const pick = draftAutoPick([mon(129), mon(149), mon(10)], data)
    expect(pick?.dex).toBe(149)
    expect(draftAutoPick([], data)).toBeNull()
  })
})

describe('Friend Battles: the switch', () => {
  const withAccess = (access: 'off' | 'admin' | 'beta' | 'all', viewer?: GameData['viewer']): GameData => ({
    ...data,
    config: { ...data.config, friendBattles: { access } },
    viewer,
  })

  it('on for beta testers opens it to the admin and the testers only', () => {
    expect(friendBattlesOn(withAccess('beta'))).toBe(false)
    expect(friendBattlesOn(withAccess('beta', { admin: false, beta: true }))).toBe(true)
    expect(friendBattlesOn(withAccess('beta', { admin: true }))).toBe(true)
    expect(friendBattlesOn(withAccess('admin', { admin: false, beta: true }))).toBe(false)
    expect(eventOpenTo('beta', withAccess('off', { admin: false, beta: true }))).toBe(true)
    expect(friendBattlesOn(withAccess('off'))).toBe(false)
  })

  it('not in Extreme mode', () => {
    const open = withAccess('all')
    expect(friendBattlesFor({ mode: undefined }, open)).toBe(true)
    expect(friendBattlesFor({ mode: 'extreme' }, open)).toBe(false)
    expect(friendBattlesFor(null, open)).toBe(false)
  })
})
