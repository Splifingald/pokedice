/**
 * Double battles' content (docs/31): the trainers who fight 2 v 2 where double battles are on.
 *
 * Two parts. The trainers already in the game whose sprite is a pair (Tate & Liza, the Twins, the Backers) get
 * `duo: true`, by id. And the real games' pairs join the regions from Hoenn on (Twins, Young Couples, Interviewers,
 * Sis and Bro…), one area each, with the level of that area's other trainers and species of its region. Teams keep
 * the game's 1–3 Pokémon (a duo has at least 2: two out at once).
 *
 * This file is the single source of that content. The bundle in src/data has it already (`--data` wrote it), and
 * `pnpm seed-regions`, which rebuilds a region's trainers from its content script (Paldea by default) and would drop
 * the region's duos, puts them back through `withDuos` before it writes. The ids are stable (`stableUuid` of the
 * area's content key and the trainer's name), so every route lands on the same rows.
 *
 * `tsx scripts/patch-double-battles.ts <in-bundle.json> <out-bundle.json>` patches an admin export for
 * `pnpm import-bundle`; `tsx scripts/patch-double-battles.ts --data` patches src/data in place;
 * `tsx scripts/patch-double-battles.ts --sql <out.sql>` writes the migration
 * (supabase/migrations/0061_double_battles.sql). All three are safe to run again.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CONFIG } from '../src/engine/defaults'
import type { Area, BundleRaw, Trainer, TrainerPoolEntry } from '../src/engine/types'
import { stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Trainers already in the bundle whose look is a pair: [id, name], the name only to check the id is the right one. */
export const FLAGGED: [id: string, name: string][] = [
  ['582c1122-ca81-5b64-a4c8-d455554f2570', 'Tate & Liza'],
  ['56284c75-e667-5e52-966b-b3c3041866c8', 'Twins Amy & May'],
  ['c5dc5114-841f-5b5d-a4b4-9b33a1b1347f', 'Twins Amy'],
  ['376bfd3f-3f05-5175-9fd9-44ff0abd3638', 'Twins Kumi & Amy'],
  ['6cf459d4-cec9-5deb-8f8f-296022205951', 'Backers Ami & Eli'],
  ['ff0ad17b-2648-57cb-8571-333d0102c364', 'Twins Mia & Pia'],
]

export interface DuoPlan {
  region: string
  /** The area's content key (scripts/content-<region>.ts): its id is `stableUuid('area:<key>')`. */
  area: string
  name: string
  /** A pair's sprite. Hoenn's are the Gen 3 ones at the root and ORAS's (kept with Kalos's); Alola, Galar and Paldea
   * have no pair of their own, so they borrow Kalos's, as their other classes borrow where a sheet has none. */
  sprite: string
  team: [dex: number, level: number][]
}

const SPRITE = {
  twins3: '/trainers/classes/twins.png',
  crushKin: '/trainers/classes/crush-kin.png',
  sisAndBro: '/trainers/classes/sis-and-bro.png',
  coolCouple: '/trainers/classes/cool-couple.png',
  interviewers: '/trainers/classes/kalos/interviewers.png',
  couple6: '/trainers/classes/kalos/young-couple.png',
  twins6: '/trainers/classes/kalos/twins.png',
  twins4: '/trainers/classes/sinnoh/twins.png',
  couple4: '/trainers/classes/sinnoh/young-couple.png',
  twins5: '/trainers/classes/unova/twins.png',
  backers: '/trainers/classes/unova/backers.png',
}

/** The new pairs. Levels are the area's other trainers'; the species are found in that area or its region. */
export const NEW_DUOS: DuoPlan[] = [
  // Hoenn: Emerald's and ORAS's pairs, Gabby & Ty twice as in the games (their Pokémon grown the second time).
  {
    region: 'hoenn',
    area: 'ho-routes-102-103',
    name: 'Twins Amy & Liv',
    sprite: SPRITE.twins3,
    team: [
      [311, 7],
      [312, 7],
    ],
  },
  {
    region: 'hoenn',
    area: 'ho-petalburg-woods',
    name: 'Twins Gina & Mia',
    sprite: SPRITE.twins3,
    team: [
      [273, 10],
      [270, 10],
    ],
  },
  {
    region: 'hoenn',
    area: 'ho-dewford-town',
    name: 'Crush Kin Mik & Kia',
    sprite: SPRITE.crushKin,
    team: [
      [296, 18],
      [307, 18],
    ],
  },
  {
    region: 'hoenn',
    area: 'ho-route-111-desert',
    name: 'Interviewers Gabby & Ty',
    sprite: SPRITE.interviewers,
    team: [
      [81, 27],
      [293, 27],
    ],
  },
  {
    region: 'hoenn',
    area: 'ho-weather-institute',
    name: 'Young Couple Lois & Hal',
    sprite: SPRITE.couple6,
    team: [
      [313, 37],
      [314, 37],
    ],
  },
  {
    region: 'hoenn',
    area: 'ho-shoal-cave',
    name: 'Sis and Bro Lila & Roy',
    sprite: SPRITE.sisAndBro,
    team: [
      [171, 46],
      [319, 46],
    ],
  },
  {
    region: 'hoenn',
    area: 'ho-mossdeep-city',
    name: 'Interviewers Gabby & Ty',
    sprite: SPRITE.interviewers,
    team: [
      [82, 48],
      [294, 48],
    ],
  },
  {
    region: 'hoenn',
    area: 'ho-victory-road',
    name: 'Cool Couple Lea & Jed',
    sprite: SPRITE.coolCouple,
    team: [
      [334, 54],
      [308, 54],
    ],
  },
  // Sinnoh
  {
    region: 'sinnoh',
    area: 'si-cycling-road',
    name: 'Twins Liv & Liz',
    sprite: SPRITE.twins4,
    team: [
      [417, 22],
      [427, 22],
    ],
  },
  {
    region: 'sinnoh',
    area: 'si-hearthome',
    name: 'Young Couple Ty & Sue',
    sprite: SPRITE.couple4,
    team: [
      [431, 27],
      [441, 27],
    ],
  },
  {
    region: 'sinnoh',
    area: 'si-pastoria',
    name: 'Twins Teri & Tia',
    sprite: SPRITE.twins4,
    team: [
      [418, 34],
      [422, 34],
    ],
  },
  {
    region: 'sinnoh',
    area: 'si-victory-road',
    name: 'Cool Couple Zac & Jen',
    sprite: SPRITE.coolCouple,
    team: [
      [475, 51],
      [282, 51],
    ],
  },
  // Unova
  {
    region: 'unova',
    area: 'un-castelia',
    name: 'Twins Kiri & Jan',
    sprite: SPRITE.twins5,
    team: [
      [546, 21],
      [548, 21],
    ],
  },
  {
    region: 'unova',
    area: 'un-mistralton',
    name: 'Backers Ruth & Mel',
    sprite: SPRITE.backers,
    team: [
      [587, 33],
      [585, 33],
      [520, 33],
    ],
  },
  {
    region: 'unova',
    area: 'un-icirrus',
    name: 'Twins Rio & Mia',
    sprite: SPRITE.twins5,
    team: [
      [588, 37],
      [616, 37],
    ],
  },
  {
    region: 'unova',
    area: 'un-victory-road',
    name: 'Backers Ivy & Juan',
    sprite: SPRITE.backers,
    team: [
      [626, 47],
      [627, 47],
      [629, 47],
    ],
  },
  // Kalos
  {
    region: 'kalos',
    area: 'ka-geosenge',
    name: 'Twins Lia & Lea',
    sprite: SPRITE.twins6,
    team: [
      [587, 22],
      [309, 22],
    ],
  },
  {
    region: 'kalos',
    area: 'ka-coumarine',
    name: 'Young Couple Zane & Jen',
    sprite: SPRITE.couple6,
    team: [
      [241, 28],
      [128, 28],
    ],
  },
  {
    region: 'kalos',
    area: 'ka-couriway',
    name: 'Young Couple Owen & Ola',
    sprite: SPRITE.couple6,
    team: [
      [195, 49],
      [705, 49],
    ],
  },
  // Alola
  {
    region: 'alola',
    area: 'al-heahea',
    name: 'Twins Kai & Lani',
    sprite: SPRITE.twins6,
    team: [
      [731, 15],
      [761, 15],
    ],
  },
  {
    region: 'alola',
    area: 'al-aether-house',
    name: 'Young Couple Noa & Mele',
    sprite: SPRITE.couple6,
    team: [
      [120, 25],
      [456, 25],
    ],
  },
  {
    region: 'alola',
    area: 'al-haina-desert',
    name: 'Twins Ana & Ula',
    sprite: SPRITE.twins6,
    team: [
      [10101, 32],
      [10103, 32],
    ],
  },
  // Galar
  {
    region: 'galar',
    area: 'ga-turffield',
    name: 'Twins Ella & Effie',
    sprite: SPRITE.twins6,
    team: [
      [835, 17],
      [831, 17],
    ],
  },
  {
    region: 'galar',
    area: 'ga-ballonlea',
    name: 'Young Couple Rory & Tess',
    sprite: SPRITE.couple6,
    team: [
      [857, 36],
      [860, 36],
    ],
  },
  {
    region: 'galar',
    area: 'ga-circhester',
    name: 'Twins Bree & Bea',
    sprite: SPRITE.twins6,
    team: [
      [872, 42],
      [361, 42],
    ],
  },
  // Paldea
  {
    region: 'paldea',
    area: 'pa-mesagoza',
    name: 'Twins Pia & Pilar',
    sprite: SPRITE.twins6,
    team: [
      [924, 11],
      [926, 11],
    ],
  },
  {
    region: 'paldea',
    area: 'pa-medali',
    name: 'Young Couple Leo & Rosa',
    sprite: SPRITE.couple6,
    team: [
      [973, 34],
      [916, 34],
    ],
  },
  {
    region: 'paldea',
    area: 'pa-ruchbah',
    name: 'Twins Sol & Luz',
    sprite: SPRITE.twins6,
    team: [
      [958, 48],
      [707, 48],
    ],
  },
]

export const areaIdOf = (key: string) => stableUuid(`area:${key}`)

/** A new pair as a trainer row: a plain trainer of its area, the flag set. */
export function duoTrainer(d: DuoPlan): Trainer {
  return {
    id: stableUuid(`duo:${d.area}:${d.name}`),
    name: d.name,
    spriteUrl: d.sprite,
    team: d.team.map(([dex, level]) => ({ dex, level })),
    role: 'trainer',
    badge: null,
    upgradeLevel: null,
    battleBackground: null,
    duo: true,
  }
}

/** Its row in its area's random trainer pool, at the weight every other trainer there has. */
export function duoPoolEntry(d: DuoPlan): TrainerPoolEntry {
  return { id: stableUuid(`duopool:${d.area}:${d.name}`), trainerId: duoTrainer(d).id, weight: 10 }
}

/**
 * Areas and trainers with the duos in: the pairs flagged, each new one added where its area is present and it isn't
 * yet (a region not in this content is skipped). Everything else as it was, so it can run again.
 */
export function withDuos<T extends { areas: Area[]; trainers: Trainer[] }>(b: T): T {
  const flagged = new Set(FLAGGED.map(([id]) => id))
  const placed = NEW_DUOS.filter((d) => b.areas.some((a) => a.id === areaIdOf(d.area)))
  const have = new Set(b.trainers.map((t) => t.id))
  return {
    ...b,
    trainers: [
      ...b.trainers.map((t) => (flagged.has(t.id) && !t.duo ? { ...t, duo: true } : t)),
      ...placed.map(duoTrainer).filter((t) => !have.has(t.id)),
    ],
    areas: b.areas.map((a) => {
      const add = placed
        .filter((d) => areaIdOf(d.area) === a.id)
        .map(duoPoolEntry)
        .filter((e) => !a.trainerPool.some((p) => p.id === e.id))
      return add.length ? { ...a, trainerPool: [...a.trainerPool, ...add] } : a
    }),
  }
}

/** An admin export with this change in it: the duos, the switch Off where missing, the content version + 1. */
export function patchDoubleBattles(b: BundleRaw): BundleRaw {
  const config = b.config as Record<string, unknown>
  return {
    ...withDuos(b),
    config: {
      ...config,
      configVersion: Number(config.configVersion ?? 0) + 1,
      // The switch stays where the admin left it; Off when there is none yet (docs/15 §20).
      doubleBattles: config.doubleBattles ?? DEFAULT_CONFIG.doubleBattles,
    },
  }
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`

export function doubleBattlesSql(): string {
  const flagged = FLAGGED.map(([id]) => q(id)).join(', ')
  const trainers = NEW_DUOS.map((d) => {
    const t = duoTrainer(d)
    return `  (${q(t.id)}, ${q(areaIdOf(d.area))}, ${q(t.name)}, ${q(t.spriteUrl!)}, ${q(JSON.stringify(t.team))})`
  }).join(',\n')
  const pool = NEW_DUOS.map((d) => {
    const e = duoPoolEntry(d)
    return `  (${q(e.id)}, ${q(areaIdOf(d.area))}, ${q(e.trainerId)}, ${e.weight})`
  }).join(',\n')
  return [
    '-- Double battles (docs/31). Generated by `tsx scripts/patch-double-battles.ts --sql`: do not edit by hand. Safe to',
    "-- run again; it patches only what this feature adds, over the admin's later edits:",
    '--  1. trainers.duo: the pairs who fight 2 v 2 where double battles are on. Set on the trainers whose look is a pair',
    '--     (Tate & Liza, the Twins, the Backers) once, when the column is added, so an admin who unticks one keeps it so.',
    "--  2. The real games' pairs from Hoenn on, each in one area's trainer pool (only where that area exists; a",
    '--     trainer or pool row already there is left as it is).',
    '--  3. game_config `doubleBattles`: the switch, Off (left alone when there).',
    '--  4. configVersion + 1, so players fetch the new content.',
    'begin;',
    '',
    `do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'trainers' and column_name = 'duo') then
    alter table trainers add column duo boolean not null default false;
    update trainers set duo = true where id in (${flagged});
  end if;
end $$;`,
    '',
    `insert into trainers (id, name, sprite_url, team, role, badge, upgrade_level, battle_background, duo)
select v.id::uuid, v.name, v.sprite_url, v.team::jsonb, 'trainer', null, null, null, true
from (values
${trainers}
) v (id, area_id, name, sprite_url, team)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
on conflict (id) do nothing;`,
    '',
    `insert into area_trainer_pool (id, area_id, trainer_id, weight)
select v.id::uuid, v.area_id::uuid, v.trainer_id::uuid, v.weight
from (values
${pool}
) v (id, area_id, trainer_id, weight)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
  and exists (select 1 from trainers t where t.id = v.trainer_id::uuid)
on conflict (id) do nothing;`,
    '',
    `insert into game_config (key, value) values ('doubleBattles', ${q(JSON.stringify(DEFAULT_CONFIG.doubleBattles))}::jsonb) on conflict (key) do nothing;`,
    '',
    "insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);",
    'commit;',
    '',
  ].join('\n')
}

const DATA = path.join(ROOT, 'src', 'data')
// The bundle's own layout (seed-regions writes it so too), so a patch shows as the rows it adds and nothing else.
const writeJson = (file: string, data: unknown) => writeFile(file, JSON.stringify(data, null, 1) + '\n')

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--sql') {
    if (!args[1]) throw new Error('Usage: tsx scripts/patch-double-battles.ts --sql <out.sql>')
    await writeFile(path.resolve(args[1]), doubleBattlesSql())
    console.log(`✓ double battles SQL → ${args[1]}`)
    return
  }
  if (args[0] === '--data') {
    const read = async <T>(name: string) => JSON.parse(await readFile(path.join(DATA, name), 'utf8')) as T
    const out = withDuos({
      areas: await read<Area[]>('areas.json'),
      trainers: await read<Trainer[]>('trainers.json'),
    })
    await writeJson(path.join(DATA, 'areas.json'), out.areas)
    await writeJson(path.join(DATA, 'trainers.json'), out.trainers)
    console.log(`✓ src/data: ${out.trainers.filter((t) => t.duo).length} duo trainers`)
    return
  }
  const [input, output] = args
  if (!input || !output)
    throw new Error(
      'Usage: tsx scripts/patch-double-battles.ts <in-bundle.json> <out-bundle.json> | --data | --sql <out.sql>',
    )
  const b = JSON.parse(await readFile(path.resolve(input), 'utf8')) as BundleRaw
  await writeFile(path.resolve(output), JSON.stringify(patchDoubleBattles(b)))
  console.log(`✓ double battles: duos added → ${output}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
