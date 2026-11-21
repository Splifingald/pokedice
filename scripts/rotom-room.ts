/**
 * pnpm tsx scripts/rotom-room.ts — the Rotom Room (docs/73): Rotom's five appliance forms and Sinnoh's secret area
 * where they are caught, written into the bundle and safe to run again.
 *
 * - The forms as species rows of their own (PokeAPI's ids 10008–10012, `form.kind: 'appliance'`): Rotom's dice
 *   schedule on Electric and the appliance's type (its Ghost dice become that type), Rotom's HP, the form's own speed;
 *   their names in every language, their egg groups (Rotom's), their offline sprites from PokeAPI (96×96, uncut like
 *   every form's) and their metrics.
 * - The area: after Sinnoh's League, Lv.50–60, its pool Sinnoh's Electric Pokémon and those of the five appliance
 *   types (each week only the Electric ones and the week's type are met: engine/rotomRoom.ts), the five forms as its
 *   bosses (one a week, the player's own), the Galactic Warehouse's lab as its picture.
 * - supabase/migrations/0153_rotom_room.sql from the same rows, and 0154_rotom_room_switch.sql (the switch, the server's
 *   check), which seed.sql inlines.
 *
 * Then `pnpm showdown-sprites pokemon icons cries --only 10008,10009,10010,10011,10012` and `pnpm seed-sql`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import type { Area, PokeType, Species } from '../src/engine/types'
import { stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'src', 'data')
const SHEET = path.join(ROOT, 'src', 'i18n', 'strings.csv')
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '0153_rotom_room.sql')
/** The switch and its server function, apart from the content so seed.sql can inline it (its rows come with the bundle). */
const SWITCH = path.join(ROOT, 'supabase', 'migrations', '0154_rotom_room_switch.sql')
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const CACHE = path.join(ROOT, 'scripts', '.cache', 'pokeapi')
const ROTOM = 479
const SINNOH_LEAGUE = '5dc66787-c27b-5d67-8d66-4df0f1aa1041'

/** The five appliances: PokeAPI's ids, the type each takes, its speed (base 86, Rotom's 91) and its names. */
// prettier-ignore
export const ROTOM_FORM_ROWS: { id: number; key: string; type: PokeType; names: string[] }[] = [
  // en, fr, es, de, it, pt, pt-BR, ja, ko, zh-Hans
  { id: 10008, key: 'rotom-heat', type: 'fire', names: ['Heat Rotom', 'Motisma Chaleur', 'Rotom Calor', 'Hitze-Rotom', 'Rotom Calore', 'Rotom Calor', 'Rotom Calor', 'ヒートロトム', '히트로토무', '加热洛托姆'] },
  { id: 10009, key: 'rotom-wash', type: 'water', names: ['Wash Rotom', 'Motisma Lavage', 'Rotom Lavado', 'Wasch-Rotom', 'Rotom Lavaggio', 'Rotom Lavagem', 'Rotom Lavagem', 'ウォッシュロトム', '워시로토무', '清洗洛托姆'] },
  { id: 10010, key: 'rotom-frost', type: 'ice', names: ['Frost Rotom', 'Motisma Froid', 'Rotom Frío', 'Frost-Rotom', 'Rotom Gelo', 'Rotom Gelo', 'Rotom Gelo', 'フロストロトム', '프로스트로토무', '结冰洛托姆'] },
  { id: 10011, key: 'rotom-fan', type: 'flying', names: ['Fan Rotom', 'Motisma Hélice', 'Rotom Ventilador', 'Wirbel-Rotom', 'Rotom Vortice', 'Rotom Ventilador', 'Rotom Ventilador', 'スピンロトム', '스핀로토무', '旋转洛托姆'] },
  { id: 10012, key: 'rotom-mow', type: 'grass', names: ['Mow Rotom', 'Motisma Tonte', 'Rotom Corte', 'Schneid-Rotom', 'Rotom Taglio', 'Rotom Corte', 'Rotom Corte', 'カットロトム', '커트로토무', '切割洛托姆'] },
]
const FORM_SPEED = 86

// prettier-ignore
const AREA_NAMES = ['The Rotom Room', 'La Salle des Motisma', 'La Sala de Rotom', 'Der Rotom-Raum', 'La Stanza di Rotom', 'A Sala do Rotom', 'A Sala do Rotom', 'ロトムのへや', '로토무의 방', '洛托姆的房间']

export const ROTOM_ROOM_ID = stableUuid('area:rotom-room')
const LEVEL_MIN = 50
const LEVEL_MAX = 58
const BOSS_LEVEL = 60

/**
 * The pool, Sinnoh's own species only (the user's call, 2026-11-21: nothing new on Sinnoh's Pokédex). The Electric rows
 * are met every week; each other row only in the week of an appliance of one of its types.
 */
// prettier-ignore
const POOL: [dex: number, weight: number][] = [
  // Electric, every week
  [405, 10], [462, 8], [466, 8], [171, 6], [417, 6],
  // Fire: Heat Rotom's week
  [467, 8], [229, 8], [324, 6], [219, 6],
  // Water: Wash Rotom's week
  [419, 8], [423, 8], [457, 6], [55, 6], [130, 3],
  // Ice: Frost Rotom's week
  [461, 8], [478, 8], [362, 6], [473, 6],
  // Flying: Fan Rotom's week
  [398, 8], [430, 8], [426, 6], [472, 6], [469, 6],
  // Grass: Mow Rotom's week
  [407, 8], [465, 8], [455, 6], [421, 6], [460, 6], [357, 4],
]

async function fetchCached(url: string, file: string): Promise<Buffer> {
  if (existsSync(file)) return readFile(file)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, buf)
  return buf
}

/** [x0, y0, x1, y1] of the opaque pixels, both ends included (as scripts/pokemon-sprites.ts records them). */
function artBox(img: PNG): [number, number, number, number] {
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1]
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  return x1 < 0 ? [0, 0, img.width - 1, img.height - 1] : [x0, y0, x1, y1]
}

function bottomGap(img: PNG): number {
  for (let y = img.height - 1; y >= 0; y--)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3]! > 0) return img.height - 1 - y
  return 0
}

const VIEWS: [kind: string, dir: string][] = [
  ['front', ''],
  ['back', 'back/'],
  ['front_shiny', 'shiny/'],
  ['back_shiny', 'back/shiny/'],
]

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
const sql = (v: unknown): string =>
  v == null
    ? 'null'
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : typeof v === 'string'
        ? `'${v.replace(/'/g, "''")}'`
        : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`

/** A row of the sheet, replaced where it is, else inserted before `before` (or at the end). */
function putRow(lines: string[], key: string, cells: string[], before: (l: string) => boolean): string[] {
  const row = [key, ...cells.map(csvCell)].join(',')
  const at = lines.findIndex((l) => l.startsWith(`${key},`))
  if (at >= 0) return lines.map((l, i) => (i === at ? row : l))
  const b = lines.findIndex(before)
  const out = [...lines]
  out.splice(b < 0 ? out.length : b, 0, row)
  return out
}

async function main() {
  // ---- the species rows, in their place among the forms (by id)
  const pokemon = JSON.parse(await readFile(path.join(DATA, 'pokemon.json'), 'utf8')) as Species[]
  const base = pokemon.find((p) => p.dex === ROTOM)!
  const rows = pokemon.filter((p) => !ROTOM_FORM_ROWS.some((f) => f.id === p.dex))
  const formRows: Species[] = ROTOM_FORM_ROWS.map((f) => ({
    dex: f.id,
    name: f.names[0]!,
    type1: 'electric',
    type2: f.type,
    baseHp: base.baseHp,
    maxHp: base.maxHp,
    speed: FORM_SPEED,
    spriteUrl: `/pokemon/${f.id}_front.png`,
    // Rotom's own schedule (the admin's tuning), its Ghost dice now the appliance's type.
    dice: base.dice.map((d) => ({ ...d, type: d.type === 'ghost' ? f.type : d.type })),
    rerolls: base.rerolls,
    catchValue: base.catchValue,
    evolutions: [],
    milestones: base.milestones.map((m) =>
      'dieType' in m && m.dieType === 'ghost' ? { ...m, dieType: f.type } : m,
    ),
    notes: `${f.key} · BST 520 · caught in the Rotom Room (docs/73)`,
    form: { of: ROTOM, kind: 'appliance' },
  }))
  for (const row of formRows) {
    const at = rows.findIndex((p) => p.dex > row.dex)
    rows.splice(at < 0 ? rows.length : at, 0, row)
  }
  await writeFile(path.join(DATA, 'pokemon.json'), JSON.stringify(rows, null, 1) + '\n')

  // ---- egg groups: Rotom's (an Egg of a form hatches as Rotom, as the Day Care does for every form)
  const eggs = JSON.parse(await readFile(path.join(DATA, 'egg-groups.json'), 'utf8')) as Record<
    string,
    unknown
  >
  for (const f of ROTOM_FORM_ROWS) eggs[f.id] = eggs[ROTOM]
  const sorted = Object.entries(eggs).sort(([a], [b]) => Number(a) - Number(b))
  await writeFile(
    path.join(DATA, 'egg-groups.json'),
    `{\n${sorted.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`,
  )

  // ---- names: each form's own, and the area's
  let lines = (await readFile(SHEET, 'utf8')).split('\n')
  for (const f of ROTOM_FORM_ROWS)
    lines = putRow(
      lines,
      `pokemon.${f.id}`,
      f.names,
      (l) => /^pokemon\.(\d+),/.test(l) && Number(l.match(/^pokemon\.(\d+),/)![1]) > f.id,
    )
  lines = putRow(lines, 'area.the-rotom-room', AREA_NAMES, (l) => l.startsWith('area.the-old-chateau,'))
  await writeFile(SHEET, lines.join('\n'))

  // ---- offline sprites and their metrics
  const metricsFile = path.join(DATA, 'sprite-metrics.json')
  const metrics = JSON.parse(await readFile(metricsFile, 'utf8')) as Record<string, Record<string, unknown>>
  for (const f of ROTOM_FORM_ROWS) {
    const m: Record<string, unknown> = { front: 0, back: 0 }
    for (const [kind, dir] of VIEWS) {
      const buf = await fetchCached(`${SPRITES}/${dir}${f.id}.png`, path.join(CACHE, `${kind}_${f.id}.png`))
      const img = PNG.sync.read(buf)
      if (kind === 'front' || kind === 'back') {
        m[kind] = bottomGap(img)
        m.size = img.width
        m[`${kind}Box`] = artBox(img)
      }
      await writeFile(path.join(ROOT, 'public', 'pokemon', `${f.id}_${kind}.png`), PNG.sync.write(img))
    }
    metrics[f.id] = { front: m.front, back: m.back, size: m.size, frontBox: m.frontBox, backBox: m.backBox }
  }
  const ordered = Object.fromEntries(Object.entries(metrics).sort(([a], [b]) => Number(a) - Number(b)))
  await writeFile(metricsFile, JSON.stringify(ordered) + '\n')

  // ---- the area
  const areas = JSON.parse(await readFile(path.join(DATA, 'areas.json'), 'utf8')) as Area[]
  const template = areas.find((a) => a.name === 'Fullmoon Island' && a.regionId === 'sinnoh')!
  const area: Area = {
    id: ROTOM_ROOM_ID,
    orderIndex: 959,
    regionId: 'sinnoh',
    name: AREA_NAMES[0]!,
    bannerUrl: '/banners/factory.png',
    roundsToClear: 2,
    minLevel: LEVEL_MIN,
    maxLevel: BOSS_LEVEL,
    encounterWeights: { item: 1, wild: 6, casino: 0, center: 1, trainer: 0 },
    backtrackMultiplier: 0.5,
    legendaryBoss: ROTOM_FORM_ROWS.map((f) => ({ dex: f.id, level: BOSS_LEVEL })),
    scalesToTeam: false,
    easyMode: false,
    enemyUpgradeLevel: 8,
    battleBackground: 'default',
    hidden: true,
    unlockConditions: [{ kind: 'cleared', areaId: SINNOH_LEAGUE }],
    gyms: [],
    wildPool: POOL.map(([dex, weight]) => ({
      id: stableUuid(`rotom-room-wild:${dex}`),
      dex,
      weight,
      minLevel: LEVEL_MIN,
      maxLevel: LEVEL_MAX,
    })),
    trainerPool: [],
    lootPool: template.lootPool.map((l) => ({ ...l, id: stableUuid(`rotom-room-loot:${l.itemKey}`) })),
  } as Area
  const at = areas.findIndex((x) => x.id === ROTOM_ROOM_ID)
  if (at >= 0) areas[at] = area
  else areas.push(area)
  await writeFile(path.join(DATA, 'areas.json'), JSON.stringify(areas, null, 1) + '\n')

  // ---- the migration, from the same rows
  const species = formRows
    .map(
      (s) =>
        `  (${[
          s.dex,
          s.name,
          s.type1,
          s.type2,
          s.baseHp,
          s.maxHp,
          s.speed,
          s.spriteUrl,
          s.dice,
          s.rerolls,
          s.catchValue,
          s.evolutions,
          s.milestones,
          s.notes,
          s.form,
        ]
          .map(sql)
          .join(', ')})`,
    )
    .join(',\n')
  const wild = area.wildPool
    .map((w) => `  (${[w.id, area.id, w.dex, w.weight, w.minLevel, w.maxLevel].map(sql).join(', ')})`)
    .join(',\n')
  const loot = area.lootPool
    .map(
      (l) => `  (${[l.id, area.id, l.itemKey, l.weight, l.unique, l.minQty, l.maxQty].map(sql).join(', ')})`,
    )
    .join(',\n')
  const a = area
  await writeFile(
    MIGRATION,
    `-- The Rotom Room (docs/73): Rotom's five appliance forms and the Sinnoh secret area where they are caught, one a week.
-- Written by scripts/rotom-room.ts from the bundle's rows. Safe to run again: every row is left alone when there (the
-- admin's edits kept). Its switch is 0154 (run both); supabase/seed.sql carries these rows with the bundle's.
-- 1. The five forms (10008–10012): Heat, Wash, Frost, Fan and Mow Rotom, Electric and the appliance's type.
-- 2. The area, The Rotom Room (after Sinnoh's League, Lv.50–60), its wild pool (each week the Electric rows and the
--    week's type), its loot, the five forms as its bosses (one a week, the player's own: engine/rotomRoom.ts).
-- 3. configVersion + 1, so players fetch the new content.
begin;

-- 1.
insert into pokemon (dex, name, type1, type2, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones, notes, form) values
${species}
on conflict (dex) do nothing;

-- 2.
insert into areas (id, order_index, region_id, name, banner_url, rounds_to_clear, min_level, max_level, encounter_weights, backtrack_multiplier, legendary_boss, scales_to_team, easy_mode, enemy_upgrade_level, battle_background, hidden, unlock_conditions, gyms) values
  (${[a.id, a.orderIndex, a.regionId, a.name, a.bannerUrl, a.roundsToClear, a.minLevel, a.maxLevel, a.encounterWeights, a.backtrackMultiplier, a.legendaryBoss, a.scalesToTeam, a.easyMode, a.enemyUpgradeLevel, a.battleBackground, a.hidden, a.unlockConditions, a.gyms].map(sql).join(', ')})
on conflict (id) do nothing;

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level) values
${wild}
on conflict (id) do nothing;

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty) values
${loot}
on conflict (id) do nothing;

-- 3.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
`,
  )
  await writeFile(
    SWITCH,
    `-- The Rotom Room's switch (docs/73), after 0153 (its content). Safe to run again: the admin's switch is kept, the
-- function replaced. supabase/seed.sql inlines it.
-- 1. game_config \`rotomRoom\`: the switch, Off, and the prize's level (the shiny Rotom for the complete Rotom Pokédex).
-- 2. rotom_room_open(): the switch as the server reads it for the caller, as tracks_open() (0124): on for everyone, or
--    for the admin only. The game asks it before a signed-in player enters the room, so an old build or a hand-made
--    save can't play it while it's off.
-- 3. configVersion + 1, so players fetch the new switch.
begin;

-- 1.
insert into game_config (key, value) values ('rotomRoom', '{"access": "off", "prizeLevel": 60}'::jsonb) on conflict (key) do nothing;

-- 2. An odd value is off; never null.
create or replace function rotom_room_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'rotomRoom' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function rotom_room_open() from public;
grant execute on function rotom_room_open() to anon, authenticated;

-- 3.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
`,
  )
  console.log(
    '✓ The Rotom Room and the five appliance forms are in the bundle; migrations 0153 and 0154 written',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
