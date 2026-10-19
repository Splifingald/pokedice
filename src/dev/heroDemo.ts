// The promo "hero clip" (scripts/record-hero.ts): one wild battle, set up from a save and a seed. Shared by the seed
// finder (scripts/find-hero-seed.ts, in Node) and the dev-only harness (/__demo/hero) so both play the exact same fight.
// It only sets the starting state: every roll, number and animation is the game's own.
import {
  createBattle,
  createInstance,
  createRng,
  enemyUpgradeLevelFor,
  instanceMaxHp,
  uniformLevels,
  xpToNext,
  type BattleState,
  type Encounter,
  type GameData,
  type Rng,
  type SaveData,
} from '@/engine'

/** Cerulean Cave: Kanto's post-game cave, wild Venusaur and Victreebel at Lv.50–70. */
export const HERO_AREA_ID = 'a5d11263-453f-5181-9a73-2c30df79d3fc'
export const HERO_LEAD_ID = 'hero-lead'

export interface HeroOptions {
  /** The battle's RNG seed (the dice). */
  seed: number
  playerDex: number
  /** Charizard's fifth die (the second Flying one) comes at Lv.50: a Full House needs five dice. */
  playerLevel: number
  foeDex: number
  foeLevel: number
  /** The foe's HP when it isn't at full (null = full). */
  foeHp: number | null
  /** Every upgrade track, dice and combos: a late-Kanto save. */
  upgradeLevel: number
  /** How far the lead's XP bar is filled (0–1) before the fight. */
  xpFill: number
}

export const HERO_DEFAULTS: HeroOptions = {
  seed: 0,
  playerDex: 6,
  playerLevel: 50,
  foeDex: 3,
  foeLevel: 50,
  foeHp: null,
  upgradeLevel: 7,
  xpFill: 0.55,
}

/** The harness's URL parameters (the seed finder prints them). */
export function heroOptionsFrom(params: URLSearchParams): HeroOptions {
  const num = (key: keyof HeroOptions) => {
    const v = params.get(key)
    return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
  }
  const o = { ...HERO_DEFAULTS }
  for (const key of Object.keys(HERO_DEFAULTS) as (keyof HeroOptions)[]) {
    const v = num(key)
    if (v != null) (o as Record<keyof HeroOptions, number | null>)[key] = v
  }
  return o
}

export function heroQuery(o: HeroOptions): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o))
    if (v != null && v !== HERO_DEFAULTS[k as keyof HeroOptions]) p.set(k, String(v))
  p.set('seed', String(o.seed))
  return p.toString()
}

/**
 * The battle RNG the store's `seedRun(seed)` installs (store/run.ts): the finder must roll exactly what the harness
 * will. The recording checks the dice it sees against the finder's anyway.
 */
export const heroBattleRng = (seed: number): Rng => createRng(seed ^ 0x9e3779b9)

export const heroEncounter = (o: HeroOptions): Extract<Encounter, { kind: 'wild' }> => ({
  kind: 'wild',
  dex: o.foeDex,
  level: o.foeLevel,
  isNew: false,
})

/**
 * A save that has reached Cerulean Cave: the lead alone on the team, every track at `upgradeLevel`, and a stronger
 * copy of the foe's species already in the Box, so the wild one can't be caught: it faints (the K.O. flash) instead of
 * waiting for a ball.
 */
export function buildHeroSave(data: GameData, o: HeroOptions, now: number): SaveData {
  const lead = { ...createInstance(o.playerDex, o.playerLevel, data, HERO_LEAD_ID, now) }
  lead.xp = Math.floor(xpToNext(lead.level, data.config) * o.xpFill)
  const owned = createInstance(o.foeDex, o.foeLevel + 2, data, 'hero-boxed', now)
  const levels = uniformLevels(o.upgradeLevel)
  return {
    version: 1,
    updatedAt: now,
    gold: 24_680,
    pokedex: [...new Set([o.playerDex, o.foeDex])],
    box: [lead, owned],
    team: [lead.id],
    inventory: {},
    comboLevels: levels.comboLevels as SaveData['comboLevels'],
    dieLevels: levels.dieLevels as SaveData['dieLevels'],
    currentAreaId: HERO_AREA_ID,
    areaProgress: {},
    settings: {
      sfx: false,
      sound: false,
      reducedMotion: false,
      animations: 'full',
      multiExp: true,
      lang: 'en',
    },
    hpScale: data.config.hpMultiplier,
    region: 'kanto',
    parked: {},
    // Pop-ups a fresh save would open over the battle.
    leaderboardVisited: true,
    versusRulesSeen: true,
  }
}

/** The battle as the store's `engage()` builds it for this save (store/run.ts `startBattle`), for the seed finder. */
export function heroBattle(data: GameData, o: HeroOptions): BattleState {
  const save = buildHeroSave(data, o, 0)
  const lead = save.box.find((p) => p.id === HERO_LEAD_ID)!
  const area = data.areas.find((a) => a.id === HERO_AREA_ID)
  const enc = heroEncounter(o)
  const maxHp = instanceMaxHp({ dex: o.foeDex, level: o.foeLevel }, data)
  const { state } = createBattle(
    {
      kind: 'wild',
      team: [{ uid: lead.id, dex: lead.dex, level: lead.level, hp: lead.currentHp }],
      leadUid: lead.id,
      enemy: { dex: o.foeDex, level: o.foeLevel, hp: o.foeHp ?? maxHp },
      playerLevels: { comboLevels: save.comboLevels, dieLevels: save.dieLevels },
      enemyLevels: uniformLevels(enemyUpgradeLevelFor(enc, area, data)),
    },
    data,
  )
  return state
}
