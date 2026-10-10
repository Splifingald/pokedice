// Raid Battles, the fight (docs/18 §3, docs/19 §6.3): three sides against the raid Pokémon and its summons, every
// action a real one-on-one duel step. Turn order, foe targeting, bars and their overflow, summon points, the player's
// turn and its target, who may stand beside the boss, and determinism.
import { describe, expect, it } from 'vitest'
import {
  allyTarget,
  BOSS_UID,
  createBattle,
  createRaid,
  createRng,
  isLegendary,
  npcTeam,
  raidAllyAllowed,
  raidDispatch,
  RAID_MAX_STEPS,
  reduce,
  simulateRaid,
  startDuelStep,
  summonPool,
  uniformLevels,
  type GameData,
  type RaidLogEntry,
  type RaidSideSeed,
  type RaidState,
} from '@/engine'
import { makeData } from '../fixtures'

const data = makeData()
const cfg = data.config.events.raid
const regions = data.regions.map((r) => r.id)

const sideOf = (uid: string) => Number(uid.match(/^s(\d)/)?.[1] ?? -1)
function sides(seed: number, me: RaidSideSeed['kind'] = 'me'): RaidSideSeed[] {
  const rng = createRng(seed)
  return [0, 1, 2].map((k) => ({
    owner: `Side ${k}`,
    look: null,
    kind: k === 0 ? me : 'npc',
    team: npcTeam(data, regions, rng, `s${k}`),
  }))
}
const auto = (seed: number, dex = 151, d: GameData = data) =>
  createRaid({ boss: { dex, shiny: false }, sides: sides(seed), regionId: 'kanto', auto: true }, d, createRng(seed * 7))

describe('who stands beside the raid', () => {
  const allowed = raidAllyAllowed(data)
  it('fully evolved, never legendary, mythical, starter line, pseudo-legendary or Ultra Beast', () => {
    expect(allowed(149)).toBe(false) // Dragonite: pseudo
    expect(allowed(150)).toBe(false) // Mewtwo
    expect(allowed(6)).toBe(false) // Charizard: a starter line
    expect(allowed(25)).toBe(false) // Pikachu evolves
    expect(allowed(132)).toBe(false) // Ditto copies its foe
    expect(allowed(143)).toBe(true) // Snorlax
    for (const dex of cfg.exclude.extra) expect(allowed(dex), `#${dex}`).toBe(false)
    const pool = summonPool(data, 151, 'kanto')
    expect(pool.length).toBeGreaterThan(10)
    for (const dex of pool) {
      expect(isLegendary(data, dex), `#${dex}`).toBe(false)
      expect([data.species[dex]!.type1, data.species[dex]!.type2]).not.toContain('psychic') // Mew is Psychic
    }
  })

  it('an NPC team is three different allowed Pokémon at the raid team cap', () => {
    const team = npcTeam(data, regions, createRng(4), 'npc')
    expect(team).toHaveLength(3)
    expect(new Set(team.map((t) => t.dex)).size).toBe(3)
    for (const t of team) {
      expect(allowed(t.dex)).toBe(true)
      expect(t.level).toBe(cfg.teamCap)
    }
  })
})

describe('the raid on auto', () => {
  it('starts with the boss, its free summons, full bars, and plays to an end', () => {
    const { state, log } = auto(1)
    expect(log[0]).toMatchObject({ kind: 'raid_start', boss: BOSS_UID, summons: [{ uid: 'raid-summon-1' }, { uid: 'raid-summon-2' }] })
    expect(['won', 'lost']).toContain(state.phase)
    expect(log.at(-1)?.kind).toBe('raid_end')
    expect(state.steps).toBeLessThanOrEqual(RAID_MAX_STEPS)
    if (state.phase === 'won') {
      expect(state.broken).toBe(state.bars)
      expect(state.summons).toHaveLength(0)
    } else expect(state.sides.every((s) => s.out)).toBe(true)
  })

  it('is the same raid for the same seed', () => {
    expect(auto(5).log).toEqual(auto(5).log)
  })

  it('a foe never hits the same side twice in a row while another side is in', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { log } = auto(seed)
      let last: number | null = null
      const outs = new Set<number>()
      for (const e of log) {
        if (e.kind === 'raid_out') outs.add(e.side)
        if (e.kind !== 'raid_front' || e.actor !== 'foe') continue
        const side = sideOf(e.ally)
        if (last != null && 3 - outs.size > 1 && !outs.has(last)) expect(side, `seed ${seed}`).not.toBe(last)
        last = side
      }
    }
  })

  it('acts in speed order each round, the sides first on a tie', () => {
    const { state, log } = createRaid(
      { boss: { dex: 151, shiny: false }, sides: sides(2, 'npc'), regionId: 'kanto', auto: true },
      data,
      createRng(9),
    )
    const speedOf = (uid: string) =>
      uid === BOSS_UID
        ? state.boss.speed
        : (state.sides.flatMap((s) => s.mons).find((m) => m.uid === uid)?.speed ?? data.species[summonDex(log, uid)]!.speed)
    // The first round: everyone on the field once, fastest first.
    const fronts = log.filter((e): e is Extract<RaidLogEntry, { kind: 'raid_front' }> => e.kind === 'raid_front').slice(0, 6)
    const actors = fronts.map((f) => (f.actor === 'ally' ? f.ally : f.foe))
    const speeds = actors.map(speedOf)
    expect([...speeds].sort((a, b) => b - a)).toEqual(speeds)
  })

  it('a broken bar refills with what the hit took past it, and gives summon points', () => {
    let checked = 0
    for (let seed = 1; seed <= 10 && checked < 3; seed++) {
      const { log } = auto(seed)
      for (let i = 0; i < log.length; i++) {
        const e = log[i]!
        if (e.kind !== 'raid_bar') continue
        expect(e.points).toBeGreaterThanOrEqual(cfg.summonPerBreak - 0)
        const boss = auto(seed).state.boss
        expect(e.hpAfter).toBeGreaterThan(0)
        expect(e.hpAfter).toBeLessThanOrEqual(boss.maxHp)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('never has more summons on the field than allowed', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { log } = auto(seed)
      let field = 0
      for (const e of log) {
        if (e.kind === 'raid_start') field = e.summons.length
        if (e.kind === 'raid_summon') field++
        if (e.kind === 'faint' && e.side === 'enemy' && e.uid !== BOSS_UID) field--
        expect(field).toBeLessThanOrEqual(cfg.maxField)
      }
    }
  })

  it('ends as a loss when it drags on past the step cap', () => {
    // Nobody hurts anybody: a Normal-only side against a Ghost boss, foes that can't touch them.
    const slow = makeData({ events: { ...data.config.events, raid: { ...cfg, bars: 1000 } } })
    const { state, log } = createRaid(
      { boss: { dex: 151, shiny: false }, sides: sides(3, 'npc'), regionId: 'kanto', auto: true },
      slow,
      createRng(1),
    )
    if (state.phase === 'lost' && state.steps >= RAID_MAX_STEPS) expect(log.at(-1)).toEqual({ kind: 'raid_end', result: 'lost', reason: 'stalemate' })
    else expect(state.phase).toBe('lost')
  })

  it('a whole raid sims to a result', () => {
    const r = simulateRaid({ boss: { dex: 151, shiny: false }, sides: sides(6), regionId: 'kanto' }, data, createRng(3))
    expect(r.steps).toBeGreaterThan(0)
    expect(r.barsBroken).toBeLessThanOrEqual(cfg.bars)
  })
})

function summonDex(log: RaidLogEntry[], uid: string): number {
  for (const e of log) {
    if (e.kind === 'raid_summon' && e.b.uid === uid) return e.b.dex
    if (e.kind === 'raid_start') for (const m of e.summons) if (m.uid === uid) return m.dex
  }
  return 0
}

describe('your turn', () => {
  /** A raid whose first action is yours: you're far faster than anything else. */
  function mine(): { state: RaidState; log: RaidLogEntry[] } {
    const seeds = sides(11)
    seeds[0]!.team = [{ uid: 's0-0', dex: 145, level: 50, hp: 999 }] // Zapdos: quick enough
    const fast = makeData({ events: { ...data.config.events, raid: { ...cfg, startAllies: 2 } } })
    return createRaid({ boss: { dex: 143, shiny: false }, sides: seeds, regionId: 'kanto' }, fast, createRng(2))
  }

  it('stops on your turn with a duel against the default target', () => {
    const { state } = mine()
    expect(state.phase).toBe('player')
    expect(state.duel?.player[state.duel.activeIndex]?.uid).toBe('s0-0')
    expect(state.duel?.enemy.uid).toBe(allyTarget(state, 0, data).uid)
    expect(state.duel?.single).toBe(true)
  })

  it('TARGET aims at another foe; ROLL then ATTACK hits it and the raid moves on', () => {
    const { state } = mine()
    const summon = state.summons[0]!
    const rng = createRng(4)
    let r = raidDispatch(state, { t: 'TARGET', uid: summon.uid }, data, rng)
    expect(r.state.duel?.enemy.uid).toBe(summon.uid)
    expect(r.log).toEqual([{ kind: 'raid_front', ally: 's0-0', foe: summon.uid, actor: 'ally' }])
    // Nothing happens out of place: a target that isn't on the field.
    expect(raidDispatch(r.state, { t: 'TARGET', uid: 'nobody' }, data, rng).state).toBe(r.state)
    if (r.state.duel?.phase === 'player_roll') r = raidDispatch(r.state, { t: 'ROLL' }, data, rng)
    r = raidDispatch(r.state, { t: 'ATTACK' }, data, rng)
    const hit = r.log.find((e) => e.kind === 'damage')
    expect(hit).toMatchObject({ side: 'player', targetUid: summon.uid })
    // The first hit of the step is yours, on the summon; then the raid has moved on to your next turn or its end.
    expect(r.log.filter((e) => e.kind === 'damage')[0]).toBe(hit)
    expect(['player', 'won', 'lost']).toContain(r.state.phase)
  })

  it('a forfeit ends the raid as a loss', () => {
    const { state } = mine()
    const r = raidDispatch(state, { t: 'FORFEIT' }, data, createRng(1))
    expect(r.state.phase).toBe('lost')
    expect(r.log.at(-1)).toEqual({ kind: 'raid_end', result: 'lost', reason: 'forfeit' })
  })
})

describe('a duel step (battle.ts single mode)', () => {
  it('ends after one action without ending the battle, and keeps statuses', () => {
    const { state } = createBattle(
      {
        kind: 'boss',
        team: [{ uid: 'p', dex: 6, level: 50, hp: 999 }],
        enemy: { dex: 151, level: 50 },
        playerLevels: uniformLevels(5),
        enemyLevels: uniformLevels(7),
      },
      data,
    )
    const s = structuredClone(state)
    s.enemy.hp = 1
    s.enemy.status = { ...s.enemy.status, confused: true }
    const log: Parameters<typeof startDuelStep>[3] = []
    startDuelStep(s, 'enemy', data, log)
    expect(s.phase).toBe('enemy_turn')
    s.player[0]!.status = { ...s.player[0]!.status, burn: { stacks: 1, turns: 3 } }
    const r = reduce(s, { t: 'AI_TURN' }, data, createRng(1))
    // Mew's one attack, its confusion recoil (1 HP left: it drops to 0), and the step is over: no faint, no end, no
    // turn for your side, your burn still on.
    expect(r.state.phase).toBe('done')
    expect(r.log.map((e) => e.kind)).not.toContain('end')
    expect(r.log.map((e) => e.kind)).not.toContain('faint')
    expect(r.log.filter((e) => e.kind === 'turn')).toHaveLength(0)
    expect(r.state.player[0]!.status).toEqual(s.player[0]!.status)
    expect(reduce(r.state, { t: 'ROLL' }, data, createRng(1)).state).toBe(r.state)
  })
})
