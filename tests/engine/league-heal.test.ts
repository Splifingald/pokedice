// The League's heal between its battles (docs/42): each one won with the next still waiting heals the team, as a
// Pokémon Center would; never the last, never a gym, never with the switch off or in Extreme mode.
import { describe, expect, it } from 'vitest'
import {
  applyVictory,
  createRng,
  dueGym,
  emptyProgress,
  instanceMaxHp,
  leagueHealOn,
  newSave,
  type Area,
  type GameData,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const OFF = makeData()
const ON = makeData({ leagueHeal: { access: 'all' } })
const ADMIN_ONLY = makeData({ leagueHeal: { access: 'admin' } })

const kanto = (name: string): Area => ON.areas.find((a) => a.name === name && (a.regionId ?? 'kanto') === 'kanto')!
const INDIGO = kanto('Indigo Plateau')
const FOREST = kanto('Viridian Forest')

/** Standing in `area` with every round done and `beaten` of its battles won, the whole team at 1 HP. */
function hurt(area: Area, beaten: number, data: GameData, mode?: 'extreme'): SaveData {
  const s = newSave(1, data, 0, newId)
  let p = { ...emptyProgress(), roundsDone: 99 }
  for (let i = 0; i < beaten; i++) p = { ...p, gymsDefeated: [...p.gymsDefeated, dueGym(area, p, data)!.id] }
  return {
    ...s,
    ...(mode && { mode }),
    currentAreaId: area.id,
    areaProgress: { ...s.areaProgress, [area.id]: p },
    box: s.box.map((m) => ({ ...m, currentHp: 1 })),
  }
}

/** The last K.O. of the battle waiting in `area`. */
function win(s: SaveData, area: Area, data: GameData) {
  const t = dueGym(area, s.areaProgress[area.id]!, data)!
  return applyVictory(
    s,
    { areaId: area.id, kind: 'gym', enemyDex: 1, enemyLevel: 50, fighterUid: s.team[0]!, gymTrainerId: t.id, gymComplete: true },
    data,
    createRng(1),
    0,
    newId,
  )
}

// A level-up from the K.O.'s XP adds HP, so "not healed" is "not everyone full".
const allFull = (s: SaveData, data: GameData) => s.box.every((m) => m.currentHp === instanceMaxHp(m, data))

describe('the League heals between its battles', () => {
  it('is Off by default, and the admin alone sees it On for admin', () => {
    expect(leagueHealOn(OFF)).toBe(false)
    expect(leagueHealOn(ON)).toBe(true)
    expect(leagueHealOn(ADMIN_ONLY)).toBe(false)
    expect(leagueHealOn({ ...ADMIN_ONLY, viewer: { admin: true } } as GameData)).toBe(true)
  })

  it('heals the team after each Elite Four member, and says so', () => {
    for (let beaten = 0; beaten < 4; beaten++) {
      const r = win(hurt(INDIGO, beaten, ON), INDIGO, ON)
      expect(allFull(r.save, ON)).toBe(true)
      expect(r.events).toContainEqual({ kind: 'league_healed' })
    }
  })

  it('not after the Champion: there is no next battle', () => {
    const r = win(hurt(INDIGO, 4, ON), INDIGO, ON)
    expect(r.events.some((e) => e.kind === 'area_cleared')).toBe(true)
    expect(r.events).not.toContainEqual({ kind: 'league_healed' })
    expect(allFull(r.save, ON)).toBe(false)
  })

  it('not with the switch off, not at a gym, not in Extreme mode while its Centers are off', () => {
    for (const r of [
      win(hurt(INDIGO, 0, OFF), INDIGO, OFF),
      win(hurt(FOREST, 0, ON), FOREST, ON),
      win(hurt(INDIGO, 0, ON, 'extreme'), INDIGO, ON),
    ]) {
      expect(r.events).not.toContainEqual({ kind: 'league_healed' })
      expect(allFull(r.save, ON)).toBe(false)
    }
  })

  it('not on a K.O. before the trainer’s last Pokémon', () => {
    const s = hurt(INDIGO, 0, ON)
    const t = dueGym(INDIGO, s.areaProgress[INDIGO.id]!, ON)!
    const r = applyVictory(
      s,
      { areaId: INDIGO.id, kind: 'gym', enemyDex: 1, enemyLevel: 50, fighterUid: s.team[0]!, gymTrainerId: t.id, gymComplete: false },
      ON,
      createRng(1),
      0,
      newId,
    )
    expect(r.events).not.toContainEqual({ kind: 'league_healed' })
  })
})
