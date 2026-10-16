// Raid Battles, the fight (docs/18 §3, docs/19 §6.3): three sides against the raid Pokémon alone, every action a real
// one-on-one duel step. Turn order (the sides in order, the raid Pokémon striking back after each), bars and their
// overflow, the raid's type matchups, the player's turn, who may fight beside you, and determinism.
import { describe, expect, it } from 'vitest'
import {
  BOSS_UID,
  bossTarget,
  createBattle,
  createRaid,
  createRng,
  gmaxChoices,
  megaChoices,
  npcTeam,
  raidAllyAllowed,
  raidDispatch,
  RAID_MAX_STEPS,
  reduce,
  simulateRaid,
  startDuelStep,
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
  createRaid({ boss: { dex, shiny: false }, sides: sides(seed), auto: true }, d, createRng(seed * 7))
const fronts = (log: RaidLogEntry[]) =>
  log.filter((e): e is Extract<RaidLogEntry, { kind: 'raid_front' }> => e.kind === 'raid_front')

describe('who fights beside you', () => {
  const allowed = raidAllyAllowed(data)
  it('fully evolved, never legendary, mythical, starter line, pseudo-legendary or Ultra Beast', () => {
    expect(allowed(149)).toBe(false) // Dragonite: pseudo
    expect(allowed(150)).toBe(false) // Mewtwo
    expect(allowed(6)).toBe(false) // Charizard: a starter line
    expect(allowed(25)).toBe(false) // Pikachu evolves
    expect(allowed(132)).toBe(false) // Ditto copies its foe
    expect(allowed(143)).toBe(true) // Snorlax
    for (const dex of cfg.exclude.extra) expect(allowed(dex), `#${dex}`).toBe(false)
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
  it('starts with the raid Pokémon alone, full bars, and plays to an end', () => {
    const { state, log } = auto(1)
    expect(log[0]).toEqual({ kind: 'raid_start', boss: BOSS_UID })
    expect(['won', 'lost']).toContain(state.phase)
    expect(log.at(-1)?.kind).toBe('raid_end')
    expect(state.steps).toBeLessThanOrEqual(RAID_MAX_STEPS)
    if (state.phase === 'won') expect(state.broken).toBe(state.bars)
    else expect(state.sides.every((s) => s.out)).toBe(true)
  })

  it('is the same raid for the same seed', () => {
    expect(auto(5).log).toEqual(auto(5).log)
  })

  it('the sides play in order, you first, and the raid Pokémon strikes back at each right after its turn', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { log } = auto(seed)
      const outs = new Set<number>()
      // The next side still in from `k` on, round after round.
      const nextIn = (k: number) => [0, 1, 2].map((j) => (k + j) % 3).find((i) => !outs.has(i))
      let last = -1
      let bossDue = false
      for (const e of log) {
        if (e.kind === 'raid_out') outs.add(e.side)
        if (e.kind !== 'raid_front') continue
        const side = sideOf(e.ally)
        if (e.actor === 'ally') {
          expect(bossDue, `seed ${seed}`).toBe(false)
          expect(side, `seed ${seed}`).toBe(nextIn(last + 1))
          last = side
          bossDue = true
        } else {
          expect(bossDue, `seed ${seed}`).toBe(true)
          // The side that just played, or when it's just gone out, the next one still in.
          expect(side, `seed ${seed}`).toBe(outs.has(last) ? nextIn(last + 1) : last)
          bossDue = false
        }
      }
      expect(fronts(log)[0]).toMatchObject({ actor: 'ally' })
      expect(sideOf(fronts(log)[0]!.ally)).toBe(0)
    }
  })

  it('the raid Pokémon is the only foe: every hit lands on it or on the side in front', () => {
    const { log } = auto(3)
    let front = ''
    for (const e of log) {
      if (e.kind === 'raid_front') front = e.ally
      if (e.kind !== 'damage') continue
      if (e.side === 'player') expect(e.targetUid).toBe(BOSS_UID)
      else expect(sideOf(e.targetUid)).toBe(sideOf(front))
    }
  })

  it('a broken bar refills with what the hit took past it', () => {
    let checked = 0
    for (let seed = 1; seed <= 10 && checked < 3; seed++) {
      const { log, state } = auto(seed)
      for (const e of log) {
        if (e.kind !== 'raid_bar') continue
        expect(e.hpAfter).toBeGreaterThan(0)
        expect(e.hpAfter).toBeLessThanOrEqual(state.boss.maxHp)
        expect(e.barsLeft).toBe(state.bars - e.broken)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('nobody is immune to the raid Pokémon: a Ghost one still hurts Normal-types', () => {
    // Snorlax only, against Dusknoir: Ghost dice can't touch Normal-types anywhere else.
    const snorlax = (k: number): RaidSideSeed => ({
      owner: `Side ${k}`,
      look: null,
      kind: 'npc',
      team: [{ uid: `s${k}-0`, dex: 143, level: 50, hp: 999 }],
    })
    const { state, log } = createRaid(
      { boss: { dex: 477, shiny: false }, sides: [0, 1, 2].map(snorlax), auto: true },
      data,
      createRng(2),
    )
    expect(state.boss.types).toEqual(['ghost'])
    const ghost = log.filter(
      (e) => e.kind === 'damage' && e.side === 'enemy' && e.result.attackType === 'ghost',
    )
    expect(ghost.length).toBeGreaterThan(0)
    for (const h of ghost) expect(h).toMatchObject({ result: { immune: false, effectiveness: 0.5 } })
    for (const h of ghost) expect(h.kind === 'damage' && h.amount).toBeGreaterThan(0)
  })

  it('ends as a loss when it drags on past the step cap', () => {
    const slow = makeData({ events: { ...data.config.events, raid: { ...cfg, bars: 1000 } } })
    const { state, log } = createRaid(
      { boss: { dex: 151, shiny: false }, sides: sides(3, 'npc'), auto: true },
      slow,
      createRng(1),
    )
    if (state.phase === 'lost' && state.steps >= RAID_MAX_STEPS) expect(log.at(-1)).toEqual({ kind: 'raid_end', result: 'lost', reason: 'stalemate' })
    else expect(state.phase).toBe('lost')
  })

  it('a whole raid sims to a result', () => {
    const r = simulateRaid({ boss: { dex: 151, shiny: false }, sides: sides(6) }, data, createRng(3))
    expect(r.steps).toBeGreaterThan(0)
    expect(r.barsBroken).toBeLessThanOrEqual(cfg.bars)
  })
})

describe("Giratina's Origin Forme in a raid (the user's call of 2026-10-16)", () => {
  // Strong sides against a low-level Giratina with small bars, so a raid reaches its last bar.
  const easy = makeData({
    events: { ...data.config.events, raid: { ...cfg, bars: 3, barHp: 0.5, level: 20 } },
  })
  const strong = (k: number): RaidSideSeed => ({
    owner: `Side ${k}`,
    look: null,
    kind: 'npc',
    team: [0, 1, 2].map((i) => ({ uid: `s${k}-${i}`, dex: 150, level: 100, hp: 9999 })),
  })
  const raid = (d: GameData, seed: number, dex = 487) =>
    createRaid({ boss: { dex, shiny: true }, sides: [0, 1, 2].map(strong), auto: true }, d, createRng(seed))
  const bossForms = (log: RaidLogEntry[]) =>
    log.filter((e): e is Extract<RaidLogEntry, { kind: 'form' }> => e.kind === 'form' && e.uid === BOSS_UID)
  // Giratina in a battle: its Altered Forme's dice at full HP, its Origin Forme's below half.
  const giratina = (hp: number) =>
    createBattle(
      {
        kind: 'boss',
        team: [{ uid: 'a', dex: 7, level: 50, hp: 9999 }],
        enemy: { dex: 487, level: 50, hp },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state.enemy
  const count = (dice: readonly string[], type: string) => dice.filter((d) => d === type).length

  it('stays Altered through the first bars, below half HP too, and unleashes Origin on the last one', () => {
    const { state, log } = raid(easy, 1)
    expect(state.broken).toBe(state.bars)
    const forms = bossForms(log)
    expect(forms).toHaveLength(1)
    expect(log[log.indexOf(forms[0]!) - 1]).toMatchObject({ kind: 'raid_bar', barsLeft: 1 })
    expect(forms[0]).toMatchObject({
      side: 'enemy',
      fromDex: 487,
      toDex: 10007,
      reason: 'unleash',
      die: 'dragon',
    })
    expect(state.boss.dex).toBe(10007)
    // One more Dragon die, every Ghost die kept.
    const altered = giratina(9999).dice
    expect(forms[0]!.dice).toHaveLength(altered.length + 1)
    expect(count(forms[0]!.dice, 'ghost')).toBe(count(altered, 'ghost'))
    expect(count(forms[0]!.dice, 'dragon')).toBe(count(altered, 'dragon') + 1)
  })

  it('a raid of one bar starts in its Origin Forme', () => {
    const one = makeData({ events: { ...data.config.events, raid: { ...cfg, bars: 1, level: 20 } } })
    const { log } = raid(one, 2)
    expect(log[1]).toMatchObject({ kind: 'form', uid: BOSS_UID, toDex: 10007, reason: 'unleash' })
    expect(bossForms(log)).toHaveLength(1)
  })

  it('a raid Pokémon with no such form never changes', () => {
    expect(bossForms(raid(easy, 3, 151).log)).toEqual([])
  })

  it('a battle still swaps a Ghost die for a Dragon one below half HP', () => {
    const low = giratina(10)
    expect(low.dex).toBe(10007)
    expect(low.dice).toHaveLength(giratina(9999).dice.length)
  })
})

describe('the side the raid Pokémon strikes back at', () => {
  const state = (out: boolean[]) => ({ sides: out.map((o) => ({ out: o })) }) as unknown as RaidState
  it('the one that just played; when it’s just gone out, the next one still in', () => {
    expect(bossTarget(state([false, false, false]), 1)).toBe(1)
    expect(bossTarget(state([false, true, false]), 1)).toBe(2)
    expect(bossTarget(state([false, false, true]), 2)).toBe(0)
    expect(bossTarget(state([true, true, true]), 0)).toBeNull()
  })
})

describe('your turn', () => {
  /** A raid with you in it: you always play first. */
  function mine(team: RaidSideSeed['team'] = [{ uid: 's0-0', dex: 145, level: 50, hp: 999 }]): {
    state: RaidState
    log: RaidLogEntry[]
  } {
    const seeds = sides(11)
    seeds[0]!.team = team
    return createRaid({ boss: { dex: 143, shiny: false }, sides: seeds }, data, createRng(2))
  }

  it('stops on your turn, first of the raid, with a duel against the raid Pokémon', () => {
    const { state, log } = mine()
    expect(state.phase).toBe('player')
    expect(state.steps).toBe(1)
    expect(state.duel?.player[state.duel.activeIndex]?.uid).toBe('s0-0')
    expect(state.duel?.enemy.uid).toBe(BOSS_UID)
    expect(state.duel?.single).toBe(true)
    expect(fronts(log)).toEqual([{ kind: 'raid_front', ally: 's0-0', actor: 'ally' }])
  })

  it('ROLL then ATTACK hits the raid Pokémon, and it strikes back at you before the next side plays', () => {
    const { state } = mine()
    const rng = createRng(4)
    let r =
      state.duel?.phase === 'player_roll' ? raidDispatch(state, { t: 'ROLL' }, data, rng) : { state, log: [] }
    r = raidDispatch(r.state, { t: 'ATTACK' }, data, rng)
    const hits = r.log.filter((e) => e.kind === 'damage')
    expect(hits[0]).toMatchObject({ side: 'player', targetUid: BOSS_UID })
    expect(fronts(r.log)[0]).toEqual({ kind: 'raid_front', ally: 's0-0', actor: 'boss' })
    expect(fronts(r.log)[1]).toMatchObject({ actor: 'ally' })
    expect(sideOf(fronts(r.log)[1]!.ally)).toBe(1)
    expect(['player', 'won', 'lost']).toContain(r.state.phase)
  })

  it('SWITCH sends in another of your raid team: it is your action, and your side fights on with it', () => {
    const { state } = mine([
      { uid: 's0-0', dex: 145, level: 50, hp: 999 },
      { uid: 's0-1', dex: 143, level: 50, hp: 999 },
    ])
    expect(state.phase).toBe('player')
    const r = raidDispatch(state, { t: 'SWITCH', instanceId: 's0-1' }, data, createRng(3))
    expect(r.log[0]).toEqual({ kind: 'switch', uid: 's0-1', free: false })
    // The switch was the action: no hit of yours before the raid Pokémon strikes back, at the one you sent in.
    const next = r.log.findIndex((e) => e.kind === 'raid_front')
    expect(next).toBeGreaterThan(0)
    expect(r.log.slice(0, next).some((e) => e.kind === 'damage')).toBe(false)
    expect(r.log[next]).toEqual({ kind: 'raid_front', ally: 's0-1', actor: 'boss' })
  })

  it('offers no Mega Evolution or Gigantamax, and ignores one asked for', () => {
    // Charizard at Lv.50 has both Megas and a Gigantamax form.
    const { state } = mine([{ uid: 's0-0', dex: 6, level: 50, hp: 999 }])
    expect(megaChoices(state.duel!, data)).toEqual([])
    expect(gmaxChoices(state.duel!, data)).toEqual([])
    for (const e of [{ t: 'MEGA', toDex: 10034 }, { t: 'GMAX', toDex: 10196 }] as const) {
      const r = raidDispatch(state, e, data, createRng(1))
      expect(r.log.some((l) => l.kind === 'form')).toBe(false)
      expect(r.state.duel?.player[0]?.dex).toBe(6)
    }
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
