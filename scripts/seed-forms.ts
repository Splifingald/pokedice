/**
 * pnpm seed-forms
 *
 * Writes Pokémon forms into the committed bundle (content: scripts/content-forms.ts):
 * - every regional form as a species row of its own (Alolan, Galarian, Hisuian, Paldean), its evolutions, and the
 *   wild pools, trainers and finds that make each line catchable in its region;
 * - every Mega Evolution as a battle-only species row (the battle adds the die, see engine/forms.ts);
 * - Giratina's Origin Forme and Arceus's seventeen types as battle forms;
 * - the names of all of them in src/i18n/strings.csv, from PokeAPI's form names.
 *
 * Idempotent: it rebuilds every form row from scratch and only touches the area, trainer and item rows it names, so
 * running it twice is the same as once. Run it after `pnpm seed-regions` (which never removes a row). PokeAPI's CSVs
 * are cached under scripts/.cache/pokeapi. Then `pnpm pokemon-sprites --fetch-forms` and `pnpm seed-sql`.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../src/i18n/csv'
import { LANGS, type Lang } from '../src/i18n/langs'
import { areaKey, itemDescKey, itemKey, pokemonKey } from '../src/i18n/names'
import type { Area, DiceEntry, DieType, Evolution, ItemDef, Milestone, PokeType, Species, Trainer } from '../src/engine/types'
import {
  ARCEUS,
  ARCEUS_TYPES,
  arceusFormId,
  BASE_EVOLUTIONS,
  BIRDS_AREA,
  GMAX_SKIPPED,
  HP_FORMS,
  MEGA_LIKE,
  OGERPON,
  OGERPON_MASKS,
  SILVALLY,
  silvallyFormId,
  LOOT_ADD,
  MEGA_SKIPPED,
  NAME_FIXES,
  REGIONAL_FORMS,
  TRAINER_REPLACE,
  WILD_ADD,
  WILD_OFF,
  WILD_REPLACE,
} from './content-forms'
import { hpAtLevel, stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'src', 'data')
const SHEET = path.join(ROOT, 'src', 'i18n', 'strings.csv')
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'
const CACHE = path.join(ROOT, 'scripts', '.cache', 'pokeapi')
const POKESPRITE = (p: string) => `https://raw.githubusercontent.com/msikma/pokesprite/master/items/${p}.png`

/** The first row past the National Dex: everything from here on is a form. */
const FIRST_FORM = 1026

const TYPE_IDS: Record<number, PokeType> = {
  1: 'normal', 2: 'fighting', 3: 'flying', 4: 'poison', 5: 'ground', 6: 'rock', 7: 'bug', 8: 'ghost', 9: 'steel',
  10: 'fire', 11: 'water', 12: 'grass', 13: 'electric', 14: 'psychic', 15: 'ice', 16: 'dragon', 17: 'dark', 18: 'fairy',
}
/** PokeAPI's language ids for the sheet's columns (Italian and Portuguese use the English Pokémon names). */
const LANG_IDS: Partial<Record<Lang, number[]>> = { en: [9], fr: [5], es: [7], de: [6], ja: [11, 1], ko: [3], 'zh-Hans': [12] }

async function csv(name: string): Promise<Record<string, string>[]> {
  const file = path.join(CACHE, name)
  let text: string
  if (existsSync(file)) text = await readFile(file, 'utf8')
  else {
    const res = await fetch(`${CSV}/${name}`)
    if (!res.ok) throw new Error(`${name} → ${res.status}`)
    text = await res.text()
    await mkdir(CACHE, { recursive: true })
    await writeFile(file, text)
  }
  const [head, ...rows] = parseCsv(text)
  return rows.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ''])))
}

const readJson = async <T>(name: string) => JSON.parse(await readFile(path.join(DATA, name), 'utf8')) as T
const writeJson = (name: string, data: unknown) => writeFile(path.join(DATA, name), JSON.stringify(data, null, 1) + '\n')
const normName = (s: string) => s.replace(/[’']/g, "'")

interface ApiMon {
  id: number
  identifier: string
  types: PokeType[]
  stats: Record<string, number>
  /** Language id → [form name, full Pokémon name]. */
  names: Map<number, [string, string]>
}

async function loadApi(): Promise<Map<number, ApiMon>> {
  const out = new Map<number, ApiMon>()
  for (const r of await csv('pokemon.csv'))
    out.set(Number(r.id), { id: Number(r.id), identifier: r.identifier!, types: [], stats: {}, names: new Map() })
  for (const r of await csv('pokemon_types.csv')) {
    const m = out.get(Number(r.pokemon_id))
    if (m) m.types[Number(r.slot) - 1] = TYPE_IDS[Number(r.type_id)]!
  }
  const STAT = { 1: 'hp', 6: 'speed' } as Record<number, string>
  for (const r of await csv('pokemon_stats.csv')) {
    const m = out.get(Number(r.pokemon_id))
    if (m) m.stats[STAT[Number(r.stat_id)] ?? `s${r.stat_id}`] = Number(r.base_stat)
  }
  const formToMon = new Map<string, number>()
  for (const r of await csv('pokemon_forms.csv')) if (r.is_default === '1') formToMon.set(r.id!, Number(r.pokemon_id))
  for (const r of await csv('pokemon_form_names.csv')) {
    const m = out.get(formToMon.get(r.pokemon_form_id!) ?? -1)
    if (m) m.names.set(Number(r.local_language_id), [r.form_name ?? '', r.pokemon_name ?? ''])
  }
  return out
}

const bst = (m: ApiMon) => Object.values(m.stats).reduce((s, v) => s + v, 0)
const expand = (d: DiceEntry[]) => d.flatMap((e) => Array.from({ length: e.count }, () => e.type))
function group(dice: DieType[]): DiceEntry[] {
  const out: DiceEntry[] = []
  for (const t of dice) {
    const e = out.find((x) => x.type === t)
    if (e) e.count++
    else out.push({ type: t, count: 1 })
  }
  return out.sort((a, b) => (a.type === 'base' ? 1 : 0) - (b.type === 'base' ? 1 : 0))
}

/**
 * A regional form keeps its species' dice schedule — the same number of dice at the same levels, tuned by hand in the
 * admin — on its own types: the first type's dice take the form's first type, the second's its second. A dual-typed
 * form of a single-typed species (Alolan Raichu, Galarian Weezing) gets its second type on the second typed die it has.
 */
function retypeSchedule(base: Species, t1: PokeType, t2: PokeType | null): { dice: DiceEntry[]; milestones: Milestone[] } {
  const map = (d: DieType): DieType => (d === 'base' ? d : d === base.type1 ? t1 : d === base.type2 ? (t2 ?? t1) : d)
  const splitSecond = !base.type2 && !!t2
  let typed = 0
  const next = (d: DieType): DieType => {
    if (d === 'base') return d
    const out = splitSecond && typed === 1 ? t2! : map(d)
    typed++
    return out
  }
  const dice = expand(base.dice).map(next)
  const milestones = [...base.milestones]
    .filter((m) => m.effect !== 'EVOLVE')
    .sort((a, b) => a.level - b.level)
    .map((m): Milestone => {
      if (m.effect === 'ADD_DIE' || m.effect === 'REPLACE_DIE' || m.effect === 'UPGRADE_DIE')
        return { ...m, dieType: next(m.dieType ?? base.type1), ...(m.fromDieType && { fromDieType: map(m.fromDieType) }) }
      return { ...m }
    })
  return { dice: group(dice), milestones }
}

const evolveMilestones = (evos: Evolution[]): Milestone[] =>
  [...new Set(evos.filter((e) => e.level != null).map((e) => e.level!))].map((level) => ({ level, effect: 'EVOLVE' as const }))

const sprite = (id: number) => `/pokemon/${String(id).padStart(3, '0')}_front.png`

function hpOf(base: Species, baseApi: ApiMon | undefined, api: ApiMon) {
  if (!baseApi || baseApi.stats.hp === api.stats.hp) return { baseHp: base.baseHp, maxHp: base.maxHp }
  return { baseHp: hpAtLevel(api.stats.hp!, 1), maxHp: hpAtLevel(api.stats.hp!, 100) }
}
function speedOf(base: Species, baseApi: ApiMon | undefined, api: ApiMon) {
  if (!baseApi || baseApi.stats.speed === api.stats.speed) return base.speed
  return Math.floor(api.stats.speed! / 10)
}

async function main() {
  const api = await loadApi()
  const pokemon = (await readJson<Species[]>('pokemon.json')).filter((p) => p.dex < FIRST_FORM)
  const byDex = new Map(pokemon.map((p) => [p.dex, p]))
  const forms: Species[] = []
  for (const [id, lang, name] of NAME_FIXES) {
    const names = api.get(id)?.names
    const langId = LANG_IDS[lang as Lang]?.[0]
    if (names && langId) names.set(langId, [names.get(langId)?.[0] ?? '', name])
  }
  const enName = (id: number) => api.get(id)?.names.get(9)?.[1] || ''

  // ---- regional forms
  for (const plan of REGIONAL_FORMS) {
    const base = byDex.get(plan.of)!
    const a = api.get(plan.id)
    if (!base || !a) throw new Error(`form ${plan.id} of #${plan.of}: missing from the bundle or PokeAPI`)
    const [t1, t2 = null] = a.types
    const { dice, milestones } = retypeSchedule(base, t1!, t2)
    forms.push({
      dex: plan.id,
      name: enName(plan.id) || `${base.name} (${plan.region})`,
      type1: t1!,
      type2: t2,
      ...hpOf(base, api.get(plan.of), a),
      speed: speedOf(base, api.get(plan.of), a),
      spriteUrl: sprite(plan.id),
      dice,
      rerolls: base.rerolls,
      catchValue: base.catchValue,
      evolutions: plan.evolutions,
      milestones: [...milestones, ...evolveMilestones(plan.evolutions)].sort((x, y) => x.level - y.level),
      notes: `${a.identifier} · BST ${bst(a)}`,
      form: { of: plan.of, kind: 'regional', region: plan.region },
    })
  }

  // ---- Mega Evolutions
  const megas = [...api.values()].filter((m) => m.id > 10000 && /-mega(-[xyz])?$/.test(m.identifier) && !MEGA_SKIPPED.has(m.identifier))
  const speciesOf = new Map((await csv('pokemon.csv')).map((r) => [Number(r.id), Number(r.species_id)]))
  for (const m of megas) {
    const of = speciesOf.get(m.id)!
    const base = byDex.get(of)
    if (!base) continue
    const [t1, t2 = null] = m.types
    forms.push({
      dex: m.id,
      name: enName(m.id) || `Mega ${base.name}`,
      type1: t1!,
      type2: t2,
      baseHp: base.baseHp,
      maxHp: base.maxHp,
      speed: speedOf(base, api.get(of), m),
      spriteUrl: sprite(m.id),
      dice: base.dice,
      rerolls: base.rerolls,
      catchValue: base.catchValue,
      evolutions: [],
      milestones: [],
      notes: `${m.identifier} · BST ${bst(m)}`,
      form: { of, kind: 'mega' },
    })
  }

  // ---- Primal Reversion and Ultra Burst: Mega rows with their own name for the mechanic
  for (const { id, mechanic } of MEGA_LIKE) {
    const m = api.get(id)!
    const of = speciesOf.get(id)!
    const base = byDex.get(of)!
    const [t1, t2 = null] = m.types
    forms.push({
      ...base,
      dex: id,
      name: enName(id) || base.name,
      type1: t1!,
      type2: t2,
      speed: speedOf(base, api.get(of), m),
      spriteUrl: sprite(id),
      evolutions: [],
      milestones: [],
      notes: `${m.identifier} · BST ${bst(m)}`,
      form: { of, kind: 'mega', mechanic },
    })
  }

  // ---- Gigantamax
  const gmax = [...api.values()].filter((m) => m.id > 10000 && m.identifier.endsWith('-gmax') && !GMAX_SKIPPED.has(m.identifier))
  for (const m of gmax) {
    const of = speciesOf.get(m.id)!
    const base = byDex.get(of)
    if (!base) continue
    forms.push({
      ...base,
      dex: m.id,
      name: enName(m.id) || `Gigantamax ${base.name}`,
      spriteUrl: sprite(m.id),
      evolutions: [],
      milestones: [],
      notes: `${m.identifier}`,
      form: { of, kind: 'gmax' },
    })
  }

  // ---- forms taken below half HP (Giratina, Darmanitan, Zygarde, Wishiwashi, Minior)
  const formById = new Map(forms.map((f) => [f.dex, f]))
  for (const h of HP_FORMS) {
    const base = byDex.get(h.of) ?? formById.get(h.of)!
    const a = api.get(h.id)!
    forms.push({
      ...base,
      dex: h.id,
      name: base.name,
      type1: a.types[0]!,
      type2: a.types[1] ?? null,
      speed: speedOf(base, api.get(h.of), a),
      spriteUrl: sprite(h.id),
      evolutions: [],
      milestones: [],
      notes: `${a.identifier} · below half HP, a ${h.from} die becomes a ${h.to} die`,
      form: { of: h.of, kind: 'battle', trigger: 'lowHp', swapDie: { from: h.from, to: h.to } },
    })
  }

  // ---- types picked from a menu: Arceus's Plates, Silvally's Memories, Ogerpon's masks
  for (const [of, idOf, file] of [
    [ARCEUS, arceusFormId, 'arceus'],
    [SILVALLY, silvallyFormId, 'silvally'],
  ] as const) {
    const base = byDex.get(of)!
    const dice = base.dice.reduce((s, d) => s + d.count, 0)
    for (const type of ARCEUS_TYPES) {
      forms.push({
        ...base,
        dex: idOf(type),
        type1: type,
        type2: null,
        spriteUrl: sprite(idOf(type)),
        dice: [{ type, count: dice }],
        evolutions: [],
        milestones: [],
        notes: `${file}-${type} · sprite ${of}-${type}`,
        form: { of, kind: 'battle', trigger: 'choice' },
      })
    }
  }
  {
    const base = byDex.get(OGERPON)!
    const dice = base.dice.reduce((s, d) => s + d.count, 0)
    for (const id of OGERPON_MASKS) {
      const a = api.get(id)!
      const [t1, t2 = null] = a.types
      forms.push({
        ...base,
        dex: id,
        type1: t1!,
        type2: t2,
        spriteUrl: sprite(id),
        // Its dice take the mask's type, as Arceus's take its Plate's.
        dice: [{ type: t2 ?? t1!, count: dice }],
        evolutions: [],
        milestones: [],
        notes: a.identifier,
        form: { of: OGERPON, kind: 'battle', trigger: 'choice' },
      })
    }
  }

  // ---- the plain species' evolutions
  for (const [dex, evolutions] of BASE_EVOLUTIONS) {
    const p = byDex.get(dex)!
    p.evolutions = evolutions
    // One EVOLVE milestone per evolution level, as every row has.
    p.milestones = [...p.milestones.filter((m) => m.effect !== 'EVOLVE'), ...evolveMilestones(evolutions)].sort((a, b) => a.level - b.level)
  }

  const formIds = new Set(forms.map((f) => f.dex))
  for (const plan of REGIONAL_FORMS)
    for (const e of plan.evolutions) if (!byDex.has(e.toDex) && !formIds.has(e.toDex)) throw new Error(`${plan.id} → #${e.toDex}?`)
  await writeJson('pokemon.json', [...pokemon, ...forms.sort((a, b) => a.dex - b.dex)])

  // ---- areas
  const areas = await readJson<Area[]>('areas.json')
  const areaNamed = (name: string) => {
    const a = areas.find((x) => normName(x.name) === normName(name))
    if (!a) throw new Error(`no area "${name}"`)
    return a
  }
  for (const [name, from, to] of WILD_REPLACE) for (const w of areaNamed(name).wildPool) if (w.dex === from) w.dex = to
  for (const [name, dex] of WILD_OFF) for (const w of areaNamed(name).wildPool) if (w.dex === dex) w.weight = 0
  for (const [name, dex, weight, minLevel, maxLevel] of WILD_ADD) {
    const a = areaNamed(name)
    if (a.wildPool.some((w) => w.dex === dex)) continue
    a.wildPool.push({ id: stableUuid(`form-wild:${a.id}:${dex}`), dex, weight, minLevel, maxLevel })
  }
  for (const [name, itemKey] of LOOT_ADD) {
    const a = areaNamed(name)
    if (a.lootPool.some((l) => l.itemKey === itemKey)) continue
    a.lootPool.push({ id: stableUuid(`form-loot:${a.id}:${itemKey}`), itemKey, weight: 6, unique: true, minQty: 1, maxQty: 1 })
  }
  // The Galarian birds' secret area.
  const birdsId = stableUuid('area:dyna-tree-hill')
  if (!areas.some((a) => a.id === birdsId)) {
    const after = areaNamed(BIRDS_AREA.afterArea)
    const template = areaNamed('The Split-Decision Ruins')
    areas.push({
      ...template,
      id: birdsId,
      orderIndex: BIRDS_AREA.orderIndex,
      name: BIRDS_AREA.name,
      bannerUrl: after.bannerUrl,
      minLevel: BIRDS_AREA.level - 4,
      maxLevel: BIRDS_AREA.level + 4,
      battleBackground: 'grass',
      legendaryBoss: BIRDS_AREA.bosses.map((dex) => ({ dex, level: BIRDS_AREA.level, teamAvgThreshold: 0 })),
      unlockConditions: [
        { kind: 'area', areaId: after.id },
        { kind: 'pokedex', count: BIRDS_AREA.pokedex },
        { kind: 'maxLevel', level: BIRDS_AREA.maxLevel },
      ],
      wildPool: [],
      trainerPool: [],
      lootPool: template.lootPool.map((l) => ({ ...l, id: stableUuid(`form-loot:${birdsId}:${l.itemKey}`) })),
    })
  }
  await writeJson('areas.json', areas)

  // ---- trainers
  const trainers = await readJson<Trainer[]>('trainers.json')
  const regionOfTrainer = new Map<string, string>()
  for (const a of areas) for (const id of [...a.trainerPool.map((t) => t.trainerId), ...a.gyms]) regionOfTrainer.set(id, a.regionId ?? 'kanto')
  for (const t of trainers) {
    const region = regionOfTrainer.get(t.id)
    for (const m of t.team) {
      const hit = TRAINER_REPLACE.find(([r, from]) => r === region && from === m.dex)
      if (hit) m.dex = hit[2]
    }
  }
  await writeJson('trainers.json', trainers)

  // ---- items
  const items = await readJson<ItemDef[]>('items.json')
  const galarica = (key: string, name: string, into: string): ItemDef => ({
    key,
    name,
    description: `Makes certain Pokémon evolve: Galarian Slowpoke (${into}). Use it from the Team screen.`,
    spriteUrl: POKESPRITE(`evo-item/${key}`),
    price: 200,
    effect: { kind: 'stone' },
    inShop: false,
    shopBadges: 0,
    region: 'galar',
  })
  for (const it of [galarica('galarica-cuff', 'Galarica Cuff', 'Galarian Slowbro'), galarica('galarica-wreath', 'Galarica Wreath', 'Galarian Slowking')])
    if (!items.some((i) => i.key === it.key)) items.push(it)
  await writeJson('items.json', items)

  // ---- names
  await writeNames(forms, api)
  const n = (k: string) => forms.filter((f) => f.form?.kind === k).length
  console.log(`✓ ${n('regional')} regional forms, ${n('mega')} Mega Evolutions, ${n('gmax')} Gigantamax, ${n('battle')} battle forms → src/data, src/i18n/strings.csv`)
}

const ORIGIN: Record<string, Partial<Record<Lang, string>>> = {
  alola: { es: 'de Alola', de: 'Alola', ja: 'アローラのすがた', ko: '알로라의 모습', 'zh-Hans': '阿罗拉的样子' },
  galar: { es: 'de Galar', de: 'Galar', ja: 'ガラルのすがた', ko: '가라르의 모습', 'zh-Hans': '伽勒尔的样子' },
  hisui: { es: 'de Hisui', de: 'Hisui', ja: 'ヒスイのすがた', ko: '히스이의 모습', 'zh-Hans': '洗翠的样子' },
  paldea: { es: 'de Paldea', de: 'Paldea', ja: 'パルデアのすがた', ko: '팔데아의 모습', 'zh-Hans': '帕底亚的样子' },
}
const BREED: Record<string, Partial<Record<Lang, string>>> = {
  combat: { es: 'Raza Combatiente', de: 'Gefechtsrasse', ja: 'コンバット種', ko: '컴뱃종', 'zh-Hans': '斗战种' },
  blaze: { es: 'Raza Ardiente', de: 'Flammenrasse', ja: 'ブレイズ種', ko: '블레이즈종', 'zh-Hans': '火炽种' },
  aqua: { es: 'Raza Acuática', de: 'Flutenrasse', ja: 'ウォーター種', ko: '워터종', 'zh-Hans': '水澜种' },
}
const MEGA_PREFIX: Partial<Record<Lang, string>> = { fr: 'Méga-', es: 'Mega-', de: 'Mega-', ja: 'メガ', ko: '메가', 'zh-Hans': '超级' }
const FULL_WIDTH: Record<string, string> = { x: 'Ｘ', y: 'Ｙ', z: 'Ｚ' }

/** A name PokeAPI has not got yet (the newest forms in Spanish, German, Korean, Chinese), built the games' way. */
const GMAX_NAME: Partial<Record<Lang, (s: string) => string>> = {
  fr: (s) => `${s} Gigamax`,
  es: (s) => `${s} Gigamax`,
  de: (s) => `Gigadynamax-${s}`,
  ja: (s) => `${s}（キョダイマックスのすがた）`,
  ko: (s) => `${s}(거다이맥스의 모습)`,
  'zh-Hans': (s) => `${s}（超极巨化的样子）`,
}
const PRIMAL_NAME: Partial<Record<Lang, (s: string) => string>> = {
  fr: (s) => `Primo-${s}`,
  es: (s) => `${s} Primigenio`,
  de: (s) => `Proto-${s}`,
  ja: (s) => `ゲンシ${s}`,
  ko: (s) => `원시${s}`,
  'zh-Hans': (s) => `原始${s}`,
}

function composedName(f: Species, lang: Lang, species: string, identifier: string): string {
  const cjk = lang === 'ja' || lang === 'zh-Hans'
  if (f.form!.kind === 'gmax') return GMAX_NAME[lang]?.(species) ?? f.name
  if (f.form!.mechanic === 'primal') return PRIMAL_NAME[lang]?.(species) ?? f.name
  if (f.form!.kind === 'mega') {
    const letter = identifier.match(/-mega-([xyz])$/)?.[1]
    const suffix = !letter ? '' : cjk ? FULL_WIDTH[letter]! : lang === 'ko' ? letter.toUpperCase() : ` ${letter.toUpperCase()}`
    return MEGA_PREFIX[lang] ? `${MEGA_PREFIX[lang]}${species}${suffix}` : f.name
  }
  const origin = Object.keys(ORIGIN).find((o) => identifier.includes(`-${o}`))
  const label = origin && ORIGIN[origin]![lang]
  if (!label) return f.name
  const breed = Object.keys(BREED).find((b) => identifier.includes(`-${b}-breed`))
  const extra = breed ? BREED[breed]![lang] : undefined
  if (lang === 'es') return `${species} ${label}${extra ? ` (${extra})` : ''}`
  if (lang === 'de') return `${label}-${species}${extra ? ` (${extra})` : ''}`
  const inner = extra ? `${label}・${extra}` : label
  return cjk ? `${species}（${inner}）` : `${species}(${inner})`
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * One `pokemon.<id>` row per form. PokeAPI gives a full name in English, French and German; elsewhere a Mega's form
 * name is its full name, and a regional form is the species' name with the form in brackets. Arceus's and Giratina's
 * forms keep the species' name — the battle shows the type and the look.
 */
async function writeNames(forms: Species[], api: Map<number, ApiMon>) {
  const sheet = await readFile(SHEET, 'utf8')
  const rows = parseCsv(sheet)
  const header = rows[0]!
  const col = (lang: Lang) => header.indexOf(lang)
  const rowOf = new Map(rows.map((r) => [r[0]!, r]))
  const keep = sheet
    .split('\n')
    .filter((l) => !/^pokemon\.(\d{5}),/.test(l) && !l.startsWith('# --- Pokémon forms') && !/^(item|itemDesc)\.galarica-|^area\.dyna-tree-hill,/.test(l))
    .join('\n')
    .replace(/\n+$/, '')
  const out: string[] = ['# --- Pokémon forms (generated by `pnpm seed-forms` from PokeAPI),,,,,,,,,,']
  for (const f of forms) {
    const speciesRow = rowOf.get(pokemonKey(f.form!.of))
    const species = (lang: Lang) => speciesRow?.[col(lang)] || f.name
    const cells = LANGS.map((lang) => {
      if (f.form!.kind === 'battle') return species(lang)
      if (lang === 'it' || lang === 'pt' || lang === 'pt-BR') return f.name
      const identifier = api.get(f.dex)?.identifier ?? ''
      // Japanese names the Tauros breeds alike: the breed has to be spelt out.
      if (identifier.endsWith('-breed')) return composedName(f, lang, species(lang), identifier)
      const names = api.get(f.dex)?.names
      for (const id of LANG_IDS[lang] ?? []) {
        const [form, full] = names?.get(id) ?? ['', '']
        if (full) return full
        if (form && f.form!.kind === 'mega' && f.form!.mechanic !== 'primal') return form
        if (form) return composedName(f, lang, species(lang), identifier)
      }
      return composedName(f, lang, species(lang), identifier)
    })
    out.push([pokemonKey(f.dex), ...cells].map(csvCell).join(','))
  }
  const fixed: [string, string[]][] = [
    [itemKey('galarica-cuff'), ['Galarica Cuff', 'Bracelet Galanoa', 'Brazal Galanuez', 'Galarnuss-Reif', 'Bracciale Galarnoce', 'Bracelete Galárica', 'Bracelete Galárica', 'ガラナツブレス', '가라두구팔찌', '伽勒豆蔻手环']],
    [itemKey('galarica-wreath'), ['Galarica Wreath', 'Couronne Galanoa', 'Corona Galanuez', 'Galarnuss-Kranz', 'Corona Galarnoce', 'Coroa Galárica', 'Coroa Galárica', 'ガラナツリース', '가라두구머리장식', '伽勒豆蔻花圈']],
    [
      itemDescKey('galarica-cuff'),
      [
        'Makes certain Pokémon evolve: Galarian Slowpoke (Galarian Slowbro). Use it from the Team screen.',
        "Fait évoluer certains Pokémon : Ramoloss de Galar (Flagadoss de Galar). À utiliser depuis l'écran Équipe.",
        'Hace evolucionar a ciertos Pokémon: Slowpoke de Galar (Slowbro de Galar). Úsalo desde la pantalla Equipo.',
        'Lässt bestimmte Pokémon entwickeln: Galar-Flegmon (Galar-Lahmus). Im Team-Bildschirm einsetzbar.',
        'Fa evolvere alcuni Pokémon: Slowpoke di Galar (Slowbro di Galar). Usalo dalla schermata Squadra.',
        'Faz evoluir certos Pokémon: Slowpoke de Galar (Slowbro de Galar). Usa-o no ecrã Equipa.',
        'Faz certos Pokémon evoluírem: Slowpoke de Galar (Slowbro de Galar). Use na tela Equipe.',
        '特定のポケモンを進化させる：ガラルヤドン（ガラルヤドラン）。「手持ち」画面で使う。',
        '특정 포켓몬을 진화시킨다: 가라르 야돈(가라르 야도란). 팀 화면에서 사용한다.',
        '让特定的宝可梦进化：伽勒尔呆呆兽（伽勒尔呆壳兽）。在队伍画面中使用。',
      ],
    ],
    [
      itemDescKey('galarica-wreath'),
      [
        'Makes certain Pokémon evolve: Galarian Slowpoke (Galarian Slowking). Use it from the Team screen.',
        "Fait évoluer certains Pokémon : Ramoloss de Galar (Roigada de Galar). À utiliser depuis l'écran Équipe.",
        'Hace evolucionar a ciertos Pokémon: Slowpoke de Galar (Slowking de Galar). Úsalo desde la pantalla Equipo.',
        'Lässt bestimmte Pokémon entwickeln: Galar-Flegmon (Galar-Laschoking). Im Team-Bildschirm einsetzbar.',
        'Fa evolvere alcuni Pokémon: Slowpoke di Galar (Slowking di Galar). Usala dalla schermata Squadra.',
        'Faz evoluir certos Pokémon: Slowpoke de Galar (Slowking de Galar). Usa-a no ecrã Equipa.',
        'Faz certos Pokémon evoluírem: Slowpoke de Galar (Slowking de Galar). Use na tela Equipe.',
        '特定のポケモンを進化させる：ガラルヤドン（ガラルヤドキング）。「手持ち」画面で使う。',
        '특정 포켓몬을 진화시킨다: 가라르 야돈(가라르 야도킹). 팀 화면에서 사용한다.',
        '让特定的宝可梦进化：伽勒尔呆呆兽（伽勒尔呆呆王）。在队伍画面中使用。',
      ],
    ],
    [
      areaKey(BIRDS_AREA.name),
      ['Dyna Tree Hill', 'Butte du Dynarbre', 'Colina del Árbol Dinamax', 'Hügel des Dyna-Baums', "Collina dell'Albero Dynamax", 'Colina da Árvore Dynamax', 'Colina da Árvore Dynamax', 'ダイ木の丘', '다이나무 언덕', '极巨树之丘'],
    ],
  ]
  for (const [key, cells] of fixed) out.push([key, ...cells].map(csvCell).join(','))
  await writeFile(SHEET, `${keep}\n${out.join('\n')}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
