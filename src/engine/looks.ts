// Trainer looks (docs/31): the look other trainers see on the leaderboard, in Versus and on a friend's card. Red and
// Leaf are free; every other look belongs to a region and unlocks from that region's own progress: Pokémon caught in
// its Pokédex, an area reached, its League beaten, its Pokédex complete. Unlocks are worked out from progress every
// time, so nothing but the looks already seen is stored, and the looks granted outright (an event's, `looks.earned`).
// An event's look is won there and kept for good (docs/31 §7). The admin's switch (docs/15 §20) is Off by default; while
// it's off, the old free list of Kanto and Johto classes stays (src/lib/avatars.ts).
import { eventOpenTo } from './events'
import { getRegion, leagueDone, regionOf, regionSpecies, switchRegion } from './regions'
import { isAreaUnlocked } from './run'
import { linearAreas } from './data'
import type { GameData, RegionId, SaveData } from './types'

export type LookUnlock =
  | { kind: 'start' }
  /** This many of the region's Pokédex caught (the count the trainer card and the Pokédex page show). */
  | { kind: 'catch'; count: number }
  /** This area open, in the region's chain or a secret one. */
  | { kind: 'reach'; areaId: string }
  /** The region's League beaten. */
  | { kind: 'champion' }
  /** Every Pokémon of the region's Pokédex page caught. */
  | { kind: 'complete' }
  /**
   * An event's prize (docs/31 §7): one of these raids won there (`events.raidsDone`, which outlives the world it was
   * won in), or the look granted in the save (`looks.earned`: the SQL that gave it to those holding the prize).
   */
  | { kind: 'event'; event: string; raids: string[] }

export interface LookDef {
  /** `red` / `green`, `<region>/<sprite>` (the region is the id's prefix), or `events/<sprite>`, in no region. */
  id: string
  region: RegionId | null
  unlock: LookUnlock
}

const caught = (count: number): LookUnlock => ({ kind: 'catch', count })
const reach = (areaId: string): LookUnlock => ({ kind: 'reach', areaId })
const CHAMPION: LookUnlock = { kind: 'champion' }
const COMPLETE: LookUnlock = { kind: 'complete' }

/**
 * Every look, in the order the menu shows them. Each region climbs the same ladder: its Youngster at 10 caught,
 * classes where they belong (a Channeler at Pokémon Tower), the rival at Victory Road, the generation's two heroes
 * for the League, an older outfit for the full Pokédex. No Gym Leader, Elite Four, Champion or villain team.
 */
const ROWS: [string, LookUnlock][] = [
  ['red', { kind: 'start' }],
  ['green', { kind: 'start' }],
  // Kanto
  ['kanto/youngster', caught(10)],
  ['kanto/bug-catcher', reach('41f856c1-6df1-53e1-96b5-463362d595a6')], // Viridian Forest
  ['kanto/lass', caught(20)],
  ['kanto/hiker', reach('665e8d04-8cda-5960-9a8a-0e843c5a095e')], // Mt. Moon
  ['kanto/sailor', reach('bec52d1b-4c7c-5503-810a-5d4b8e5336ec')], // Routes 5 & 6
  ['kanto/camper', caught(35)],
  ['kanto/picnicker', caught(35)],
  ['kanto/channeler', reach('1e08b1b8-cda6-5046-a40f-5041361f6736')], // Pokémon Tower
  ['kanto/biker', reach('e7d8c094-5b1f-51d5-b205-3951e8be98ab')], // Cycling Road
  ['kanto/scientist', reach('0451cbfb-2955-5b42-a816-3e6affb72c35')], // Silph Co.
  ['kanto/swimmer-m', reach('6be7fc24-0db6-59e6-b9f0-81cbefc90ab4')], // Sea Routes 19 & 20
  ['kanto/swimmer-f', reach('6be7fc24-0db6-59e6-b9f0-81cbefc90ab4')], // Sea Routes 19 & 20
  ['kanto/burglar', reach('cff05c73-329a-55d0-a476-ba7c5683e6ae')], // Pokémon Mansion
  ['kanto/beauty', caught(75)],
  ['kanto/cooltrainer-m', caught(100)],
  ['kanto/cooltrainer-f', caught(100)],
  ['kanto/blue', reach('6ce5603a-9b36-52df-b8bc-3e9efb0686c3')], // Victory Road
  ['kanto/chase', CHAMPION],
  ['kanto/elaine', CHAMPION],
  ['kanto/red-gen1', COMPLETE],
  // Johto
  ['johto/youngster', caught(10)],
  ['johto/sage', reach('557feec9-d7ee-5e34-91fd-8eaa4e805e85')], // Violet City & Sprout Tower
  ['johto/guitarist', reach('058038e0-b19e-5156-9e27-c57aa3b653fc')], // Goldenrod City
  ['johto/bug-catcher', reach('3aa36df1-1d3e-533b-8f85-32ca0b970b16')], // National Park
  ['johto/firebreather', reach('2d2bfbee-476c-56e7-b814-4d73b9c1425c')], // Ecruteak City & the Burned Tower
  ['johto/schoolgirl', caught(25)],
  ['johto/black-belt', reach('28f66e14-e4f6-59ca-96fe-c196fc53fe9e')], // Cianwood City
  ['johto/pokefan', caught(45)],
  ['johto/kimono-girl', caught(70)],
  ['johto/silver', reach('28453b26-704e-599c-b5ab-7763047b0cf7')], // Victory Road
  ['johto/ethan', CHAMPION],
  ['johto/lyra', CHAMPION],
  ['johto/kris', COMPLETE],
  // Hoenn
  ['hoenn/youngster', caught(10)],
  ['hoenn/bug-catcher', reach('46ffd645-c925-5620-baaf-674f78b67fe6')], // Petalburg Woods & Route 104
  ['hoenn/hiker', reach('87839b2d-8083-5d78-b526-40049ff2e2c2')], // Dewford Town & Granite Cave
  ['hoenn/triathlete', reach('18c36b75-2a63-5861-803e-176c1afd1f05')], // Slateport City & Route 110
  ['hoenn/guitarist', reach('f4125979-a6a1-5086-9a5a-5314568b77a9')], // Mauville City
  ['hoenn/kindler', reach('35ba43d5-ed6e-5add-a1ce-4f1d20e34cf4')], // Route 112, Fiery Path & Mt. Chimney
  ['hoenn/collector', caught(30)],
  ['hoenn/ninja-boy', reach('aa7c054d-8c55-5640-b3d5-2731ca24a00c')], // Routes 113–115 & Meteor Falls
  ['hoenn/bird-keeper', reach('e34791dd-2b08-51ef-9c9f-be18cea0524b')], // Fortree City & Routes 120–121
  ['hoenn/hex-maniac', reach('88858f3b-8429-567d-90ea-fd319448d274')], // Mt. Pyre & Routes 122–123
  ['hoenn/rich-boy', caught(60)],
  ['hoenn/lady', caught(60)],
  ['hoenn/battle-girl', caught(90)],
  ['hoenn/wally', reach('c3397515-cd10-59d4-b70a-949ef766c59d')], // Victory Road
  ['hoenn/brendan', CHAMPION],
  ['hoenn/may', CHAMPION],
  ['hoenn/brendan-rs', COMPLETE],
  ['hoenn/may-rs', COMPLETE],
  // Sinnoh
  ['sinnoh/youngster', caught(10)],
  ['sinnoh/worker', reach('cf8b7fa9-6488-5afe-956e-8c5dfcb4c7d4')], // Oreburgh City & the Mine
  ['sinnoh/aroma-lady', reach('0c90a15f-5054-5e52-ba55-e310e78d4a49')], // Eterna Forest
  ['sinnoh/cyclist-f', reach('eb01f9bc-a3e2-5fdb-ade9-343b5c0c04b9')], // Cycling Road & Routes 206–207
  ['sinnoh/artist', reach('b98a27bb-00b4-5fbc-9ef2-63d1f22b024e')], // Hearthome City
  ['sinnoh/school-kid-m', caught(25)],
  ['sinnoh/ruin-maniac', reach('6c54a30a-d5cc-5311-ae07-d9b0dfac5db2')], // Route 209 & the Solaceon Ruins
  ['sinnoh/idol', caught(50)],
  ['sinnoh/skier-f', reach('bbdca5af-2024-5c0c-8278-c7c5966a5be4')], // Routes 216 & 217 and Snowpoint City
  ['sinnoh/barry', reach('463df9e2-3191-591e-889c-f3a8c82e6c0a')], // Victory Road
  ['sinnoh/lucas', CHAMPION],
  ['sinnoh/dawn', CHAMPION],
  ['sinnoh/rei', COMPLETE],
  ['sinnoh/akari', COMPLETE],
  // Unova
  ['unova/youngster', caught(10)],
  ['unova/waiter', reach('3f289f62-39f8-523b-aa25-5b6614b247aa')], // Striaton City & the Dreamyard
  ['unova/waitress', reach('3f289f62-39f8-523b-aa25-5b6614b247aa')], // Striaton City & the Dreamyard
  ['unova/backpacker-m', reach('02d13ccb-081f-5e58-9fff-ec6dc0947235')], // Route 3 & Wellspring Cave
  ['unova/school-kid-f', caught(25)],
  ['unova/clerk', reach('ffe54f64-88c9-5ead-aa12-389b4742ce69')], // Skyarrow Bridge & Castelia City
  ['unova/backpacker-f', reach('54da008e-5400-5829-8024-4b6589e0e959')], // Route 4, the Desert Resort & Relic Castle
  ['unova/harlequin', reach('5ffc3386-33f5-58fd-b471-f27ebfa6cbcb')], // Nimbasa City & Route 5
  ['unova/dancer', caught(45)],
  ['unova/pilot', reach('a703817b-8a2f-5bdb-8e08-898f6db6e1b5')], // Mistralton City & Route 7
  ['unova/psychic-m', reach('c442130a-bc84-533f-88c9-05d2bfd35e1c')], // Celestial Tower
  ['unova/nurse', caught(70)],
  ['unova/veteran', caught(100)],
  ['unova/cheren', reach('9c6c6d9c-030c-55ba-9294-e9125e8ef539')], // Route 10 & Victory Road
  ['unova/bianca', reach('9c6c6d9c-030c-55ba-9294-e9125e8ef539')], // Route 10 & Victory Road
  ['unova/n', caught(125)],
  ['unova/hilbert', CHAMPION],
  ['unova/hilda', CHAMPION],
  ['unova/nate', COMPLETE],
  ['unova/rosa', COMPLETE],
  // Kalos
  ['kalos/youngster', caught(10)],
  ['kalos/roller-skater-m', reach('45a1953c-7b1e-5408-9205-00d75f9dc980')], // Route 5 & Camphrier Town
  ['kalos/butler', reach('bdfbef78-d8fc-5fca-a7c6-1d1a60ab2653')], // Route 6 & Parfum Palace
  ['kalos/maid', reach('bdfbef78-d8fc-5fca-a7c6-1d1a60ab2653')], // Route 6 & Parfum Palace
  ['kalos/furisode-girl-pink', caught(35)],
  ['kalos/punk-girl', reach('05803fd7-2ba3-5891-81b7-368dc894de79')], // Routes 15 & 16 and the Lost Hotel
  ['kalos/shauna', reach('cebf8471-cd94-534a-a781-98297581743e')], // Route 21 & Victory Road
  ['kalos/calem', CHAMPION],
  ['kalos/serena', CHAMPION],
  ['kalos/trevor', COMPLETE],
  // Alola
  ['alola/youngster', caught(10)],
  ['alola/trial-guide-m', reach('d7bfc7c0-ab59-5608-88c7-5d395cdbe217')], // Route 2 & the Verdant Cavern
  ['alola/lillie', caught(30)],
  ['alola/firefighter', reach('38846271-6caa-52ab-b474-600c585b98f2')], // Routes 7 & 8 and Wela Volcano Park
  ['alola/golfer', reach('7d3ee2f7-3442-5738-b2c6-d3037e514fec')], // Malie City & Malie Garden
  ['alola/gladion', reach('a13dcc18-e146-5423-b54d-c0a5869ddad2')], // Aether Paradise
  ['alola/surfer', reach('b629fa00-cb91-5390-9500-2240f2dc5ceb')], // Seafolk Village, Poni Wilds & Ancient Poni Path
  ['alola/hau', reach('db4e5701-dfdf-54dd-bfee-002c1fdcc391')], // Mount Lanakila
  ['alola/elio', CHAMPION],
  ['alola/selene', CHAMPION],
  ['alola/elio-usum', COMPLETE],
  ['alola/selene-usum', COMPLETE],
  // Galar
  ['galar/youngster', caught(10)],
  ['galar/backpacker', reach('98ab6c0a-a752-5157-8ce5-94208fcbbfdf')], // The Wild Area: Rolling Fields & Dappled Grove
  ['galar/worker-f', reach('832605a6-8fd7-5d03-9507-1f3da93819d2')], // Motostoke, Route 3 & the Galar Mine
  ['galar/musician', caught(30)],
  ['galar/bede', reach('716b4c9b-cb31-5a1e-97a1-d8c3be45b074')], // Glimwood Tangle & Ballonlea
  ['galar/madame', caught(55)],
  ['galar/marnie', reach('cab2b223-9f4a-59bb-bc3d-b4ff4a58cf07')], // Route 9 & Spikemuth
  ['galar/reporter', caught(75)],
  ['galar/hop', reach('e8a36a96-5c86-5e7d-a5f5-0c845ab2dbe8')], // Route 10 & Wyndon
  ['galar/victor', CHAMPION],
  ['galar/gloria', CHAMPION],
  ['galar/victor-dojo', COMPLETE],
  ['galar/gloria-dojo', COMPLETE],
  // Paldea
  ['paldea/youngster', caught(10)],
  ['paldea/backpacker', reach('c3e62acf-0be6-50e4-9276-deee4b898a92')], // Los Platos & South Province (Area One)
  ['paldea/artist', reach('5ac63cdb-d119-59e2-a364-509db7798bc2')], // South Province (Area Six) & Artazon
  ['paldea/musician', caught(30)],
  ['paldea/cook', reach('806671c7-1a49-543d-bea9-38f1c6cf3b60')], // The Asado Desert & Cascarrafa
  ['paldea/office-worker-m', reach('d8f76401-f8d1-576d-8219-9c19b5de5053')], // West Province (Area Two) & Medali
  ['paldea/office-worker-f', reach('d8f76401-f8d1-576d-8219-9c19b5de5053')], // West Province (Area Two) & Medali
  ['paldea/nemona', caught(60)],
  ['paldea/arven', reach('c9bca81d-c26f-5579-9b74-9123bea95976')], // The Way Home
  ['paldea/penny', reach('c9bca81d-c26f-5579-9b74-9123bea95976')], // The Way Home
  ['paldea/florian', CHAMPION],
  ['paldea/juliana', CHAMPION],
  ['paldea/kieran', reach('cd6e3688-d7e8-509f-a438-abf66eea0692')], // The Land of Kitakami
  ['paldea/carmine', reach('cd6e3688-d7e8-509f-a438-abf66eea0692')], // The Land of Kitakami
  ['paldea/florian-bb', COMPLETE],
  ['paldea/juliana-bb', COMPLETE],
  // Events (docs/31 §7): Haunted Hollow, Halloween 2026. Its shiny Giratina caught in the Distortion World's raid.
  [
    'events/halloween-2026-pokemaniac',
    { kind: 'event', event: 'halloween-2026', raids: ['cfff57e0-5175-545c-9e68-a2e2e64d7d45:487'] },
  ],
]

export const LOOKS: LookDef[] = ROWS.map(([id, unlock]) => ({
  id,
  region: id.includes('/') && !id.startsWith('events/') ? id.slice(0, id.indexOf('/')) : null,
  unlock,
}))

const BY_ID = new Map(LOOKS.map((l) => [l.id, l]))

export const lookDef = (id: string | null | undefined): LookDef | undefined => BY_ID.get(id ?? '')

/** The admin's switch: on for everyone, or for the admin only. */
export const looksOn = (data: GameData): boolean => eventOpenTo(data.config.looks?.access, data)

export interface LookState {
  def: LookDef
  open: boolean
  /** Its region has been started (always, for Red and Leaf). An unstarted region's looks stay a surprise. */
  started: boolean
  /** A catch or Pokédex goal: caught so far, and how many it takes. */
  have?: number
  need?: number
  /** A reach goal in the region's chain: areas still to open before it (secret areas have none). */
  areasAway?: number
}

/** The save as if this region were the one being played (its parked block lifted out), or null if never started. */
function regionView(save: SaveData, region: RegionId): SaveData | null {
  if (regionOf(save) === region) return save
  return save.parked?.[region] ? switchRegion(save, region) : null
}

function statesOf(save: SaveData, data: GameData): LookState[] {
  const views = new Map<
    RegionId,
    { save: SaveData; dex: Set<number>; have: number; furthest: number } | null
  >()
  const viewOf = (region: RegionId) => {
    if (!views.has(region)) {
      const view = getRegion(data, region) ? regionView(save, region) : null
      if (!view) views.set(region, null)
      else {
        const dex = regionSpecies(data, region)
        const chain = linearAreas(data, region)
        let furthest = -1
        chain.forEach((a, i) => {
          if (isAreaUnlocked(view, a.id, data)) furthest = i
        })
        views.set(region, { save: view, dex, have: view.pokedex.filter((d) => dex.has(d)).length, furthest })
      }
    }
    return views.get(region)!
  }
  const states = LOOKS.map((def): LookState => {
    const u = def.unlock
    if (u.kind === 'event') {
      const open =
        !!save.looks?.earned?.includes(def.id) || u.raids.some((k) => !!save.events?.raidsDone?.includes(k))
      return { def, open, started: true }
    }
    if (u.kind === 'start' || !def.region) return { def, open: true, started: true }
    const v = viewOf(def.region)
    if (!v) return { def, open: false, started: false }
    switch (u.kind) {
      case 'catch':
        return { def, open: v.have >= u.count, started: true, have: v.have, need: u.count }
      case 'complete':
        return {
          def,
          open: v.dex.size > 0 && v.have >= v.dex.size,
          started: true,
          have: v.have,
          need: v.dex.size,
        }
      case 'champion':
        return { def, open: leagueDone(save, data, def.region), started: true }
      case 'reach': {
        if (isAreaUnlocked(v.save, u.areaId, data)) return { def, open: true, started: true }
        const at = linearAreas(data, def.region).findIndex((a) => a.id === u.areaId)
        return {
          def,
          open: false,
          started: true,
          areasAway: at >= 0 ? Math.max(1, at - v.furthest) : undefined,
        }
      }
    }
  })
  // An event's look is listed once won: after the event, nobody can work towards it any more.
  return states.filter((s) => s.def.unlock.kind !== 'event' || s.open)
}

// The top bar reads these on every render: worked out once per save and content.
const memo = new WeakMap<SaveData, { data: GameData; states: LookState[] }>()

/**
 * Every look and where it stands. `progress` is the save whose progress counts: the main save, also while the
 * Extreme save is played (looks are earned in the main game and worn in both).
 */
export function lookStates(progress: SaveData, data: GameData): LookState[] {
  const hit = memo.get(progress)
  if (hit && hit.data === data) return hit.states
  const states = statesOf(progress, data)
  memo.set(progress, { data, states })
  return states
}

export function unlockedLooks(progress: SaveData, data: GameData): Set<string> {
  return new Set(
    lookStates(progress, data)
      .filter((s) => s.open)
      .map((s) => s.def.id),
  )
}

/** Unlocked looks the player hasn't seen in the menu yet (Red and Leaf never count): the red dot. */
export function newLooks(save: SaveData, progress: SaveData, data: GameData): string[] {
  if (!looksOn(data)) return []
  const seen = new Set(save.looks?.seen ?? [])
  return lookStates(progress, data)
    .filter((s) => s.open && s.def.unlock.kind !== 'start' && !seen.has(s.def.id))
    .map((s) => s.def.id)
}

/** The menu was looked at: every look unlocked so far is seen. */
export function markLooksSeen(save: SaveData, progress: SaveData, data: GameData): SaveData | null {
  const fresh = newLooks(save, progress, data)
  if (!fresh.length) return null
  return { ...save, looks: { ...save.looks, seen: [...(save.looks?.seen ?? []), ...fresh] } }
}

export const looksRulesSeen = (save: SaveData): boolean => !!save.looks?.rulesSeen

export function markLooksRulesSeen(save: SaveData): SaveData | null {
  return save.looks?.rulesSeen ? null : { ...save, looks: { ...save.looks, rulesSeen: true } }
}

/**
 * Two copies of one player's save, one replacing the other (the cloud sync, another tab): a look granted to either
 * (`looks.earned`, written into the cloud copy by SQL) stays granted. The same save back when there's nothing to add.
 */
export function keepLooksEarned(save: SaveData, other: SaveData | null | undefined): SaveData {
  const mine = save.looks?.earned ?? []
  const add = (other?.looks?.earned ?? []).filter((id) => !mine.includes(id))
  if (!add.length) return save
  return { ...save, looks: { ...save.looks, earned: [...mine, ...add] } }
}

/** Wear a look: only one that is unlocked (Red or Leaf always). */
export function wearLook(save: SaveData, progress: SaveData, data: GameData, id: string): SaveData | null {
  if (!save.player || !unlockedLooks(progress, data).has(id)) return null
  return { ...save, player: { ...save.player, avatar: id } }
}

/**
 * While the switch is on, a look that isn't unlocked comes off: the player is back to their character (Red or Leaf).
 * That covers the old free list's picks (the user's call, 2026-10-17), and an id from a hand-edited save.
 */
export function settleLook(save: SaveData, progress: SaveData, data: GameData): SaveData {
  const avatar = save.player?.avatar
  if (!avatar || !looksOn(data) || unlockedLooks(progress, data).has(avatar)) return save
  const { avatar: _drop, ...player } = save.player!
  return { ...save, player }
}
