/**
 * pnpm seed-regions — appends Johto (152–251) and Hoenn (252–386) to the offline bundle.
 *
 * Unlike `pnpm seed`, this script is **additive**: it reads `src/data/*.json`, keeps every existing row exactly as it
 * is, and only appends what is missing. That matters because the committed bundle is ahead of `scripts/seed.ts` —
 * admin tuning was synced back into it (evolution stones, fossils, item-triggered evolutions), and a full re-seed
 * would delete all of that.
 *
 * Species are balanced by the very rules Kanto was: the pure helpers in `seed.ts` (`hpAtLevel`, `catchValueFromRate`,
 * `diceCountFromBst`, `composeDice`, `applyDiceSchedule`) are imported rather than re-implemented.
 *
 * Data comes from the PokeAPI static mirror on raw.githubusercontent (pokeapi.co itself is unreachable from CI and
 * from the sandbox). Every response is cached under `scripts/.cache/`, so re-runs are offline and idempotent.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyDiceSchedule,
  catchValueFromRate,
  composeDice,
  diceCountFromBst,
  hpAtLevel,
} from './seed'
import type { Evolution, ItemDef, PokeType, Species } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache')
const DATA_DIR = path.join(ROOT, 'src', 'data')

/** PokeAPI's own static export of the v2 API. Same JSON, one `index.json` per endpoint. */
const MIRROR = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2'
const SPRITE = (dex: number) => `/pokemon/${String(dex).padStart(3, '0')}_front.png`
const ITEM_SPRITE = (key: string) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${key}.png`

const FIRST_NEW_DEX = 152
const DEX_MAX = 386

// ---------------------------------------------------------------- mirror access (cached)

interface ApiPokemon {
  id: number
  types: { slot: number; type: { name: string } }[]
  stats: { base_stat: number; stat: { name: string } }[]
}
interface ApiSpecies {
  id: number
  capture_rate: number
  names: { name: string; language: { name: string } }[]
  evolution_chain: { url: string }
}
interface ApiEvoDetail {
  min_level: number | null
  trigger: { name: string }
  /** Set by `use-item` triggers (the stones). */
  item: { name: string } | null
  /** Set by `trade` triggers that need an item held (Metal Coat, King's Rock, Dragon Scale, Up-Grade…). */
  held_item: { name: string } | null
}
interface ApiChainLink {
  species: { name: string; url: string }
  evolution_details: ApiEvoDetail[]
  evolves_to: ApiChainLink[]
}
interface ApiChain {
  chain: ApiChainLink
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** `https://…/api/v2/pokemon/152/` or `/api/v2/pokemon/152/` → `pokemon/152`. The mirror returns relative urls. */
const endpointOf = (url: string) => url.replace(/^.*\/api\/v2\//, '').replace(/\/+$/, '')

async function getJson<T>(endpoint: string): Promise<T> {
  const file = path.join(CACHE_DIR, `${endpoint.replace(/[^a-z0-9]+/gi, '_')}.json`)
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8')) as T
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${MIRROR}/${endpoint}/index.json`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${endpoint}`)
      const json = (await res.json()) as T
      await writeFile(file, JSON.stringify(json))
      return json
    } catch (err) {
      lastErr = err
      await sleep(400 * 2 ** attempt)
    }
  }
  throw lastErr
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

const dexFromUrl = (url: string) => Number(endpointOf(url).split('/').pop())

// ---------------------------------------------------------------- evolutions

/**
 * Evolution items we hand out, by the PokeAPI item name. A species evolving with one of these becomes an item
 * evolution (`level: null`), matching how Kanto's stones are already stored; anything else gets an assigned level.
 */
const EVO_ITEMS = new Set([
  'fire-stone',
  'water-stone',
  'thunder-stone',
  'leaf-stone',
  'moon-stone',
  'sun-stone',
  'kings-rock',
  'metal-coat',
  'dragon-scale',
  'up-grade',
  'deep-sea-tooth',
  'deep-sea-scale',
])

/**
 * Espeon and Umbreon evolve on happiness by day and by night. With no day/night cycle, they become stone evolutions
 * instead — which also keeps all five Eevee branches item-driven, so a levelling Eevee never pre-empts the stones.
 */
const FORCED_ITEM: Record<number, string> = { 196: 'sun-stone', 197: 'moon-stone' }

/**
 * Nincada evolves into Ninjask at Lv.20 and *also* leaves a Shedinja behind, which PokeAPI models as a second branch
 * with no level. Left alone it would be assigned Lv.30 and never fire, because Nincada is already a Ninjask by then.
 * Pinning it to 20 makes the two a real branch: one or the other, rolled like every other split.
 */
const FORCED_LEVEL: Record<number, number> = { 292: 20 }

/**
 * Catch values for the new legendaries, matched to Kanto's own bands rather than taken from the capture rate. Gen 2
 * and 3 legendaries all sit at capture rate 3, which maps to 9 — needing a 6 on the die even with an Ultra Ball,
 * far harsher than anything in Kanto. Kanto sets the reference: Mewtwo 7, the birds 6, Mew 5.
 */
const LEGENDARY_CATCH: Record<number, number> = {
  249: 7, // Lugia      ·  box legendaries, as Mewtwo
  250: 7, // Ho-Oh
  382: 7, // Kyogre
  383: 7, // Groudon
  384: 7, // Rayquaza
  243: 6, // Raikou     ·  the roamers and the trios, as the birds
  244: 6, // Entei
  245: 6, // Suicune
  377: 6, // Regirock
  378: 6, // Regice
  379: 6, // Registeel
  380: 6, // Latias
  381: 6, // Latios
  251: 5, // Celebi     ·  the mythicals, as Mew
  385: 5, // Jirachi
  386: 5, // Deoxys
}

/** One evolution edge, in the shape the bundle already uses for Kanto. */
function evolutionOf(toDex: number, details: ApiEvoDetail[]): { evo: Evolution; note: string } {
  const forced = FORCED_ITEM[toDex]
  if (forced) return { evo: { toDex, level: null, item: forced }, note: `happiness → ${forced}` }

  const level = FORCED_LEVEL[toDex]
  if (level) return { evo: { toDex, level }, note: `branches at Lv.${level}` }

  // A stone sits in `item`; a trade-with-held-item (Steelix, Scizor, Kingdra, Politoed, Slowking, Porygon2) in
  // `held_item`. Both become the same thing here: use the item, no trading and no level.
  const item = details.flatMap((d) => [d.item?.name, d.held_item?.name]).find((n) => n && EVO_ITEMS.has(n))
  if (item) return { evo: { toDex, level: null, item }, note: item }

  const byLevel = details.find((d) => d.trigger.name === 'level-up' && d.min_level)
  if (byLevel?.min_level) return { evo: { toDex, level: byLevel.min_level }, note: '' }

  const trigger = details[0]?.trigger.name ?? 'other'
  if (trigger === 'trade') return { evo: { toDex, level: 34 }, note: 'trade → assigned Lv.34' }
  if (trigger === 'use-item') return { evo: { toDex, level: 28 }, note: 'stone → assigned Lv.28' }
  return { evo: { toDex, level: 30 }, note: `${trigger} → assigned Lv.30` }
}

// ---------------------------------------------------------------- new items

const item = (
  key: string,
  name: string,
  description: string,
  price: number,
  effect: ItemDef['effect'],
  shopBadges: number | null,
): ItemDef => ({
  key,
  name,
  description,
  spriteUrl: ITEM_SPRITE(key),
  price,
  effect,
  inShop: shopBadges !== null,
  shopBadges: shopBadges ?? 0,
})

/**
 * An evolution stone does nothing on its own: the Team screen offers it to whoever it can evolve. Priced as Kanto's.
 * Out of the shops for now (`inShop: false`) — these are Johto and Hoenn items, and Kanto's Mart must not start
 * stocking them. Step 3 turns them on with a `shopArea` in their own region, the way Celadon gates Kanto's stones.
 */
const stone = (key: string, name: string, evolves: string) =>
  item(key, name, `Makes certain Pokémon evolve: ${evolves}. Use it from the Team screen.`, 200, { kind: 'stone' }, null)

/** Fossils revive in the Box after a wait, exactly like Kanto's (see src/engine/fossils.ts). Found, never bought. */
const fossil = (key: string, name: string, dex: number, who: string) =>
  item(
    key,
    name,
    `A fossil of an ancient Pokémon. ${who} waits in your Box and is revived after 24 hours, at Lv.20.`,
    0,
    { kind: 'fossil', dex, level: 20, hours: 24 },
    null,
  )

const NEW_ITEMS: ItemDef[] = [
  stone('sun-stone', 'Sun Stone', 'Gloom (Bellossom), Sunkern, Eevee (Espeon)'),
  stone('kings-rock', "King's Rock", 'Poliwhirl (Politoed), Slowpoke (Slowking)'),
  stone('metal-coat', 'Metal Coat', 'Onix (Steelix), Scyther (Scizor)'),
  stone('dragon-scale', 'Dragon Scale', 'Seadra (Kingdra)'),
  stone('up-grade', 'Up-Grade', 'Porygon (Porygon2)'),
  stone('deep-sea-tooth', 'Deep Sea Tooth', 'Clamperl (Huntail)'),
  stone('deep-sea-scale', 'Deep Sea Scale', 'Clamperl (Gorebyss)'),
  fossil('root-fossil', 'Root Fossil', 345, 'Lileep'),
  fossil('claw-fossil', 'Claw Fossil', 347, 'Anorith'),
]

// ---------------------------------------------------------------- build

interface FetchResult {
  list: Species[]
  bst: Map<number, number>
  /** Edges whose source is an existing (Kanto) species: Onix → Steelix, Eevee → Espeon, Chansey → Blissey… */
  intoExisting: Map<number, Evolution[]>
}

async function fetchNewSpecies(existing: Species[]): Promise<FetchResult> {
  const dexes = Array.from({ length: DEX_MAX - FIRST_NEW_DEX + 1 }, (_, i) => FIRST_NEW_DEX + i)
  console.log(`· fetching ${dexes.length} pokemon + species from the mirror…`)
  const mons = await mapPool(dexes, 8, (d) => getJson<ApiPokemon>(`pokemon/${d}`))
  const species = await mapPool(dexes, 8, (d) => getJson<ApiSpecies>(`pokemon-species/${d}`))

  const chainEndpoints = [...new Set(species.map((s) => endpointOf(s.evolution_chain.url)))]
  console.log(`· fetching ${chainEndpoints.length} evolution chains…`)
  const chains = await mapPool(chainEndpoints, 8, (e) => getJson<ApiChain>(e))

  // Every edge that touches a new species is kept, in both directions across a generation boundary: Pichu → Pikachu
  // has a new source, Onix → Steelix a new target. Edges wholly inside Kanto are already in the bundle.
  const evolutions = new Map<number, Evolution[]>()
  const notes = new Map<number, string[]>()
  const walk = (link: ApiChainLink) => {
    const from = dexFromUrl(link.species.url)
    for (const child of link.evolves_to) {
      const to = dexFromUrl(child.species.url)
      const touchesNew = from >= FIRST_NEW_DEX || to >= FIRST_NEW_DEX
      if (touchesNew && from <= DEX_MAX && to <= DEX_MAX) {
        const { evo, note } = evolutionOf(to, child.evolution_details)
        evolutions.set(from, [...(evolutions.get(from) ?? []), evo])
        if (note) notes.set(from, [...(notes.get(from) ?? []), `→ #${to}: ${note}`])
      }
      walk(child)
    }
  }
  chains.forEach((c) => walk(c.chain))

  const bst = new Map<number, number>(existing.map((s) => [s.dex, bstOfExisting(s)]))
  const list = mons.map((mon, i) => {
    const sp = species[i]!
    const types = [...mon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name as PokeType)
    const stat = (name: string) => mon.stats.find((s) => s.stat.name === name)?.base_stat ?? 0
    const total = mon.stats.reduce((sum, s) => sum + s.base_stat, 0)
    bst.set(mon.id, total)
    const type1 = types[0]!
    const type2 = types[1] ?? null
    const diceCount = diceCountFromBst(total)
    const hpStat = stat('hp')
    return {
      dex: mon.id,
      name: sp.names.find((n) => n.language.name === 'en')?.name ?? `#${mon.id}`,
      type1,
      type2,
      baseHp: hpAtLevel(hpStat, 1),
      maxHp: hpAtLevel(hpStat, 100),
      speed: Math.floor(stat('speed') / 10),
      spriteUrl: SPRITE(mon.id),
      dice: composeDice(diceCount, type1, type2),
      rerolls: diceCount,
      catchValue: LEGENDARY_CATCH[mon.id] ?? catchValueFromRate(sp.capture_rate),
      evolutions: evolutions.get(mon.id) ?? [],
      milestones: [],
      notes: [`BST ${total}`, ...(notes.get(mon.id) ?? [])].join(' · '),
    } satisfies Species
  })
  const intoExisting = new Map([...evolutions].filter(([from]) => from < FIRST_NEW_DEX))
  return { list, bst, intoExisting }
}

/**
 * Appends the cross-generation branches to the Kanto rows that grew one, leaving everything else untouched. A new
 * level-based branch also gets its EVOLVE milestone, which is what the Team screen reads to show the mark.
 */
function graftEvolutions(species: Species[], intoExisting: Map<number, Evolution[]>): { species: Species[]; grafted: string[] } {
  const grafted: string[] = []
  const out = species.map((s) => {
    const added = (intoExisting.get(s.dex) ?? []).filter((e) => !s.evolutions.some((x) => x.toDex === e.toDex))
    if (!added.length) return s
    grafted.push(`${s.name} → ${added.map((e) => `#${e.toDex}${e.item ? ` (${e.item})` : ` (Lv.${e.level})`}`).join(', ')}`)
    const evolutions = [...s.evolutions, ...added]
    const levels = evolutions.flatMap((e) => (e.level != null ? [e.level] : []))
    const milestones = [...s.milestones]
    if (levels.length && !milestones.some((m) => m.effect === 'EVOLVE')) {
      milestones.push({ level: Math.min(...levels), effect: 'EVOLVE' })
    }
    return { ...s, evolutions, milestones }
  })
  return { species: out, grafted }
}

/** Kanto's BST isn't stored, but `notes` starts with it ("BST 318 · …"); fall back to a mid value if it ever isn't. */
function bstOfExisting(s: Species): number {
  const m = /^BST (\d+)/.exec(s.notes ?? '')
  return m ? Number(m[1]) : 400
}

const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(path.join(DATA_DIR, name), 'utf8')) as T
const writeJson = (name: string, data: unknown) => writeFile(path.join(DATA_DIR, name), JSON.stringify(data, null, 1) + '\n')

async function main() {
  await mkdir(CACHE_DIR, { recursive: true })
  const pokemon = await readJson<Species[]>('pokemon.json')
  const items = await readJson<ItemDef[]>('items.json')

  const kept = pokemon.filter((p) => p.dex < FIRST_NEW_DEX)
  if (kept.length !== pokemon.length) console.log(`· replacing ${pokemon.length - kept.length} previously generated rows`)

  const { list, bst, intoExisting } = await fetchNewSpecies(kept)

  // The stage graph spans generations (Pichu → Pikachu, Onix → Steelix), so the schedule is computed over the merged
  // list — but only the new rows take the result. Otherwise adding a baby would silently re-plan its Kanto line.
  const { species: grown, grafted } = graftEvolutions([...kept, ...list].sort((a, b) => a.dex - b.dex), intoExisting)
  const scheduled = new Map(applyDiceSchedule(grown, (dex) => bst.get(dex) ?? 400).map((s) => [s.dex, s]))
  const out = grown.map((s) => (s.dex >= FIRST_NEW_DEX ? scheduled.get(s.dex)! : s))
  for (const g of grafted) console.log(`  · grafted ${g}`)

  const byKey = new Map(items.map((i) => [i.key, i]))
  for (const it of NEW_ITEMS) if (!byKey.has(it.key)) items.push(it)
  // The Master Ball is a guaranteed catch (d6 + bonus against a catch value of at most 9), and never sellable.
  const master = items.find((i) => i.key === 'master-ball')
  if (master && master.effect.kind === 'ball') master.effect.bonus = 10

  await writeJson('pokemon.json', out)
  await writeJson('items.json', items)

  const added = out.length - kept.length
  console.log(`✓ ${out.length} species (${added} added) · ${items.length} items · wrote src/data/pokemon.json, items.json`)
  console.log('  supabase/seed.sql is regenerated with the region content in step 3.')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
