/**
 * pnpm tsx scripts/patch-region-flavours.ts — the region flavours' data (docs/62), written into the bundle (src/data)
 * and safe to run again: Paldea's five Titans as their areas' bosses (§7), and Vast Poni Canyon's Totem Kommo-o, a gym
 * row there only for its island trial, before Hapu (§6). The weather's areas and the trials themselves are the game's
 * own content (src/engine/flavoursContent.ts); migrations 0117 and 0118 carry the same rows to the database.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Area, BossDef, Trainer } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AREAS = path.join(ROOT, 'src/data/areas.json')
const TRAINERS = path.join(ROOT, 'src/data/trainers.json')

/** The Titans (docs/62 §7), by area: the boss each area gets. */
export const TITANS: { areaId: string; boss: BossDef }[] = [
  // South Province (Area Three) & Cortondo: the Stony Cliff Titan.
  { areaId: '6a5018d6-00f7-5b1d-9f19-941dd6158856', boss: { dex: 950, level: 16, titan: {} } },
  // West Province (Area One) & the Segin Squad's Base: the Open Sky Titan.
  { areaId: '39632d00-434b-5ba5-ada5-38b1a69af1d4', boss: { dex: 962, level: 20, titan: {} } },
  // The Schedar Squad's Base & East Province (Area Three): the Lurking Steel Titan.
  { areaId: '4bd4ee06-1d09-54d6-a3b8-749099e52f76', boss: { dex: 968, level: 29, titan: {} } },
  // The Asado Desert & Cascarrafa: the Quaking Earth Titan, Iron Treads on Violet's side.
  { areaId: '806671c7-1a49-543d-bea9-38f1c6cf3b60', boss: { dex: 984, level: 33, titan: { versionDex: 990 } } },
  // Casseroya Lake: the False Dragon Titan, Dondozo with Tatsugiri.
  { areaId: '2157b46b-a121-543b-9cca-b18fdc85d65e', boss: { dex: 977, level: 56, titan: { partner: { dex: 978, level: 57 } } } },
]

/** Vast Poni Canyon's trial (docs/62 §6): its gym row, before Hapu's. */
export const KOMMO_O: Trainer = {
  id: '7278511c-319e-5fc1-a053-0be766cb70fd',
  name: 'Totem Kommo-o',
  spriteUrl: '/trainers/classes/alola/hapu.png',
  team: [{ dex: 784, level: 45 }],
  role: 'leader',
  badge: null,
  upgradeLevel: null,
  battleBackground: 'default',
}
export const VAST_PONI = 'e7ae24d0-80a4-51d7-a9cb-c0df82d25286'
export const HAPU = 'c6106307-fd9e-50e1-aa2c-8edd1069cb8f'

/**
 * One trial per type (docs/62 §6, the user's call): the six Totems for the types Alola's trials don't give (Flying,
 * Poison, Bug, Steel, Psychic, Ice), each a gym row of its own, the only gym of its area. Migration 0120.
 */
export const TYPE_TRIALS: { areaId: string; trainer: Trainer }[] = [
  {
    areaId: '87cba513-0bc5-55df-a781-9de73048528c',
    trainer: {
      id: '8cebb4a0-7553-5d00-904d-0461d1389075',
      name: 'Totem Toucannon',
      spriteUrl: '/trainers/classes/alola/elite-kahili.png',
      team: [{ dex: 733, level: 18 }],
      role: 'leader',
      badge: null,
      upgradeLevel: null,
      battleBackground: 'default',
    },
  },
  {
    areaId: '0e1ccc24-1c60-56e1-9f03-4b3deda34951',
    trainer: {
      id: '23c7789e-eb83-55e8-96bb-9bb2097fe93d',
      name: 'Totem Toxapex',
      spriteUrl: '/trainers/classes/alola/plumeria.png',
      team: [{ dex: 748, level: 27 }],
      role: 'leader',
      badge: null,
      upgradeLevel: null,
      battleBackground: 'default',
    },
  },
  {
    areaId: '7d3ee2f7-3442-5738-b2c6-d3037e514fec',
    trainer: {
      id: '65e861d9-c327-56f8-aa34-bd8710000c3a',
      name: 'Totem Araquanid',
      spriteUrl: '/trainers/classes/alola/guzma.png',
      team: [{ dex: 752, level: 28 }],
      role: 'leader',
      badge: null,
      upgradeLevel: null,
      battleBackground: 'default',
    },
  },
  {
    areaId: 'd6ba26d1-3dd2-51fc-b559-74c01d2ddba2',
    trainer: {
      id: '9f29379a-7508-5443-8710-c533da46baa5',
      name: 'Totem Togedemaru',
      spriteUrl: '/trainers/classes/alola/elite-molayne.png',
      team: [{ dex: 777, level: 31 }],
      role: 'leader',
      badge: null,
      upgradeLevel: null,
      battleBackground: 'default',
    },
  },
  {
    areaId: '3463beea-946a-5c99-89d1-19dc707896e8',
    trainer: {
      id: 'ce72ec00-480b-588e-9ffb-178257855a46',
      name: 'Totem Bruxish',
      spriteUrl: '/trainers/classes/alola/faba.png',
      team: [{ dex: 779, level: 33 }],
      role: 'leader',
      badge: null,
      upgradeLevel: null,
      battleBackground: 'default',
    },
  },
  {
    areaId: 'db4e5701-dfdf-54dd-bfee-002c1fdcc391',
    trainer: {
      id: 'a8411dd0-0c2b-5f0f-ac1a-0556001dc88d',
      name: 'Totem Ninetales',
      spriteUrl: '/trainers/classes/alola/lillie.png',
      team: [{ dex: 10104, level: 52 }],
      role: 'leader',
      badge: null,
      upgradeLevel: null,
      battleBackground: 'default',
    },
  },
]

async function main() {
  const areas = JSON.parse(await readFile(AREAS, 'utf8')) as Area[]
  for (const { areaId, boss } of TITANS) {
    const a = areas.find((x) => x.id === areaId)
    if (!a) throw new Error(`no area ${areaId}`)
    if ((a.legendaryBoss ?? []).some((b) => b.dex === boss.dex)) continue
    a.legendaryBoss = [...(a.legendaryBoss ?? []), boss]
  }
  const canyon = areas.find((x) => x.id === VAST_PONI)
  if (!canyon) throw new Error('no Vast Poni Canyon')
  if (!canyon.gyms.includes(KOMMO_O.id)) {
    const at = canyon.gyms.indexOf(HAPU)
    canyon.gyms.splice(at < 0 ? 0 : at, 0, KOMMO_O.id)
  }
  for (const { areaId, trainer } of TYPE_TRIALS) {
    const a = areas.find((x) => x.id === areaId)
    if (!a) throw new Error(`no area ${areaId}`)
    if (!a.gyms.includes(trainer.id)) a.gyms = [...a.gyms, trainer.id]
  }
  await writeFile(AREAS, JSON.stringify(areas, null, 1) + '\n')

  const trainers = JSON.parse(await readFile(TRAINERS, 'utf8')) as Trainer[]
  // At the front, as the rivals' are (docs/61): the double battles' patch adds its pairs at the end.
  const ours = [KOMMO_O, ...TYPE_TRIALS.map((t) => t.trainer)]
  const rest = trainers.filter((t) => !ours.some((o) => o.id === t.id))
  await writeFile(TRAINERS, JSON.stringify([...ours, ...rest], null, 1) + '\n')
  console.log('✓ the Titans and the trials’ own Totems are in the bundle')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
