/**
 * tsx scripts/portal-balance.ts [runs=200] [seed=1]
 * Distortion World's portal run (docs/28), played by the engine end to end: a Haunted Hollow team goes in (healed),
 * fights each wild card on the battle AI (its XP kept, as in the game), picks up each find, takes a boon at each
 * distortion (revive, else heal when hurt, else a die, a boost, an item), and uses its bag between fights (a Hyper Potion
 * under 35 %, a Revive on a K.O.). A try ends on the last portal (won) or a wipe. Prints the share of tries won, the
 * tries a clear takes, and how far a lost try gets. The numbers are the area's (scripts/content-haunted-hollow.ts);
 * try others without editing it:
 *   UPG=8 (the foes' dice level)  TRACK=8 (yours)  PORTALS=10  WILD=5  LEVEL=+0 (added to each team's levels)
 */
import { BUNDLE } from '../src/config/bundle'
import {
  applyItemToInstance,
  applyVictory,
  applyWipe,
  autoStep,
  compileGameData,
  createBattle,
  createInstance,
  createRng,
  DEFAULT_CONFIG,
  drawPortalCard,
  enterWorld,
  instanceMaxHp,
  newSave,
  openDistortion,
  pickDistortion,
  pickUpItem,
  portalDiceFor,
  portalEncounter,
  portalLevels,
  portalStateOf,
  progressOf,
  startPortalRun,
  teamOf,
  uniformLevels,
  withWorldBoost,
  type DistortionOffer,
  type GameData,
  type PortalRunMode,
  type SaveData,
} from '../src/engine'
import { haunted } from './content-haunted-hollow'

const RUNS = Number(process.argv[2] ?? 200)
const SEED = Number(process.argv[3] ?? 1)
const env = (k: string, d: number) => (process.env[k] != null ? Number(process.env[k]) : d)
const h = haunted()
const DW = h.areas.find((a) => a.name === 'Distortion World')!
// An area's mode is a portal run or a nightmare (docs/30): Distortion World's is its portal run.
const dwMode = DW.mode as PortalRunMode
const area = {
  ...DW,
  enemyUpgradeLevel: env('UPG', DW.enemyUpgradeLevel ?? 8),
  mode: { ...dwMode, portals: env('PORTALS', dwMode.portals), wild: env('WILD', dwMode.wild) },
}
const world = { ...h.world, start: '2026-10-18T12:00:00.000Z', minBadges: 0, previewHours: 48 }
const data: GameData = compileGameData({
  ...BUNDLE,
  areas: [...BUNDLE.areas, ...h.areas.map((a) => (a.id === DW.id ? area : a))],
  regions: [...(BUNDLE.regions ?? []), h.region],
  config: {
    ...BUNDLE.config,
    smallWorlds: { access: 'all', list: [world] },
    portalRun: { access: 'all' },
    events: DEFAULT_CONFIG.events,
  },
})
const TRACK = env('TRACK', 8)
const LEVEL = env('LEVEL', 0)

/** Teams a player could have at the end of the world (its own species), strongest first. */
const TEAMS: Record<string, [number, number][]> = {
  'Dragapult 68 · Chandelure 66 · Aegislash 65': [
    [887, 68],
    [609, 66],
    [681, 65],
  ],
  'Gengar 66 · Dusknoir 65 · Mismagius 64': [
    [94, 66],
    [477, 65],
    [429, 64],
  ],
  'Golurk 62 · Froslass 61 · Trevenant 60': [
    [623, 62],
    [478, 61],
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
  const box = team.map(([dex, lv]) => createInstance(dex, Math.min(100, lv + LEVEL), data, newId(), 0))
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

const RANK: Record<DistortionOffer['kind'], number> = { revive: 0, heal: 1, die: 2, boost: 3, item: 4 }

/** One try: in, then on until the last portal or a wipe. */
function oneTry(
  start: SaveData,
  rng: ReturnType<typeof createRng>,
): { won: boolean; closed: number; fights: number; save: SaveData } {
  let save = startPortalRun(start, data, area.id, rng)!
  let fights = 0
  for (let guard = 0; guard < 500; guard++) {
    const drawn = drawPortalCard(save, data, area.id, rng)!
    save = drawn.save
    if (drawn.card === 'distortion') {
      const o = openDistortion(save, data, area.id, rng)!
      save = o.save
      if (o.victory) return { won: true, closed: area.mode.portals, fights, save }
      const offers = portalStateOf(save, area.id).offers ?? []
      if (!offers.length) continue
      const hurt = teamOf(save).some((p) => p.currentHp > 0 && p.currentHp < instanceMaxHp(p, data) * 0.6)
      const order = offers
        .map((x, i) => ({ x, i, r: x.kind === 'heal' && !hurt ? 5 : RANK[x.kind] }))
        .sort((a, b) => a.r - b.r)
      save = pickDistortion(save, data, area.id, order[0]!.i, rng)!.save
      continue
    }
    const ctx = {
      area,
      progress: progressOf(save, area.id),
      data,
      teamAvgLevel: 65,
      teamHurt: false,
      isFirstInArea: false,
      pokedex: save.pokedex,
    }
    const enc = portalEncounter(ctx, drawn.card, rng)!
    if (enc.encounter.kind === 'item') {
      save = pickUpItem(save, area.id, enc.encounter, data, 0, newId)
      continue
    }
    if (enc.encounter.kind !== 'wild') continue
    fights++
    const team = teamOf(save).map((p) => ({
      uid: p.id,
      dex: p.dex,
      level: p.level,
      hp: p.currentHp,
      ...portalDiceFor(save, data, area.id, p.id),
    }))
    const lead = team.find((t) => t.hp > 0)?.uid
    let st = createBattle(
      {
        kind: 'wild',
        team,
        leadUid: lead,
        enemy: { dex: enc.encounter.dex, level: enc.encounter.level },
        playerLevels: portalLevels(
          withWorldBoost({ comboLevels: save.comboLevels, dieLevels: save.dieLevels }, data, area),
          save,
          data,
          area.id,
        ),
        enemyLevels: withWorldBoost(uniformLevels(area.enemyUpgradeLevel), data, area),
      },
      data,
    ).state
    for (let i = 0; i < 4000 && !['won', 'lost', 'fled'].includes(st.phase); i++) {
      const next = autoStep(st, data, rng).state
      if (next === st) break // a stalemate: nobody can act on the other
      st = next
    }
    const hp = Object.fromEntries(st.player.map((b) => [b.uid, b.hp]))
    save = { ...save, box: save.box.map((p) => (p.id in hp ? { ...p, currentHp: hp[p.id]! } : p)) }
    if (st.phase === 'lost') {
      const closed = portalStateOf(save, area.id).closed
      return { won: false, closed, fights, save: applyWipe(save, area.id, data) }
    }
    if (st.phase === 'won') {
      const fighter = st.player[st.activeIndex]!.uid
      save = applyVictory(
        save,
        {
          areaId: area.id,
          kind: 'wild',
          enemyDex: st.enemy.dex,
          enemyLevel: st.enemy.level,
          fighterUid: fighter,
        },
        data,
        rng,
        0,
        newId,
      ).save
    }
    // The bag between fights: a Revive on a K.O., a Hyper Potion under 35 %.
    for (const p of teamOf(save)) {
      const max = instanceMaxHp(p, data)
      const key = p.currentHp <= 0 ? 'revive' : p.currentHp < max * 0.35 ? 'hyper-potion' : null
      if (key && (save.inventory[key] ?? 0) > 0) save = applyItemToInstance(save, key, p.id, data) ?? save
    }
  }
  return { won: false, closed: portalStateOf(save, area.id).closed, fights, save }
}

console.log(
  `Distortion World portal run: ${area.mode.portals} portals, ${area.mode.wild} wild + ${area.mode.items} find a cycle, wild Lv.${Math.min(...area.wildPool.map((w) => w.minLevel))}–${Math.max(...area.wildPool.map((w) => w.maxLevel))}, foes' dice ${area.enemyUpgradeLevel}, yours ${TRACK}; ${RUNS} players a team, up to 10 tries each`,
)
for (const [name, team] of Object.entries(TEAMS)) {
  const rng = createRng(SEED)
  let tries = 0
  let wins = 0
  let cleared = 0
  let triesToClear = 0
  let lostClosed = 0
  let lost = 0
  let fights = 0
  for (let r = 0; r < RUNS; r++) {
    let save = teamSave(team)
    for (let k = 1; k <= 10; k++) {
      const res = oneTry(save, rng)
      tries++
      fights += res.fights
      save = res.save
      if (res.won) {
        wins++
        cleared++
        triesToClear += k
        break
      }
      lost++
      lostClosed += res.closed
    }
  }
  console.log(
    `${name}: ${((100 * wins) / tries).toFixed(0)} % of tries won · ${((100 * cleared) / RUNS).toFixed(0)} % clear within 10 tries, in ${(triesToClear / Math.max(1, cleared)).toFixed(1)} tries on average · a lost try closes ${(lostClosed / Math.max(1, lost)).toFixed(1)} portals · ${(fights / tries).toFixed(1)} fights a try`,
  )
}
