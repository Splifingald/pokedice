/**
 * tsx scripts/nightmare-balance.ts [runs=200] [seed=1]
 * Newmoon Island's nightmare (docs/30), played by the engine.
 *
 * `rank` first (tsx scripts/nightmare-balance.ts rank): how hard each candidate foe is, all at the same level (Lv.65),
 * as the share of 1-on-1 fights the world's own Pokémon (Lv.64, every track at 8) lose to it on the battle AI, against
 * the area's foes' dice level. The nightmare's order is weakest to strongest by that measure.
 *
 * Then the nightmare end to end: a Haunted Hollow team goes in (healed), fights each round's foe on the battle AI (its
 * XP kept, as in the game), takes Darkrai's strike after each round, gets the gifts, and uses its bag between fights (a
 * Hyper Potion under 35 %, a Revive or a Max Revive on a K.O.; 4 Hyper Potions and 2 Revives bought back before each
 * try, the Mart being open), until the last round (woken up) or a wipe. Prints the
 * share of tries won, the tries a clear takes, and how far a lost try gets. Numbers are the area's
 * (scripts/content-haunted-hollow.ts); try others without editing it:
 *   UPG=7 (the foes' dice level)  TRACK=8 (yours)  STRIKE=10 (%)  LEVEL=+0 (added to every foe's level)
 */
import { BUNDLE } from '../src/config/bundle'
import {
  applyItemToInstance,
  applyNightmareStrike,
  applyVictory,
  applyWipe,
  autoStep,
  compileGameData,
  createBattle,
  createInstance,
  createRng,
  DEFAULT_CONFIG,
  enterWorld,
  instanceMaxHp,
  newSave,
  nightmareEncounter,
  nightmareStateOf,
  simulateMany,
  startNightmare,
  teamOf,
  uniformLevels,
  winNightmareRound,
  withWorldBoost,
  type GameData,
  type NightmareMode,
  type SaveData,
} from '../src/engine'
import { haunted } from './content-haunted-hollow'

const env = (k: string, d: number) => (process.env[k] != null ? Number(process.env[k]) : d)
const h = haunted()
const NM = h.areas.find((a) => a.name === 'Newmoon Island')!
const base = NM.mode as NightmareMode
const mode: NightmareMode = {
  ...base,
  strikePercent: env('STRIKE', base.strikePercent),
  foes: base.foes.map((f) => ({ ...f, level: Math.min(100, f.level + env('LEVEL', 0)) })),
}
const area = { ...NM, enemyUpgradeLevel: env('UPG', NM.enemyUpgradeLevel ?? 7), mode }
const world = { ...h.world, start: '2026-10-18T12:00:00.000Z', minBadges: 0, previewHours: 48 }
const data: GameData = compileGameData({
  ...BUNDLE,
  areas: [...BUNDLE.areas, ...h.areas.map((a) => (a.id === NM.id ? area : a))],
  regions: [...(BUNDLE.regions ?? []), h.region],
  config: {
    ...BUNDLE.config,
    smallWorlds: { access: 'all', list: [world] },
    nightmare: { access: 'all' },
    events: DEFAULT_CONFIG.events,
  },
})
const TRACK = env('TRACK', 8)
const name = (dex: number) => data.species[dex]?.name ?? `#${dex}`

// ------------------------------------------------------------------ rank: how hard each candidate is

/** Night-themed candidates, mostly Dark: the seven chosen and the ones left out. */
const CANDIDATES = [359, 262, 229, 687, 518, 430, 571, 461, 861, 553, 302, 983, 248, 635]
/** The world's own Pokémon a player brings this far (Haunted Hollow's species). */
const REFERENCE = [94, 477, 609, 681, 887, 429, 623, 478, 709, 448, 356, 354]

function rank() {
  const runs = Number(process.argv[3] ?? 60)
  const rows = CANDIDATES.map((dex) => {
    let lost = 0
    for (const ref of REFERENCE) {
      const s = simulateMany(
        { dex: ref, level: 64 },
        { dex, level: 65 },
        withWorldBoost(uniformLevels(TRACK), data, area),
        withWorldBoost(uniformLevels(area.enemyUpgradeLevel ?? 7), data, area),
        runs,
        data,
        dex * 7 + ref,
      )
      lost += 1 - s.winRate
    }
    return { dex, hard: lost / REFERENCE.length }
  }).sort((a, b) => a.hard - b.hard)
  console.log(
    `Candidates at Lv.65 against ${REFERENCE.map(name).join(', ')} at Lv.64 (tracks ${TRACK}, foes' dice ${area.enemyUpgradeLevel}), ${runs} fights each:`,
  )
  for (const r of rows) {
    const chosen = mode.foes.findIndex((f) => f.dex === r.dex)
    console.log(
      `  ${name(r.dex).padEnd(11)} ${(100 * r.hard).toFixed(0).padStart(3)} % of fights lost to it${chosen >= 0 ? `  ← round ${chosen + 1}` : ''}`,
    )
  }
}

// ------------------------------------------------------------------ the nightmare, end to end

/** Teams a player could have by then (the world's own species), strongest first. */
const TEAMS: Record<string, [number, number][]> = {
  'Dragapult 66 · Chandelure 64 · Aegislash 63': [
    [887, 66],
    [609, 64],
    [681, 63],
  ],
  // Built against the nightmare: Fighting and Bug against Dark, Electric against Honchkrow (the world's own species).
  'Lucario 64 · Galvantula 63 · Chandelure 63': [
    [448, 64],
    [596, 63],
    [609, 63],
  ],
  'Gengar 64 · Dusknoir 63 · Mismagius 62': [
    [94, 64],
    [477, 63],
    [429, 62],
  ],
  'Golurk 61 · Froslass 60 · Trevenant 60': [
    [623, 61],
    [478, 60],
    [709, 60],
  ],
}

let n = 0
const newId = () => `sim-${++n}`

function teamSave(team: [number, number][]): SaveData {
  const s = enterWorld(
    newSave(4, data, 0, newId),
    data,
    world,
    425,
    Date.parse('2026-10-20T12:00:00Z'),
    newId,
  )!
  const box = team.map(([dex, lv]) => createInstance(dex, lv, data, newId(), 0))
  const track = uniformLevels(TRACK)
  return {
    ...s,
    box,
    team: box.map((p) => p.id),
    currentAreaId: area.id,
    comboLevels: track.comboLevels as SaveData['comboLevels'],
    dieLevels: track.dieLevels as SaveData['dieLevels'],
    inventory: { 'hyper-potion': 4, revive: 2 },
  }
}

/** One try: in, then round after round until the last one or a wipe. */
function oneTry(
  start: SaveData,
  rng: ReturnType<typeof createRng>,
): { won: boolean; rounds: number; save: SaveData } {
  let save = startNightmare(start, data, area.id)!
  for (let guard = 0; guard < 50; guard++) {
    const enc = nightmareEncounter(save, data, area.id)
    if (!enc || enc.kind !== 'wild') break
    const team = teamOf(save).map((p) => ({ uid: p.id, dex: p.dex, level: p.level, hp: p.currentHp }))
    let st = createBattle(
      {
        kind: 'wild',
        team,
        leadUid: team.find((t) => t.hp > 0)?.uid,
        enemy: { dex: enc.dex, level: enc.level },
        playerLevels: withWorldBoost(
          { comboLevels: save.comboLevels, dieLevels: save.dieLevels },
          data,
          area,
        ),
        enemyLevels: withWorldBoost(uniformLevels(area.enemyUpgradeLevel ?? 7), data, area),
      },
      data,
    ).state
    for (let i = 0; i < 4000 && !['won', 'lost', 'fled'].includes(st.phase); i++) {
      const next = autoStep(st, data, rng).state
      if (next === st) break
      st = next
    }
    const hp = Object.fromEntries(st.player.map((b) => [b.uid, b.hp]))
    save = { ...save, box: save.box.map((p) => (p.id in hp ? { ...p, currentHp: hp[p.id]! } : p)) }
    if (st.phase !== 'won') {
      const rounds = nightmareStateOf(save, area.id).round
      return { won: false, rounds, save: applyWipe(save, area.id, data) }
    }
    save = applyVictory(
      save,
      {
        areaId: area.id,
        kind: 'wild',
        enemyDex: enc.dex,
        enemyLevel: enc.level,
        fighterUid: st.player[st.activeIndex]!.uid,
      },
      data,
      rng,
      0,
      newId,
    ).save
    const w = winNightmareRound(save, data, area.id)!
    if (w.victory) return { won: true, rounds: w.total, save: w.save }
    save = applyNightmareStrike(w.save, data, area.id)?.save ?? w.save
    // The bag between fights: a Revive (a Max Revive first) on a K.O., a Hyper Potion under 35 %.
    for (const p of teamOf(save)) {
      const max = instanceMaxHp(p, data)
      const keys =
        p.currentHp <= 0 ? ['max-revive', 'revive'] : p.currentHp < max * 0.35 ? ['hyper-potion'] : []
      const key = keys.find((k) => (save.inventory[k] ?? 0) > 0)
      if (key) save = applyItemToInstance(save, key, p.id, data) ?? save
    }
  }
  return { won: false, rounds: nightmareStateOf(save, area.id).round, save }
}

function run() {
  const runs = Number(process.argv[2] ?? 200)
  const seed = Number(process.argv[3] ?? 1)
  console.log(
    `Newmoon Island's nightmare: ${mode.foes.map((f) => `${name(f.dex)} ${f.level}`).join(' → ')}; strike ${mode.strikePercent} %; foes' dice ${area.enemyUpgradeLevel}, yours ${TRACK}; ${runs} players a team, up to 10 tries each`,
  )
  for (const [label, team] of Object.entries(TEAMS)) {
    const rng = createRng(seed)
    let tries = 0
    let wins = 0
    let cleared = 0
    let triesToClear = 0
    let lostRounds = 0
    let lost = 0
    for (let r = 0; r < runs; r++) {
      let save = teamSave(team)
      for (let k = 1; k <= 10; k++) {
        // The Mart stays open: between tries the player buys the same supplies back.
        save = {
          ...save,
          inventory: {
            ...save.inventory,
            'hyper-potion': 4,
            revive: Math.max(2, save.inventory.revive ?? 0),
          },
        }
        const res = oneTry(save, rng)
        tries++
        save = res.save
        if (res.won) {
          wins++
          cleared++
          triesToClear += k
          break
        }
        lost++
        lostRounds += res.rounds
      }
    }
    console.log(
      `${label}: ${((100 * wins) / tries).toFixed(0)} % of tries won · ${((100 * cleared) / runs).toFixed(0)} % clear within 10 tries, in ${(triesToClear / Math.max(1, cleared)).toFixed(1)} tries on average · a lost try wins ${(lostRounds / Math.max(1, lost)).toFixed(1)} rounds`,
    )
  }
}

if (process.argv[2] === 'rank') rank()
else run()
