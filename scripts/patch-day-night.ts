/**
 * Day and night in Johto (docs/31, the user's ask of 2026-10-17): which of Johto's wild Pokémon are met only by day or
 * only by night, from the real games. Every species stays in its area; only its row's `time` is set.
 *
 * The table below was derived from PokeAPI's encounter data (github.com/PokeAPI/pokeapi, data/v2/csv) by `--derive`:
 * for each species of an area's pool, its encounters in the real places the area stands for (`REAL_PLACES`), walking,
 * surfing and fishing (headbutt trees and rocks keep no time), swarms and the radio's music left out; HeartGold and
 * SoulSilver first, else Crystal, else Gold and Silver. A species never met in those places takes its times across the
 * whole of the real game. Morning and day are this game's day (6:00–17:59), night its night (18:00–5:59). A species met
 * in both halves (or never met in the wild, like the starters) is untagged: met at any hour.
 *
 * `tsx scripts/patch-day-night.ts <in-bundle.json> <out-bundle.json>` patches an admin export for `pnpm import-bundle`;
 * `tsx scripts/patch-day-night.ts --sql <out.sql>` writes the same as a migration (0061_day_night.sql);
 * `tsx scripts/patch-day-night.ts --data` writes it into src/data/areas.json (`pnpm seed-regions` applies it too);
 * `tsx scripts/patch-day-night.ts --derive <pokeapi-csv-dir>` prints the table again from PokeAPI's CSVs.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Area, BundleRaw, DayTime } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Each Johto area's species met only by day or only by night, by Pokédex number. Areas left out have none. */
export const DAY_NIGHT_TAGS: Readonly<Record<string, Readonly<Record<number, DayTime>>>> = {
  // Route 29: Pidgey, Sentret by day; Hoothoot by night.
  '522e114b-852b-543a-8d79-8cc34d598b13': { 16: 'day', 161: 'day', 163: 'night' },
  // Routes 30 & 31: Caterpie, Weedle, Ledyba by day; Zubat, Hoothoot, Spinarak by night.
  'a0e6d0b2-4cfe-5607-9ed0-2b716d31b88c': {
    10: 'day',
    13: 'day',
    41: 'night',
    163: 'night',
    165: 'day',
    167: 'night',
  },
  // Violet City & Sprout Tower: Pidgey by day; Gastly, Hoothoot by night.
  '557feec9-d7ee-5e34-91fd-8eaa4e805e85': { 16: 'day', 92: 'night', 163: 'night' },
  // Route 32: Hoppip by day; Wooper by night.
  '1a6ff054-0850-54a9-8471-e828a46154b4': { 187: 'day', 194: 'night' },
  // Route 33 & Slowpoke Well: Spearow, Hoppip by day.
  '6f00f916-60e4-5daa-9906-c2204de369a1': { 21: 'day', 187: 'day' },
  // Azalea Town: Ledyba by day.
  'a42af576-01f0-52af-affe-cddce559f5a2': { 165: 'day' },
  // Ilex Forest: Caterpie, Metapod by day; Oddish by night.
  '5fba87f3-6e88-5d47-8f6c-549021a0c04e': { 10: 'day', 11: 'day', 43: 'night' },
  // Route 34 & the Day Care: Pidgey, Snubbull by day.
  '30af3925-076e-5c88-a6c7-fba28a4ed035': { 16: 'day', 209: 'day' },
  // Goldenrod City: Pidgey by day.
  '058038e0-b19e-5156-9e27-c57aa3b653fc': { 16: 'day' },
  // Routes 35–37: Pidgey, Ledyba, Sunkern by day; Spinarak by night.
  '61bfb445-9bdc-5e47-9c3a-f379bd33a06b': { 16: 'day', 165: 'day', 167: 'night', 191: 'day' },
  // National Park: Sunkern by day.
  '3aa36df1-1d3e-533b-8f85-32ca0b970b16': { 191: 'day' },
  // Ecruteak City & the Burned Tower: Gastly, Haunter by night.
  '2d2bfbee-476c-56e7-b814-4d73b9c1425c': { 92: 'night', 93: 'night' },
  // Routes 38 & 39: Pidgey, Farfetch'd by day.
  '464335aa-aa23-5f1b-907f-62440757a77b': { 16: 'day', 83: 'day' },
  // Olivine City & the Lighthouse: Staryu by night.
  '60d0afeb-b310-5dda-bf4e-91025ae51ad6': { 120: 'night' },
  // Cianwood City: Corsola by day; Staryu by night.
  '28f66e14-e4f6-59ca-96fe-c196fc53fe9e': { 120: 'night', 222: 'day' },
  // Routes 42 & 43 and the Lake of Rage: Hoothoot, Marill by night.
  'bcb0a995-0b15-59b4-baad-07e16f5d19b6': { 163: 'night', 183: 'night' },
  // Route 44 & the Ice Path: Sneasel by night.
  'ca2e6708-ff90-579a-b978-f769f97c6dff': { 215: 'night' },
  // Victory Road: Sandslash by day.
  '28453b26-704e-599c-b5ab-7763047b0cf7': { 28: 'day' },
  // Mt. Silver: Pidgey, Ledyba, Ledian, Sunkern, Granbull, Corsola by day; Oddish, Gastly, Haunter, Hoothoot, Noctowl,
  // Ariados, Misdreavus by night.
  '9f511e0a-42ac-51b1-90ca-8c1458531603': {
    16: 'day',
    43: 'night',
    92: 'night',
    93: 'night',
    163: 'night',
    164: 'night',
    165: 'day',
    166: 'day',
    168: 'night',
    191: 'day',
    200: 'night',
    210: 'day',
    222: 'day',
  },
  // Bell Tower: Pidgey by day; Gastly, Haunter, Hoothoot, Noctowl by night.
  '35e0b2d1-6c24-53e4-85b2-31b5fb0c31c3': { 16: 'day', 92: 'night', 93: 'night', 163: 'night', 164: 'night' },
}

/** The real places (PokeAPI location identifiers) each Johto area stands for, by its name. */
export const REAL_PLACES: Readonly<Record<string, readonly string[]>> = {
  'Route 29': ['johto-route-29'],
  'Routes 30 & 31': ['johto-route-30', 'johto-route-31'],
  'Violet City & Sprout Tower': ['violet-city', 'sprout-tower'],
  'Route 32': ['johto-route-32'],
  'Union Cave': ['union-cave'],
  'Route 33 & Slowpoke Well': ['johto-route-33', 'slowpoke-well'],
  'Azalea Town': ['azalea-town'],
  'Ilex Forest': ['ilex-forest'],
  'Route 34 & the Day Care': ['johto-route-34'],
  'Goldenrod City': ['goldenrod-city', 'goldenrod-tunnel'],
  'Routes 35–37': ['johto-route-35', 'johto-route-36', 'johto-route-37'],
  'National Park': ['national-park'],
  'Ecruteak City & the Burned Tower': ['ecruteak-city', 'burned-tower'],
  'Routes 38 & 39': ['johto-route-38', 'johto-route-39'],
  'Olivine City & the Lighthouse': ['olivine-city', 'johto-lighthouse'],
  'Routes 40 & 41': ['johto-sea-route-40', 'johto-sea-route-41'],
  'Cianwood City': ['cianwood-city'],
  'Routes 42 & 43 and the Lake of Rage': ['johto-route-42', 'johto-route-43', 'lake-of-rage'],
  'Mahogany Town & the Team Rocket HQ': ['mahogany-town', 'team-rocket-hq'],
  'Route 44 & the Ice Path': ['johto-route-44', 'ice-path'],
  "Blackthorn City & the Dragon's Den": ['blackthorn-city', 'dragons-den'],
  'Victory Road': ['kanto-victory-road-1', 'kanto-victory-road-2'],
  'Mt. Silver': ['mt-silver', 'mt-silver-cave'],
  'Ruins of Alph': ['ruins-of-alph'],
  'Whirl Islands': ['whirl-islands'],
  'Bell Tower': ['bell-tower'],
}

/** Each area's pool with the table's times on its rows; a row that has a time already (the admin's) keeps it. */
export function withDayNight(areas: Area[]): Area[] {
  return areas.map((a) => {
    const tags = DAY_NIGHT_TAGS[a.id]
    if (!tags || !a.wildPool.some((w) => tags[w.dex] && !w.time)) return a
    return {
      ...a,
      wildPool: a.wildPool.map((w) => (tags[w.dex] && !w.time ? { ...w, time: tags[w.dex] } : w)),
    }
  })
}

/** The export with the times in it, and `configVersion` + 1 so players fetch them. */
export function patchDayNight(b: BundleRaw): BundleRaw {
  const config = b.config as Record<string, unknown>
  return {
    ...b,
    areas: withDayNight(b.areas),
    config: {
      ...config,
      dayNight: config.dayNight ?? { access: 'off' },
      configVersion: Number(config.configVersion ?? 0) + 1,
    },
  }
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`

/**
 * The same as SQL for a live database: the column, the switch (Off, left alone when there), each tagged species' rows
 * in its area given their time where they have none, `configVersion` + 1. Safe to run again.
 */
export function dayNightSql(): string {
  const values = Object.entries(DAY_NIGHT_TAGS)
    .flatMap(([areaId, tags]) =>
      Object.entries(tags).map(([dex, time]) => `  (${q(areaId)}, ${dex}, ${q(time)})`),
    )
    .join(',\n')
  return [
    '-- Day and night in Johto (docs/31). Generated by `tsx scripts/patch-day-night.ts --sql`: do not edit by hand.',
    '-- 1. `area_wild_pool.time_of_day`: a wild Pokémon met only by day (6:00–17:59) or only by night (18:00–5:59), on',
    "--    the player's clock; null = any time.",
    "-- 2. game_config `dayNight`: the switch, Off (left alone when there). Wild Pokémon are dealt on the player's device,",
    '--    so no server function reads it.',
    "-- 3. Johto's species met only by day or only by night in the real games (scripts/patch-day-night.ts), in the areas",
    '--    they are already in; a row the admin has given a time keeps it.',
    '-- 4. configVersion + 1, so players fetch the new content. Safe to run again.',
    'begin;',
    'alter table area_wild_pool add column if not exists time_of_day text;',
    'insert into game_config (key, value) values (\'dayNight\', \'{"access": "off"}\'::jsonb) on conflict (key) do nothing;',
    `update area_wild_pool p set time_of_day = v.time_of_day
from (values
${values}
) v (area_id, dex, time_of_day)
where p.area_id = v.area_id::uuid and p.dex = v.dex and p.time_of_day is null;`,
    "insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);",
    'commit;',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------- the table, again from PokeAPI's CSVs

/** A tiny CSV reader: PokeAPI's encounter files have no quoted commas. */
async function csv(dir: string, name: string): Promise<Record<string, string>[]> {
  const [head, ...lines] = (await readFile(path.join(dir, `${name}.csv`), 'utf8')).trim().split('\n')
  const keys = head!.split(',').map((k) => k.trim())
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v.trim()])))
}

type Half = 'morning' | 'day' | 'night'
const FAMILIES: Record<string, string> = { '15': 'hgss', '16': 'hgss', '6': 'c', '4': 'gs', '5': 'gs' }
const METHODS = new Set(['walk', 'surf', 'old-rod', 'good-rod', 'super-rod'])
const SPECIAL = new Set(['swarm-yes', 'radio-hoenn', 'radio-sinnoh'])

/** The table, worked out again from PokeAPI's CSVs (encounters, slots, methods, conditions, locations). */
export async function deriveDayNight(
  dir: string,
  areas: Area[],
): Promise<Record<string, Record<number, DayTime>>> {
  const locations = new Map((await csv(dir, 'locations')).map((r) => [r.id, r.identifier!]))
  const places = new Map(
    (await csv(dir, 'location_areas')).map((r) => [r.id, locations.get(r.location_id!)!]),
  )
  const methods = new Map((await csv(dir, 'encounter_methods')).map((r) => [r.id, r.identifier!]))
  const slots = new Map(
    (await csv(dir, 'encounter_slots')).map((r) => [r.id, methods.get(r.encounter_method_id!)!]),
  )
  const values = new Map((await csv(dir, 'encounter_condition_values')).map((r) => [r.id, r.identifier!]))
  const conds = new Map<string, Set<string>>()
  for (const r of await csv(dir, 'encounter_condition_value_map')) {
    const set = conds.get(r.encounter_id!) ?? new Set<string>()
    set.add(values.get(r.encounter_condition_value_id!)!)
    conds.set(r.encounter_id!, set)
  }
  // place → dex → family → the halves it's met in; and the same over every place.
  const here = new Map<string, Map<number, Map<string, Set<Half>>>>()
  const anywhere = new Map<number, Map<string, Set<Half>>>()
  const add = (m: Map<number, Map<string, Set<Half>>>, dex: number, fam: string, halves: Half[]) => {
    const byFam = m.get(dex) ?? new Map<string, Set<Half>>()
    const set = byFam.get(fam) ?? new Set<Half>()
    for (const h of halves) set.add(h)
    byFam.set(fam, set)
    m.set(dex, byFam)
  }
  for (const e of await csv(dir, 'encounters')) {
    const fam = FAMILIES[e.version_id!]
    if (!fam || !METHODS.has(slots.get(e.encounter_slot_id!) ?? '')) continue
    const c = conds.get(e.id!) ?? new Set<string>()
    if ([...c].some((x) => SPECIAL.has(x))) continue
    const timed = [...c].filter(
      (x) => x.startsWith('time-') && ['morning', 'day', 'night'].includes(x.slice(5)),
    )
    const halves = (timed.length ? timed.map((x) => x.slice(5)) : ['morning', 'day', 'night']) as Half[]
    const place = places.get(e.location_area_id!)!
    const dex = Number(e.pokemon_id)
    if (!here.has(place)) here.set(place, new Map())
    add(here.get(place)!, dex, fam, halves)
    add(anywhere, dex, fam, halves)
  }
  const first = (byFam: Map<string, Set<Half>> | undefined) =>
    byFam && (byFam.get('hgss') ?? byFam.get('c') ?? byFam.get('gs'))
  const out: Record<string, Record<number, DayTime>> = {}
  for (const a of areas.filter((x) => x.regionId === 'johto')) {
    const tags: Record<number, DayTime> = {}
    for (const w of a.wildPool) {
      const merged = new Map<string, Set<Half>>()
      for (const p of REAL_PLACES[a.name] ?? [])
        for (const [fam, set] of here.get(p)?.get(w.dex) ?? [])
          merged.set(fam, new Set([...(merged.get(fam) ?? []), ...set]))
      const halves = first(merged) ?? first(anywhere.get(w.dex))
      if (!halves) continue
      if (!halves.has('night')) tags[w.dex] = 'day'
      else if (!halves.has('morning') && !halves.has('day')) tags[w.dex] = 'night'
    }
    if (Object.keys(tags).length) out[a.id] = tags
  }
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const areasFile = path.join(ROOT, 'src', 'data', 'areas.json')
  if (args[0] === '--sql') {
    if (!args[1]) throw new Error('Usage: tsx scripts/patch-day-night.ts --sql <out.sql>')
    await writeFile(path.resolve(args[1]), dayNightSql())
    console.log(`✓ Day and night SQL → ${args[1]}`)
    return
  }
  if (args[0] === '--data') {
    const areas = JSON.parse(await readFile(areasFile, 'utf8')) as Area[]
    await writeFile(areasFile, `${JSON.stringify(withDayNight(areas), null, 1)}\n`)
    console.log('✓ Day and night → src/data/areas.json')
    return
  }
  if (args[0] === '--derive') {
    if (!args[1]) throw new Error('Usage: tsx scripts/patch-day-night.ts --derive <pokeapi-csv-dir>')
    const areas = JSON.parse(await readFile(areasFile, 'utf8')) as Area[]
    console.log(JSON.stringify(await deriveDayNight(path.resolve(args[1]), areas), null, 1))
    return
  }
  const [input, output] = args
  if (!input || !output)
    throw new Error(
      'Usage: tsx scripts/patch-day-night.ts <in-bundle.json> <out-bundle.json> | --sql <out.sql> | --data | --derive <dir>',
    )
  const b = JSON.parse(await readFile(path.resolve(input), 'utf8')) as BundleRaw
  await writeFile(path.resolve(output), JSON.stringify(patchDayNight(b)))
  console.log(`✓ Day and night: ${Object.keys(DAY_NIGHT_TAGS).length} Johto areas' times → ${output}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
