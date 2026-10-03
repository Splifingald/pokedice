/**
 * pnpm seed-regions — appends Johto (152–251), Hoenn (252–386), Sinnoh (387–493), Unova (494–649), Kalos
 * (650–721) and Alola (722–809) to the offline bundle.
 *
 * Unlike `pnpm seed`, this script is **additive**: it reads `src/data/*.json`, keeps every existing row exactly as it
 * is, and only appends what is missing. That matters because the committed bundle is ahead of `scripts/seed.ts` —
 * admin tuning was synced back into it (evolution stones, fossils, item-triggered evolutions), and a full re-seed
 * would delete all of that.
 *
 * HP, speed and catch values come from the pure helpers in `seed.ts` (`hpAtLevel`, `catchValueFromRate`), imported
 * rather than re-implemented. Dice up to Sinnoh came from `applyDiceSchedule`; from Unova on they come from
 * `liveDicePlan` (scripts/dice-live.ts), the patterns the admin's hand tuning of Sinnoh, Hoenn and Johto settled on.
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
  buildAreasAndTrainers,
  catchValueFromRate,
  composeDice,
  diceCountFromBst,
  hpAtLevel,
} from './seed'
import { HOENN_AREAS, HOENN_STARTERS } from './content-hoenn'
import { JOHTO_AREAS, JOHTO_STARTERS } from './content-johto'
import { SINNOH_AREAS, SINNOH_STARTERS } from './content-sinnoh'
import { UNOVA_AREAS, UNOVA_STARTERS } from './content-unova'
import { KALOS_AREAS, KALOS_STARTERS } from './content-kalos'
import { ALOLA_AREAS, ALOLA_STARTERS } from './content-alola'
import { liveDicePlan, type LegendKind } from './dice-live'
import type { AreaPlan } from './content'
import type { Area, BattleBackground, Evolution, ItemDef, PokeType, Region, Species, Trainer } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache')
const DATA_DIR = path.join(ROOT, 'src', 'data')

/** PokeAPI's own static export of the v2 API. Same JSON, one `index.json` per endpoint. */
const MIRROR = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2'
const SPRITE = (dex: number) => `/pokemon/${String(dex).padStart(3, '0')}_front.png`
const ITEM_SPRITE = (key: string) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${key}.png`

/**
 * The range this run generates. Everything outside it is kept exactly as the bundle has it, so the default run adds
 * Unova and touches nothing else; `--from 387` would regenerate Sinnoh along with it — and throw away every hand edit
 * the admin made to Sinnoh's species and areas, which is why the default moved on when Unova was added.
 *
 * That default matters more than it looks. A species only takes a newly computed dice schedule if it is inside the
 * range, and the schedule is computed over the *merged* stage graph — so a run that reaches back over Johto would
 * re-plan Sudowoodo, Mantine, Blissey, Roselia and Chimecho purely because Gen 4 gives each of them a baby form.
 */
const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag)
  return i > 0 ? Number(process.argv[i + 1]) : null
}
const FIRST_NEW_DEX = argOf('--from') ?? 722
const DEX_MAX = argOf('--to') ?? 809

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
  // Gen 4. Most of these graft onto an earlier generation's species (Electabuzz → Electivire, Sneasel → Weavile),
  // which `evolutionGate` keeps inert until the player is in Sinnoh.
  'shiny-stone',
  'dusk-stone',
  'dawn-stone',
  'oval-stone',
  'razor-claw',
  'razor-fang',
  'electirizer',
  'magmarizer',
  'protector',
  'dubious-disc',
  'reaper-cloth',
  'ice-stone',
  // Gen 6: the two trade items of Kalos's fairies.
  'sachet',
  'whipped-dream',
])

/**
 * Espeon and Umbreon evolve on happiness by day and by night. With no day/night cycle, they become stone evolutions
 * instead — which also keeps all five Eevee branches item-driven, so a levelling Eevee never pre-empts the stones.
 */
const FORCED_ITEM: Record<number, string> = {
  196: 'sun-stone',
  197: 'moon-stone',
  // Leafeon and Glaceon evolve next to a mossy or an icy rock, which is a place rather than a trigger this game has.
  // Stones keep all seven Eevee branches item-driven, so a levelling Eevee never pre-empts one of them.
  470: 'leaf-stone',
  471: 'ice-stone',
  // Sylveon wants affection and a Fairy move. The Shiny Stone is the one stone Eevee had no use for yet.
  700: 'shiny-stone',
}

/**
 * Nincada evolves into Ninjask at Lv.20 and *also* leaves a Shedinja behind, which PokeAPI models as a second branch
 * with no level. Left alone it would be assigned Lv.30 and never fire, because Nincada is already a Ninjask by then.
 * Pinning it to 20 makes the two a real branch: one or the other, rolled like every other split.
 */
const FORCED_LEVEL: Record<number, number> = {
  292: 20,
  // Darumaka evolves at Lv.35; PokeAPI lists Galarian Darumaka's Ice Stone on the same edge, which would win otherwise.
  555: 35,
  // Gen 7's three that evolve on something this game has not got. Type: Null turns into Silvally on friendship, met
  // around Lv.40 on Poni; Poipole learns Dragon Pulse at Lv.40 in the games and is entrusted at 55 here; Meltan needs
  // 400 candies from Pokémon GO. Each gets a level a little past where it is found.
  773: 45,
  804: 60,
  809: 50,
}

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
  483: 7, // Dialga
  484: 7, // Palkia
  487: 7, // Giratina
  493: 7, // Arceus
  480: 6, // Uxie       ·  the lake trio, as the birds
  481: 6, // Mesprit
  482: 6, // Azelf
  485: 6, // Heatran
  486: 6, // Regigigas
  488: 6, // Cresselia
  251: 5, // Celebi     ·  the mythicals, as Mew
  385: 5, // Jirachi
  386: 5, // Deoxys
  489: 5, // Phione
  490: 5, // Manaphy
  491: 5, // Darkrai
  492: 5, // Shaymin
  643: 7, // Reshiram   ·  Unova: the tao duo and Kyurem as box legendaries
  644: 7, // Zekrom
  646: 7, // Kyurem
  638: 6, // Cobalion   ·  the Swords of Justice and the Forces of Nature, as the birds
  639: 6, // Terrakion
  640: 6, // Virizion
  641: 6, // Tornadus
  642: 6, // Thundurus
  645: 6, // Landorus
  494: 5, // Victini    ·  the mythicals, as Mew
  647: 5, // Keldeo
  648: 5, // Meloetta
  649: 5, // Genesect
  716: 7, // Xerneas    ·  Kalos: the life-and-death pair and Zygarde as box legendaries
  717: 7, // Yveltal
  718: 7, // Zygarde
  719: 5, // Diancie    ·  the mythicals, as Mew
  720: 5, // Hoopa
  721: 5, // Volcanion
  785: 6, // Tapu Koko  ·  Alola: the guardians and the Ultra Beasts, as the birds
  786: 6, // Tapu Lele
  787: 6, // Tapu Bulu
  788: 6, // Tapu Fini
  793: 6, // Nihilego
  794: 6, // Buzzwole
  795: 6, // Pheromosa
  796: 6, // Xurkitree
  797: 6, // Celesteela
  798: 6, // Kartana
  799: 6, // Guzzlord
  803: 6, // Poipole
  804: 6, // Naganadel
  805: 6, // Stakataka
  806: 6, // Blacephalon
  789: 6, // Cosmog     ·  the story's nebula, a gentle catch
  790: 6, // Cosmoem
  772: 6, // Type: Null ·  capture rate 3, but a found Pokémon rather than a legendary
  773: 6, // Silvally
  791: 7, // Solgaleo   ·  box legendaries
  792: 7, // Lunala
  800: 7, // Necrozma
  801: 5, // Magearna   ·  the mythicals, as Mew
  802: 5, // Marshadow
  807: 5, // Zeraora
  808: 5, // Meltan
  809: 5, // Melmetal
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
  stone('shiny-stone', 'Shiny Stone', 'Roselia (Roserade), Togetic (Togekiss)'),
  stone('dusk-stone', 'Dusk Stone', 'Misdreavus (Mismagius), Murkrow (Honchkrow)'),
  stone('dawn-stone', 'Dawn Stone', 'Kirlia (Gallade), Snorunt (Froslass)'),
  stone('ice-stone', 'Ice Stone', 'Eevee (Glaceon)'),
  stone('oval-stone', 'Oval Stone', 'Happiny (Chansey)'),
  stone('razor-claw', 'Razor Claw', 'Sneasel (Weavile)'),
  stone('razor-fang', 'Razor Fang', 'Gligar (Gliscor)'),
  stone('electirizer', 'Electirizer', 'Electabuzz (Electivire)'),
  stone('magmarizer', 'Magmarizer', 'Magmar (Magmortar)'),
  stone('protector', 'Protector', 'Rhydon (Rhyperior)'),
  stone('dubious-disc', 'Dubious Disc', 'Porygon2 (Porygon-Z)'),
  stone('reaper-cloth', 'Reaper Cloth', 'Dusclops (Dusknoir)'),
  fossil('skull-fossil', 'Skull Fossil', 408, 'Cranidos'),
  fossil('armor-fossil', 'Armor Fossil', 410, 'Shieldon'),
  { ...fossil('cover-fossil', 'Cover Fossil', 564, 'Tirtouga'), region: 'unova' },
  { ...fossil('plume-fossil', 'Plume Fossil', 566, 'Archen'), region: 'unova' },
  { ...fossil('jaw-fossil', 'Jaw Fossil', 696, 'Tyrunt'), region: 'kalos' },
  { ...fossil('sail-fossil', 'Sail Fossil', 698, 'Amaura'), region: 'kalos' },
  { ...stone('sachet', 'Sachet', 'Spritzee (Aromatisse)'), region: 'kalos' },
  { ...stone('whipped-dream', 'Whipped Dream', 'Swirlix (Slurpuff)'), region: 'kalos' },
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

// ---------------------------------------------------------------- dice on the live patterns (Unova on)

/** From this dex on, dice follow `liveDicePlan`; earlier generations keep the v1.8 schedule they were seeded with. */
const LIVE_DICE_FROM = 494

const LEGEND_KIND: Record<number, LegendKind> = {
  638: 'trio', 639: 'trio', 640: 'trio', 641: 'trio', 642: 'trio', 645: 'trio',
  643: 'box', 644: 'box', 646: 'box',
  494: 'mythical', 647: 'mythical', 648: 'mythical', 649: 'mythical',
  716: 'box', 717: 'box', 718: 'box',
  719: 'mythical', 720: 'mythical', 721: 'mythical',
  785: 'trio', 786: 'trio', 787: 'trio', 788: 'trio',
  793: 'trio', 794: 'trio', 795: 'trio', 796: 'trio', 797: 'trio', 798: 'trio', 799: 'trio', 804: 'trio', 805: 'trio', 806: 'trio',
  791: 'box', 792: 'box', 800: 'box',
  801: 'mythical', 802: 'mythical', 807: 'mythical', 809: 'mythical',
}

/** Lines that level slowly into a 600-BST final, Gible's shape: Axew's, Deino's, Goomy's and Jangmo-o's. */
const PSEUDO_LINES = new Set([610, 611, 612, 633, 634, 635, 704, 705, 706, 782, 783, 784])

/**
 * Rows `liveDicePlan` reads wrongly, set to what the live game does for their closest relative. The rules go by stage
 * and BST, and a few lines sit outside both: a cocoon that evolves at Lv.9–12 never reaches a Lv.24 replacement, and
 * an Eevee branch arriving by stone levels like its siblings, not like a slow evolver.
 */
const DICE_OVERRIDES: Record<number, Pick<Species, 'dice' | 'rerolls' | 'milestones'>> = {
  // Scatterbug → Spewpa → Vivillon, as Wurmple → Silcoon → Beautifly.
  664: { dice: [{ type: 'bug', count: 1 }], rerolls: 1, milestones: [{ level: 9, effect: 'EVOLVE' }] },
  665: { dice: [{ type: 'bug', count: 2 }], rerolls: 2, milestones: [{ level: 12, effect: 'EVOLVE' }] },
  666: {
    dice: [{ type: 'bug', count: 2 }, { type: 'flying', count: 1 }],
    rerolls: 3,
    milestones: [
      { level: 40, effect: 'ADD_DIE', dieType: 'bug' },
      { level: 40, effect: 'ADD_REROLL', amount: 1 },
    ],
  },
  // Sylveon, as Leafeon and Glaceon: a die of its type at Lv.36 and at Lv.50.
  700: {
    dice: [{ type: 'fairy', count: 2 }, { type: 'base', count: 1 }],
    rerolls: 3,
    milestones: [
      { level: 36, effect: 'ADD_DIE', dieType: 'fairy' },
      { level: 36, effect: 'ADD_REROLL', amount: 1 },
      { level: 50, effect: 'ADD_DIE', dieType: 'fairy' },
      { level: 50, effect: 'ADD_REROLL', amount: 1 },
    ],
  },
}

/** Starters of every region, from the region plans, plus their evolutions. */
function starterLines(species: Species[]): Set<number> {
  const byDex = new Map(species.map((s) => [s.dex, s]))
  const out = new Set<number>()
  const add = (dex: number) => {
    out.add(dex)
    for (const e of byDex.get(dex)?.evolutions ?? []) add(e.toDex)
  }
  for (const r of REGION_PLANS) r.starters.forEach(add)
  return out
}

/** Stage, line length and evolution levels over the merged graph, fed to `liveDicePlan`. */
function liveSchedule(species: Species[], bst: Map<number, number>): (s: Species) => Species {
  const byDex = new Map(species.map((s) => [s.dex, s]))
  const parent = new Map<number, { dex: number; evo: Evolution }>()
  for (const s of species) for (const e of s.evolutions) parent.set(e.toDex, { dex: s.dex, evo: e })
  const stageOf = (dex: number): number => (parent.has(dex) ? 1 + stageOf(parent.get(dex)!.dex) : 1)
  const rootOf = (dex: number): number => (parent.has(dex) ? rootOf(parent.get(dex)!.dex) : dex)
  const depth = (dex: number): number => 1 + Math.max(0, ...(byDex.get(dex)?.evolutions ?? []).map((e) => depth(e.toDex)))
  const starters = starterLines(species)
  return (s) => {
    const levels = s.evolutions.flatMap((e) => (e.level != null ? [e.level] : []))
    const plan = liveDicePlan({
      dex: s.dex,
      type1: s.type1,
      type2: s.type2,
      bst: bst.get(s.dex) ?? 400,
      stage: stageOf(s.dex),
      lineLength: depth(rootOf(s.dex)),
      evolvesAt: levels.length ? Math.min(...levels) : null,
      evolvesByItem: s.evolutions.some((e) => e.item),
      arrivesAt: parent.get(s.dex)?.evo.level ?? null,
      starter: starters.has(s.dex),
      pseudo: PSEUDO_LINES.has(s.dex),
      fossil: FOSSIL_ONLY.has(s.dex),
      legend: LEGEND_KIND[s.dex] ?? null,
    })
    return { ...s, ...plan, ...DICE_OVERRIDES[s.dex] }
  }
}

const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(path.join(DATA_DIR, name), 'utf8')) as T
const writeJson = (name: string, data: unknown) => writeFile(path.join(DATA_DIR, name), JSON.stringify(data, null, 1) + '\n')

// ---------------------------------------------------------------- areas, trainers, regions

interface RegionPlan {
  id: string
  name: string
  orderIndex: number
  dexRange: [number, number]
  starters: number[]
  plans: AreaPlan[]
  spriteRegion: 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola'
  /** Key of the area whose clearing is "the league is done". */
  leagueKey: string
  nextRegion: string | null
  backgrounds: Record<string, BattleBackground>
}

const REGION_PLANS: RegionPlan[] = [
  {
    id: 'johto',
    name: 'Johto',
    orderIndex: 1,
    dexRange: [152, 251],
    starters: JOHTO_STARTERS,
    plans: JOHTO_AREAS,
    spriteRegion: 'johto',
    leagueKey: 'jo-indigo-plateau',
    nextRegion: 'hoenn',
    backgrounds: {
      'Route 29': 'grass',
      'Routes 30 & 31': 'grass',
      'Violet City & Sprout Tower': 'default',
      'Route 32': 'grass',
      'Union Cave': 'rock',
      'Route 33 & Slowpoke Well': 'rock',
      'Azalea Town': 'grass',
      'Ilex Forest': 'grass',
      'Route 34 & the Day Care': 'grass',
      'Goldenrod City': 'default',
      'Routes 35–37': 'grass',
      'National Park': 'grass',
      'Ecruteak City & the Burned Tower': 'default',
      'Routes 38 & 39': 'grass',
      'Olivine City & the Lighthouse': 'sea',
      'Routes 40 & 41': 'sea',
      'Cianwood City': 'sea',
      'Routes 42 & 43 and the Lake of Rage': 'water',
      'Mahogany Town & the Team Rocket HQ': 'default',
      'Route 44 & the Ice Path': 'rock',
      "Blackthorn City & the Dragon's Den": 'rock',
      'Victory Road': 'rock',
      'Indigo Plateau': 'default',
      'Mt. Silver': 'rock',
      'Ruins of Alph': 'rock',
      'Whirl Islands': 'water',
      'Bell Tower': 'default',
      'Ilex Shrine': 'grass',
    },
  },
  {
    id: 'hoenn',
    name: 'Hoenn',
    orderIndex: 2,
    dexRange: [252, 386],
    starters: HOENN_STARTERS,
    plans: HOENN_AREAS,
    spriteRegion: 'hoenn',
    leagueKey: 'ho-ever-grande',
    nextRegion: 'sinnoh',
    backgrounds: {
      'Route 101': 'grass',
      'Routes 102 & 103': 'grass',
      'Petalburg Woods & Route 104': 'grass',
      'Rustboro City': 'default',
      'Route 116 & Rusturf Tunnel': 'rock',
      'Dewford Town & Granite Cave': 'rock',
      'Routes 105–107': 'sea',
      'Slateport City & Route 110': 'sea',
      'Mauville City': 'default',
      'Route 111 Desert & Mirage Tower': 'rock',
      'Route 112, Fiery Path & Mt. Chimney': 'rock',
      'Lavaridge Town': 'rock',
      'Routes 113–115 & Meteor Falls': 'rock',
      'Petalburg City': 'grass',
      'Routes 118 & 119': 'grass',
      'Fortree City & Routes 120–121': 'grass',
      'Safari Zone': 'grass',
      'Mt. Pyre & Routes 122–123': 'default',
      'The Magma & Aqua Hideouts': 'default',
      'Lilycove City, Route 124 & Shoal Cave': 'water',
      'Mossdeep City & the Space Center': 'sea',
      'Routes 125–128 & Seafloor Cavern': 'sea',
      'Sootopolis City & the Cave of Origin': 'water',
      'Victory Road': 'rock',
      'Ever Grande City': 'default',
      'The Battle Frontier': 'grass',
      'The Cave of Origin Depths': 'rock',
      'The Seafloor Cavern Depths': 'water',
      'Sky Pillar': 'default',
      'The Sealed Chambers': 'rock',
      'Southern Island': 'grass',
      'Birth Island': 'grass',
    },
  },
  {
    id: 'sinnoh',
    name: 'Sinnoh',
    orderIndex: 3,
    dexRange: [387, 493],
    starters: SINNOH_STARTERS,
    plans: SINNOH_AREAS,
    spriteRegion: 'sinnoh',
    leagueKey: 'si-pokemon-league',
    nextRegion: 'unova',
    backgrounds: {
      'Route 201 & Lake Verity': 'grass',
      'Route 202 & Jubilife City': 'default',
      'Route 203 & Oreburgh Gate': 'rock',
      'Oreburgh City & the Mine': 'rock',
      'Route 204 & the Ravaged Path': 'grass',
      'Eterna Forest': 'grass',
      'Eterna City & the Galactic Building': 'default',
      'Cycling Road & Routes 206–207': 'grass',
      'Mt. Coronet South': 'rock',
      'Hearthome City': 'default',
      'Route 209 & the Solaceon Ruins': 'rock',
      'Veilstone City & the Galactic HQ': 'default',
      'Route 212 & Pastoria City': 'water',
      'The Great Marsh': 'water',
      'Route 205 & the Valley Windworks': 'grass',
      'Celestic Town & Route 210': 'grass',
      'Canalave City & Iron Island': 'sea',
      'Lake Valor & Lake Acuity': 'water',
      'Routes 216 & 217 and Snowpoint City': 'rock',
      'Mt. Coronet North & Spear Pillar': 'rock',
      'Sunyshore City': 'sea',
      'Victory Road': 'rock',
      'The Pokémon League': 'default',
      'The Fight Area & Routes 225–226': 'rock',
      'The Battle Frontier': 'grass',
      'The Old Chateau': 'default',
      'The Lakes of Sinnoh': 'water',
      'Turnback Cave': 'rock',
      'Stark Mountain': 'rock',
      'Snowpoint Temple': 'rock',
      'Fullmoon Island': 'grass',
      'Newmoon Island': 'default',
      'The Seabreak Path': 'sea',
      'Flower Paradise': 'grass',
      'The Hall of Origin': 'default',
    },
  },
  {
    id: 'unova',
    name: 'Unova',
    orderIndex: 4,
    dexRange: [494, 649],
    starters: UNOVA_STARTERS,
    plans: UNOVA_AREAS,
    spriteRegion: 'unova',
    leagueKey: 'un-pokemon-league',
    nextRegion: 'kalos',
    backgrounds: {
      'Route 1 & Nuvema Town': 'grass',
      'Route 2 & Accumula Town': 'grass',
      'Striaton City & the Dreamyard': 'default',
      'Route 3 & Wellspring Cave': 'grass',
      'Nacrene City & Pinwheel Forest': 'grass',
      'Skyarrow Bridge & Castelia City': 'default',
      'Route 4, the Desert Resort & Relic Castle': 'rock',
      'Nimbasa City & Route 5': 'default',
      'Driftveil City & Route 6': 'grass',
      'Chargestone Cave': 'rock',
      'Mistralton City & Route 7': 'grass',
      'Celestial Tower': 'default',
      'Twist Mountain': 'rock',
      'Icirrus City & the Moor of Icirrus': 'water',
      'Dragonspiral Tower': 'rock',
      'Route 9 & Opelucid City': 'default',
      'Route 10 & Victory Road': 'rock',
      'The Pokémon League': 'default',
      'Victory Road II': 'rock',
      'The Pokémon League II': 'default',
      'Routes 11–14 & Undella Town': 'sea',
      'Black City & White Forest': 'grass',
      'Liberty Garden': 'grass',
      'The Swords of Justice': 'rock',
      'The Abundant Shrine': 'grass',
      'The Giant Chasm': 'rock',
      "Dragonspiral Tower's Summit": 'default',
      'The Moor of Icirrus Spring': 'water',
      'The Castelia Café': 'default',
      'The P2 Laboratory': 'default',
    },
  },
  {
    id: 'kalos',
    name: 'Kalos',
    orderIndex: 5,
    dexRange: [650, 721],
    starters: KALOS_STARTERS,
    plans: KALOS_AREAS,
    spriteRegion: 'kalos',
    leagueKey: 'ka-pokemon-league',
    nextRegion: 'alola',
    backgrounds: {
      'Routes 1 & 2 and Aquacorde Town': 'grass',
      'Santalune Forest': 'grass',
      'Route 3 & Santalune City': 'grass',
      'Routes 4 & 22 and Lumiose City South': 'grass',
      'Route 5 & Camphrier Town': 'grass',
      'Route 6 & Parfum Palace': 'grass',
      'Route 7 & the Connecting Cave': 'grass',
      'Route 8 & Ambrette Town': 'sea',
      'Route 9, the Glittering Cave & Cyllage City': 'rock',
      'Route 10 & Geosenge Town': 'rock',
      'Route 11, Reflection Cave & Shalour City': 'rock',
      'Route 12, Azure Bay & Coumarine City': 'sea',
      'Route 13 & the Kalos Power Plant': 'rock',
      'Lumiose City': 'default',
      'Route 14 & Laverre City': 'water',
      'Routes 15 & 16 and the Lost Hotel': 'default',
      'Dendemille Town, Route 17 & the Frost Cavern': 'rock',
      'Route 18 & Anistar City': 'rock',
      'Lysandre Labs & the Team Flare Secret HQ': 'default',
      'Route 19 & Couriway Town': 'water',
      'Route 20, the Pokémon Village & Snowbelle City': 'grass',
      'Route 21 & Victory Road': 'rock',
      'The Pokémon League': 'default',
      'Victory Road II': 'rock',
      'The Pokémon League II': 'default',
      'Kiloude City & the Battle Maison': 'default',
      'The Friend Safari': 'grass',
      'The Team Flare Secret HQ Depths': 'default',
      'Terminus Cave': 'rock',
      'The Diamond Domain': 'rock',
      "Hoopa's Ring": 'default',
      'The Nebel Plateau': 'rock',
    },
  },
  {
    id: 'alola',
    name: 'Alola',
    orderIndex: 6,
    dexRange: [722, 809],
    starters: ALOLA_STARTERS,
    plans: ALOLA_AREAS,
    spriteRegion: 'alola',
    leagueKey: 'al-pokemon-league',
    nextRegion: null,
    backgrounds: {
      "Route 1 & Hau'oli Outskirts": 'grass',
      "Hau'oli City & the Cemetery": 'default',
      'Route 2 & the Verdant Cavern': 'rock',
      'Route 3 & Melemele Meadow': 'grass',
      "Ten Carat Hill & Kala'e Bay": 'rock',
      'Route 1 South & Iki Town': 'grass',
      'Heahea City & Routes 4–6': 'grass',
      'Brooklet Hill': 'water',
      'Routes 7 & 8 and Wela Volcano Park': 'rock',
      'Lush Jungle': 'grass',
      'Memorial Hill, Akala Outskirts & Konikoni City': 'default',
      'Hano Beach & Aether Paradise': 'sea',
      'Malie City & Malie Garden': 'default',
      'Route 10 & Mount Hokulani': 'rock',
      'Routes 11 & 12 and Blush Mountain': 'rock',
      'Routes 13 & 14, Haina Desert & Tapu Village': 'rock',
      'Routes 15 & 16 and the Thrifty Megamart': 'default',
      'Route 17 & Po Town': 'default',
      'Aether Paradise': 'default',
      'Seafolk Village, Poni Wilds & Ancient Poni Path': 'sea',
      'Exeggutor Island & Vast Poni Canyon': 'rock',
      'Mount Lanakila': 'rock',
      'The Pokémon League': 'default',
      'Mount Lanakila II': 'rock',
      'The Pokémon League II': 'default',
      'Poni Gauntlet & the Battle Tree': 'grass',
      'The Poké Pelago': 'sea',
      'The Lakes of the Sunne and Moone': 'water',
      'The Altar of the Sunne and Moone': 'default',
      'Ultra Megalopolis': 'default',
      'The Ruins of the Guardians': 'rock',
      'Ultra Space: the Deep Sea & the Jungle': 'water',
      'Ultra Space: the Desert & the Plant': 'rock',
      'Ultra Space: the Crater & the Forest': 'rock',
      'Ultra Space: the Ruin': 'rock',
      'Poni Grove': 'grass',
      'The Ultra Recon Squad': 'default',
      "Magearna's Workshop": 'default',
      "Ten Carat Hill's Farthest Hollow": 'rock',
      'The Blush Mountain Storm': 'rock',
      'The Mystery Box': 'default',
    },
  },
]

/**
 * What the region's late-game catch-all area may offer: every species that turns up anywhere else in the region,
 * plus its own generation and its own starters. That is what makes "an area with every Pokémon to catch" true —
 * a region's routes borrow freely from earlier generations, and the Pokédex has to be finishable without them.
 */
function catchAllFor(region: RegionPlan): (dex: number) => boolean {
  const reachable = new Set<number>(region.starters)
  for (let d = region.dexRange[0]; d <= region.dexRange[1]; d++) reachable.add(d)
  for (const plan of region.plans) {
    if (plan.wild === 'ALL') continue
    for (const [dex] of plan.wild) reachable.add(dex)
  }
  // A fossil Pokémon is never wild, anywhere — the fossil is its only source, as it is in Kanto. Their evolutions go
  // too, or the fossil would be pointless for the Pokédex.
  for (const dex of FOSSIL_ONLY) reachable.delete(dex)
  return (dex) => reachable.has(dex)
}

/**
 * Lileep and Anorith come out of the Root and Claw Fossil on Route 111, Cranidos and Shieldon out of the Skull and
 * Armor Fossil in the Oreburgh Mine, Tirtouga and Archen out of the Cover and Plume Fossil in Relic Castle, Tyrunt and
 * Amaura out of the Jaw and Sail Fossil in the Glittering Cave, and their evolutions out of those. None of the eight
 * lines is ever wild.
 */
const FOSSIL_ONLY = new Set([345, 346, 347, 348, 408, 409, 410, 411, 564, 565, 566, 567, 696, 697, 698, 699])

/**
 * The regions this run rebuilds: the ones whose Pokédex sits inside the generated range. Every other region is kept
 * exactly as the bundle has it.
 *
 * This is the difference between adding a region and flattening the others. The content scripts are not the whole
 * truth about Johto or Hoenn — admin tuning lands on Supabase and is pulled back into the bundle — so rebuilding a
 * region the run was not asked to generate silently reverts all of it. With the default range only Sinnoh is built.
 */
const REBUILT = REGION_PLANS.filter((r) => r.dexRange[0] >= FIRST_NEW_DEX && r.dexRange[1] <= DEX_MAX)

function buildRegions(pokemon: Species[], keptAreas: Area[], keptTrainers: Trainer[], itemKeys: Set<string>) {
  const areas: Area[] = [...keptAreas]
  const trainers: Trainer[] = [...keptTrainers]
  const regions: Region[] = []

  for (const region of REBUILT) {
    const built = buildAreasAndTrainers(pokemon, {
      plans: region.plans,
      regionId: region.id,
      starters: region.starters,
      catchAll: catchAllFor(region),
      spriteRegion: region.spriteRegion,
      backgrounds: region.backgrounds,
      itemKeys,
    })
    areas.push(...built.areas)
    trainers.push(...built.trainers)
    const league = built.areas.find((a) => a.name === region.plans.find((p) => p.key === region.leagueKey)?.name)
    if (!league) throw new Error(`${region.id}: league area ${region.leagueKey} not found`)
    regions.push({
      id: region.id,
      name: region.name,
      orderIndex: region.orderIndex,
      dexRange: region.dexRange,
      starters: region.starters,
      starterLevel: 5,
      leagueAreaId: league.id,
      nextRegion: region.nextRegion,
      enabled: true,
    })
  }
  return { areas, trainers, regions }
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true })
  const pokemon = await readJson<Species[]>('pokemon.json')
  const items = await readJson<ItemDef[]>('items.json')

  // Rows outside the range stay exactly as they are — above it too, so re-running an earlier region never drops a later one.
  const inRange = (dex: number) => dex >= FIRST_NEW_DEX && dex <= DEX_MAX
  const kept = pokemon.filter((p) => !inRange(p.dex))
  if (kept.length !== pokemon.length) console.log(`· replacing ${pokemon.length - kept.length} previously generated rows`)

  const { list, bst, intoExisting } = await fetchNewSpecies(kept)

  // The stage graph spans generations (Pichu → Pikachu, Onix → Steelix), so the schedule is computed over the merged
  // list — but only the new rows take the result. Otherwise adding a baby would silently re-plan its Kanto line.
  const { species: grown, grafted } = graftEvolutions([...kept, ...list].sort((a, b) => a.dex - b.dex), intoExisting)
  const scheduled = new Map(applyDiceSchedule(grown, (dex) => bst.get(dex) ?? 400).map((s) => [s.dex, s]))
  const live = liveSchedule(grown, bst)
  const out = grown.map((s) => (!inRange(s.dex) ? s : s.dex >= LIVE_DICE_FROM ? live(s) : scheduled.get(s.dex)!))
  for (const g of grafted) console.log(`  · grafted ${g}`)

  const byKey = new Map(items.map((i) => [i.key, i]))
  for (const it of NEW_ITEMS) if (!byKey.has(it.key)) items.push(it)
  // The Master Ball is a guaranteed catch (d6 + bonus against a catch value of at most 9), and never sellable.
  const master = items.find((i) => i.key === 'master-ball')
  if (master && master.effect.kind === 'ball') master.effect.bonus = 10

  // Areas and trainers: Kanto's rows are kept exactly as they are, the regions' are appended.
  const allAreas = await readJson<Area[]>('areas.json')
  const allTrainers = await readJson<Trainer[]>('trainers.json')
  const rebuiltIds = new Set(REBUILT.map((r) => r.id))
  const keptAreas = allAreas.filter((a) => !rebuiltIds.has(a.regionId ?? 'kanto'))
  const keptTrainerIds = new Set(keptAreas.flatMap((a) => [...a.gyms, ...a.trainerPool.map((t) => t.trainerId)]))
  const keptTrainers = allTrainers.filter((t) => keptTrainerIds.has(t.id))
  const built = buildRegions(out, keptAreas, keptTrainers, new Set(items.map((i) => i.key)))

  const existingRegions = await readJson<Region[]>('regions.json').catch(() => [] as Region[])
  const keptRegions = existingRegions.filter((r) => !rebuiltIds.has(r.id))
  if (!keptRegions.some((r) => r.id === 'kanto')) {
    const kantoLeague = keptAreas.find((a) => a.name === 'Indigo Plateau')
    keptRegions.unshift({
      id: 'kanto',
      name: 'Kanto',
      orderIndex: 0,
      dexRange: [1, 151],
      starters: [1, 4, 7],
      starterLevel: 5,
      leagueAreaId: kantoLeague?.id ?? '',
      nextRegion: null,
      enabled: true,
    })
  }
  const regions: Region[] = [...keptRegions, ...built.regions].sort((a, b) => a.orderIndex - b.orderIndex)
  // `nextRegion` is derived, not tuned: re-link it by order so a newly built region is chained on and the last one
  // ends the game, whichever regions this run happened to rebuild.
  regions.forEach((r, i) => (r.nextRegion = regions[i + 1]?.id ?? null))

  await writeJson('pokemon.json', out)
  await writeJson('items.json', items)
  await writeJson('areas.json', built.areas)
  await writeJson('trainers.json', built.trainers)
  await writeJson('regions.json', regions)

  const added = out.length - kept.length
  const byRegion = regions.map((r) => `${r.name} ${built.areas.filter((a) => (a.regionId ?? 'kanto') === r.id).length}`).join(' · ')
  console.log(`✓ ${out.length} species (${added} added) · ${items.length} items`)
  console.log(`✓ ${built.areas.length} areas (${byRegion}) · ${built.trainers.length} trainers · ${regions.length} regions`)
  console.log('  wrote src/data/{pokemon,items,areas,trainers,regions}.json')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
