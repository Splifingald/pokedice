// Audit saves: fresh, early (1 badge), mid (3 badges, Day Care, full Box), late (League, events, Versus).
import { writeFileSync } from 'node:fs'
import { createInstance, linearAreas, progressOf, type SaveData } from '../../src/engine'
import { gameData, makeSave } from '../../e2e/helpers'

const data = gameData()
const chain = linearAreas(data, 'kanto')
let n = 0
const mk = (dex: number, level: number) => createInstance(dex, level, data, `au-${++n}`, Date.now())

function clearUntilBadges(base: SaveData, badges: number): SaveData {
  const areaProgress = { ...base.areaProgress }
  let got = 0
  let i = 0
  for (; i < chain.length && got < badges; i++) {
    const a = chain[i]!
    areaProgress[a.id] = {
      ...progressOf(base, a.id),
      roundsDone: a.roundsToClear ?? 0,
      cleared: true,
      gymsDefeated: [...a.gyms],
      bossDefeated: true,
      bossesDefeated: (a.legendaryBoss ?? []).map((b) => b.dex),
    }
    got += a.gyms.filter((g) => data.trainers[g]?.badge).length
  }
  return { ...base, areaProgress, currentAreaId: chain[Math.min(i, chain.length - 1)]!.id }
}

const out: Record<string, SaveData> = {}

out.fresh = makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 300 })

{
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 640 })
  const extra = [mk(16, 9), mk(19, 8)]
  const s = clearUntilBadges(base, 1)
  out.early = {
    ...s,
    box: [...base.box, ...extra],
    team: [base.team[0]!, extra[0]!.id, extra[1]!.id],
    pokedex: [...new Set([...base.pokedex, 16, 19, 10, 13])],
    inventory: { potion: 3, 'poke-ball': 6 },
  }
}

{
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 4280 })
  const dexes = [25, 74, 17, 19, 10, 21, 27, 35, 39, 41, 43, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 77, 79, 81, 84, 86, 90, 92]
  const extra = dexes.map((d, i) => mk(d, 8 + (i % 14)))
  const s = clearUntilBadges(base, 3)
  const team0 = createInstance(5, 24, data, 'au-lead', Date.now())
  out.mid = {
    ...s,
    box: [team0, ...extra],
    team: [team0.id, extra[0]!.id, extra[1]!.id],
    pokedex: [...new Set([4, 5, ...dexes])],
    inventory: { potion: 6, 'super-potion': 2, 'poke-ball': 14, 'great-ball': 5, revive: 1, 'fire-stone': 1 },
    dayCare: {
      residents: [{ inst: mk(133, 24), since: Date.now() - 3_600_000, region: 'kanto' }],
      guests: [],
      eggClaimed: true,
      visited: true,
    },
  } as SaveData
}

{
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 48_500 })
  const s = clearUntilBadges(base, 99)
  const league = chain[chain.length - 1]!
  const ap = { ...s.areaProgress }
  for (const a of chain) ap[a.id] = { ...progressOf(base, a.id), roundsDone: a.roundsToClear ?? 0, cleared: true, gymsDefeated: [...a.gyms], bossDefeated: true, bossesDefeated: (a.legendaryBoss ?? []).map((b) => b.dex) }
  const team = [createInstance(6, 72, data, 'au-cz', Date.now()), createInstance(3, 64, data, 'au-vn', Date.now()), createInstance(9, 61, data, 'au-bl', Date.now())]
  const extra = Array.from({ length: 60 }, (_, i) => mk(1 + ((i * 7) % 151), 20 + (i % 40)))
  out.late = {
    ...s,
    areaProgress: ap,
    currentAreaId: league.id,
    box: [...team, ...extra],
    team: team.map((p) => p.id),
    pokedex: Array.from({ length: 128 }, (_, i) => i + 1),
    inventory: { potion: 12, 'super-potion': 8, 'hyper-potion': 4, 'poke-ball': 30, 'great-ball': 12, 'ultra-ball': 6, revive: 4, 'rare-candy': 2 },
    events: { seen: ['wheel', 'raid', 'rebattle'] },
    regionOfferSeen: ['johto'],
    dayCare: { residents: [], guests: [], eggClaimed: true, visited: true },
  } as SaveData
}

writeFileSync(process.argv[2]!, JSON.stringify(out))
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { box: v.box.length, area: data.areas.find((a) => a.id === v.currentAreaId)?.name }])))
