// The promo trailer's scenes (scripts/record-promo.ts): each one a save and a starting point in the real game, built
// here and opened by the dev-only harness (/__demo/:scene, src/dev/PromoDemo.tsx). They only set the starting state:
// every roll, number and animation is the game's own.
import {
  badgeCase,
  createInstance,
  progressOf,
  createRaid,
  createRng,
  progressRaidKey,
  uniformLevels,
  type GameData,
  type PokemonInstance,
  type RaidSideSeed,
  type SaveData,
} from '@/engine'
import type { RaidRun } from '@/store/raidBattle'

/** The scenes' places: Sky Pillar (Rayquaza's raid), Ilex Shrine (Celebi), Lumiose City, Cerulean Cave. */
export const AREA = {
  skyPillar: '4ef12821-79bb-5aa1-ad96-5bd2fbba093f',
  ilexShrine: '100e6644-3f5b-553a-ad22-e26551b04edc',
  lumiose: '6e410147-d926-5e1e-b132-47d7a9470438',
  ceruleanCave: 'a5d11263-453f-5181-9a73-2c30df79d3fc',
} as const

export const PLAYER = { name: 'Alex', character: 'red' as const }

/** A save at the given point: the team (first is the lead), the Box, every track at `upgrade`. */
export function promoSave(
  data: GameData,
  o: {
    team: { dex: number; level: number }[]
    box?: { dex: number; level: number }[]
    areaId: string
    region: string
    upgrade?: number
    now: number
  },
): SaveData {
  let n = 0
  const mon = (m: { dex: number; level: number }): PokemonInstance =>
    createInstance(m.dex, m.level, data, `promo-${++n}`, o.now)
  const team = o.team.map(mon)
  const box = (o.box ?? []).map(mon)
  const levels = uniformLevels(o.upgrade ?? 7)
  return {
    version: 1,
    updatedAt: o.now,
    gold: 24_680,
    pokedex: [...new Set([...team, ...box].map((p) => p.dex))],
    box: [...team, ...box],
    team: team.map((p) => p.id),
    inventory: {},
    comboLevels: levels.comboLevels as SaveData['comboLevels'],
    dieLevels: levels.dieLevels as SaveData['dieLevels'],
    currentAreaId: o.areaId,
    areaProgress: {},
    settings: {
      sfx: true,
      sound: true,
      reducedMotion: false,
      animations: 'full',
      multiExp: true,
      lang: 'en',
    },
    hpScale: data.config.hpMultiplier,
    region: o.region,
    parked: {},
    player: PLAYER,
    // Pop-ups a fresh save would open over the scene.
    leaderboardVisited: true,
    versusRulesSeen: true,
  }
}

const raidMon = (uid: string, dex: number, level: number) => ({
  uid,
  dex,
  level,
  hp: Number.MAX_SAFE_INTEGER,
})

/**
 * Rayquaza's raid as it opens (the intro first): you and two trainers of Hoenn, their leads a Dragonite, a Salamence
 * and a Metagross.
 */
export function rayquazaRaid(data: GameData, areaId: string, look: string | null): RaidRun {
  const trainer = (cls: string) =>
    Object.values(data.trainers).find(
      (t) => t.role === 'trainer' && t.spriteUrl?.includes(`/classes/hoenn/${cls}`) && t.name.includes(' '),
    )
  const ace = trainer('ace-trainer') ?? trainer('dragon-tamer')
  const expert = trainer('expert') ?? trainer('black-belt')
  const sides: RaidSideSeed[] = [
    {
      owner: PLAYER.name,
      look,
      kind: 'me',
      team: [raidMon('s0-0', 149, 70), raidMon('s0-1', 6, 70), raidMon('s0-2', 130, 70)],
    },
    {
      owner: ace?.name ?? 'Ace Trainer',
      look: ace?.spriteUrl ?? null,
      kind: 'npc',
      team: [raidMon('s1-0', 373, 70), raidMon('s1-1', 350, 70), raidMon('s1-2', 282, 70)],
    },
    {
      owner: expert?.name ?? 'Expert',
      look: expert?.spriteUrl ?? null,
      kind: 'npc',
      team: [raidMon('s2-0', 376, 70), raidMon('s2-1', 260, 70), raidMon('s2-2', 306, 70)],
    },
  ]
  const { state, log } = createRaid(
    { boss: { dex: 384, shiny: false }, sides, kind: 'progress', areaId },
    data,
    createRng(384),
  )
  return {
    id: 1,
    source: { kind: 'progress', key: progressRaidKey(areaId, 384) },
    friends: [],
    raid: { day: '', dex: 384, shiny: false, areaId, caught: false, tries: 0 },
    state,
    log,
    stage: 'intro',
    catch: null,
  }
}

/**
 * Two badges won (what Trades ask for), and the place the second one was won as where the player stands, so Home and
 * its widgets show a save in the middle of its region.
 */
function withBadges(data: GameData, save: SaveData, n = 2): SaveData {
  let s = save
  const won = badgeCase(save, data).slice(0, n)
  for (const b of won) {
    const p = progressOf(s, b.areaId)
    s = {
      ...s,
      areaProgress: {
        ...s.areaProgress,
        [b.areaId]: { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] },
      },
    }
  }
  return { ...s, currentAreaId: won[won.length - 1]?.areaId ?? s.currentAreaId }
}

/** Trades open, their rules already seen. */
export function withTrades(data: GameData, save: SaveData): SaveData {
  return { ...withBadges(data, save), trades: { out: [], done: [], rulesSeen: true } }
}

/**
 * The Day Care open (twenty species caught), visited, its gift Egg hatched, and a Pikachu and a Raichu staying: a pair
 * that can make an Egg, so they seek each other out in the yard.
 */
export function withDayCare(data: GameData, save: SaveData, now: number): SaveData {
  const residents = [25, 26].map((dex, i) => ({
    inst: createInstance(dex, 30 + i * 8, data, `promo-dc-${i}`, now),
    since: now,
    region: 'kanto',
  }))
  return {
    ...withBadges(data, save),
    pokedex: [...new Set([...save.pokedex, ...Array.from({ length: 24 }, (_, i) => i + 1)])],
    dayCare: { residents, guests: [], eggClaimed: true, visited: true },
  }
}
