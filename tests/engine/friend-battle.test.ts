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
  marketRows,
  makeBattler,
  pvpBattler,
  BATTLE_TICKET_KEY,
  pvpHash,
  pvpLogFor,
  pvpStanding,
  pvpSwitchWait,
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
  // Now and then another able one comes in (the turn spent).
  const bench = step.player.filter((b, i) => i !== step.activeIndex && b.hp > 0)
  if (bench.length && rng.next() < 0.1) return { k: 'switch', uid: bench[rng.int(0, bench.length - 1)]!.uid }
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

  it('the Bonus Shield blocks a quarter of the first attack on its side, once, and never the other side', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { log } = playOut(team([6, 9, 3]), team([94, 130, 68]), seed, 'b')
      const shields = log.filter((e) => e.kind === 'shield')
      expect(shields.length).toBeLessThanOrEqual(1)
      for (const e of shields) {
        if (e.kind !== 'shield') continue
        // In side a's view, b is the foe.
        expect(e.side).toBe('enemy')
        expect(e.after).toBe(Math.ceil((e.before * 75) / 100))
        // The damage that follows is the cut one.
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

  it('a switch brings another able one in and spends the turn', () => {
    // Snorlax's side (a) moves second: Jolteon (b) first. b switches its lead for its second.
    const { match } = startPvp(team([143, 143, 143]), team([135, 26, 135]), null, data, 7)
    expect(match.actor).toBe('b')
    const r = applyPvpMove(match, 'b', { k: 'switch', uid: 'b1' }, 5, data)
    expect(r.match.activeB).toBe(1)
    expect(r.match.b[1]!.dex).toBe(26)
    // Nobody was hit: the switch was the whole turn, and a's turn has its dice thrown.
    expect(r.log.some((e) => e.kind === 'damage')).toBe(false)
    expect(r.match.actor).toBe('a')
    expect(r.match.step?.phase).toBe('player_reroll')
    // In side a's view the one coming in is the foe's, marked as switched in; b's own game sees it as its own.
    const out = r.log.find((e) => e.kind === 'pvp_out')
    expect(out).toEqual({ kind: 'pvp_out', side: 'enemy', uid: 'b1', switched: true })
    expect(pvpLogFor(r.log, 'b').find((e) => e.kind === 'pvp_out')).toMatchObject({ side: 'player', uid: 'b1' })
    expect(r.log.some((e) => e.kind === 'switch')).toBe(false)
    // a's screen faces the new one.
    expect(pvpView(r.match, 'a', data).enemy.uid).toBe('b1')
  })

  it('a switch out of turn, to the one out, to a fainted or unknown one, changes nothing', () => {
    const { match } = startPvp(team([143, 143]), team([135, 135]), null, data, 7)
    expect(applyPvpMove(match, 'a', { k: 'switch', uid: 'a1' }, 1, data).match).toBe(match)
    expect(applyPvpMove(match, 'b', { k: 'switch', uid: 'b0' }, 1, data).match).toBe(match)
    expect(applyPvpMove(match, 'b', { k: 'switch', uid: 'a1' }, 1, data).match).toBe(match)
    expect(applyPvpMove(match, 'b', { k: 'switch', uid: 'zz' }, 1, data).match).toBe(match)
    const down = structuredClone(match)
    down.b[1]!.hp = 0
    down.step!.player[1]!.hp = 0
    expect(applyPvpMove(down, 'b', { k: 'switch', uid: 'b1' }, 1, data).match).toBe(down)
  })

  it('after a switch, that side waits 3 of its own turns before switching again (docs/65 §18)', () => {
    // Tanky leads (Snorlax, Blissey-like bulk) so nobody faints over the turns counted here.
    const { match } = startPvp(team([143, 143, 143]), team([135, 143, 135]), null, data, 7)
    expect(match.switchCooldown).toBe(3)
    let m = applyPvpMove(match, 'b', { k: 'switch', uid: 'b1' }, 5, data).match
    expect(m.activeB).toBe(1)
    expect(pvpSwitchWait(m, 'b')).toBe(3)
    expect(pvpSwitchWait(m, 'a')).toBe(0)
    // a may still switch: the cooldown is b's own. a attacks instead.
    m = applyPvpMove(m, 'a', { k: 'attack' }, 6, data).match
    expect(m.actor).toBe('b')
    // b's next three turns: the switch changes nothing, and b's screen says how long is left.
    for (const left of [3, 2, 1]) {
      expect(pvpSwitchWait(m, 'b')).toBe(left)
      expect(m.step!.switchWait).toBe(left)
      expect(pvpView(m, 'b', data).switchWait).toBe(left)
      expect(applyPvpMove(m, 'b', { k: 'switch', uid: 'b0' }, 9, data).match).toBe(m)
      m = applyPvpMove(m, 'b', { k: 'attack' }, 10 + left, data).match
      m = applyPvpMove(m, 'a', { k: 'attack' }, 20 + left, data).match
      expect(m.winner).toBeUndefined()
    }
    // The fourth: free again.
    expect(pvpSwitchWait(m, 'b')).toBe(0)
    expect(pvpView(m, 'b', data).switchWait).toBeUndefined()
    const back = applyPvpMove(m, 'b', { k: 'switch', uid: 'b0' }, 30, data).match
    expect(back.activeB).toBe(0)
    expect(pvpSwitchWait(back, 'b')).toBe(3)
  })

  it('no cooldown when the match is opened with 0', () => {
    const { match } = startPvp(team([143, 143]), team([135, 143]), null, data, 7, undefined, 50, 0)
    const m = applyPvpMove(match, 'b', { k: 'switch', uid: 'b1' }, 5, data).match
    expect(pvpSwitchWait(m, 'b')).toBe(0)
    const m2 = applyPvpMove(m, 'a', { k: 'attack' }, 6, data).match
    expect(applyPvpMove(m2, 'b', { k: 'switch', uid: 'b0' }, 7, data).match.activeB).toBe(0)
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

describe('battle tickets on the Friend Market (docs/65 §15)', () => {
  const open = (access: 'off' | 'all'): GameData => ({
    ...data,
    config: { ...data.config, friendBattles: { access } },
  })

  it('last on the shelf while Friend Battles is open: 10 Heart Scales, 10 a week', () => {
    const rows = marketRows(open('all'), '2026-11-02', { [BATTLE_TICKET_KEY]: 4 })
    const ticket = rows.at(-1)!
    expect(ticket).toMatchObject({ key: 'battle-ticket', kind: 'ticket', price: 10, limit: 10, left: 6 })
  })

  it('not sold while it is off', () => {
    expect(marketRows(open('off'), '2026-11-02').some((r) => r.kind === 'ticket')).toBe(false)
  })
})

describe('Lv.50 or Lv.100 (docs/65 §16)', () => {
  const own = (dex: number, level: number) => makeBattler({ uid: 'x', dex, level, hp: 9999 }, data)

  it('Lv.100: a weaker one is brought up — Lv.100 HP and Speed, its own dice and rerolls', () => {
    const b = pvpBattler({ dex: 149, level: 60, shiny: false }, 'a0', data, 100)
    const at100 = own(149, 100)
    const at60 = own(149, 60)
    expect(b.level).toBe(100)
    expect(b.maxHp).toBe(at100.maxHp)
    expect(b.hp).toBe(at100.maxHp)
    expect(b.speed).toBe(at100.speed)
    expect(b.dice).toEqual(at60.dice)
    expect(b.rerolls).toBe(at60.rerolls)
  })

  it('Lv.50: a stronger one is brought down, its own dice kept (Versus’s rule)', () => {
    const b = pvpBattler({ dex: 149, level: 80, shiny: false }, 'a0', data, 50)
    expect(b.level).toBe(50)
    expect(b.maxHp).toBe(own(149, 50).maxHp)
    expect(b.dice).toEqual(own(149, 80).dice)
  })

  it('a match opens at its level, and plays to its end the same on two games', () => {
    const opened = startPvp(team([6, 9, 3], 70), team([94, 130, 68], 55), null, data, 3, 50, 100)
    expect(opened.match.a.every((b) => b.level === 100)).toBe(true)
    let one = opened.match
    let two = structuredClone(opened.match)
    const rng = createRng(8)
    for (let i = 0; i < 2000 && !one.winner; i++) {
      const s = rng.int(0, 2 ** 31 - 1)
      one = applyPvpMove(one, one.actor, { k: 'attack' }, s, data).match
      two = applyPvpMove(two, two.actor, { k: 'attack' }, s, data).match
    }
    expect(one.winner).toBeDefined()
    expect(pvpHash(one)).toBe(pvpHash(two))
  })
})

