// The look other players see: on the leaderboard, on the Versus board and across the field in a Versus fight. It is
// separate from the character (Red or Leaf), which is who throws the Poké Balls and decides the rival. Absent, the
// look is the character. Two fixed lists, so an id from the database only ever turns into one of our own sprite
// paths: the old free one (the Kanto and Johto trainer classes, while the admin's Trainer looks switch is off) and
// the trainer looks (docs/31), every region's, unlocked by playing (src/engine/looks.ts decides which). Neither has
// a Gym Leader, Elite Four member, Champion or villain team.
import { LOOKS } from '@/engine/looks'
import type { PlayerCharacter, PlayerProfile } from '@/engine/types'

export interface SocialAvatar {
  /** What the save stores: `red` / `green` for the two characters, `<region>/<sprite>` for a trainer class. */
  id: string
  src: string
  /** The sheet row naming it (a trainer class or name). */
  labelKey: string
  /** A second word after the name: ♂ / ♀ where a class has both, or an outfit's sheet row ("Red (Game Boy)"). */
  extra?: string
}

export type AvatarGroup = 'default' | 'kanto' | 'johto'

const character = (c: PlayerCharacter, labelKey: string): SocialAvatar => ({
  id: c,
  src: `/characters/${c}.png`,
  labelKey,
})

/** FireRed / LeafGreen sprites, in the order of the sheet they were cut from. [sprite, trainerClass key] */
const KANTO: [string, string][] = [
  ['youngster', 'youngster'],
  ['bug-catcher', 'bug-catcher'],
  ['lass', 'lass'],
  ['sailor', 'sailor'],
  ['camper', 'camper'],
  ['picnicker', 'picnicker'],
  ['super-nerd', 'super-nerd'],
  ['pokemaniac', 'pokemaniac'],
  ['hiker', 'hiker'],
  ['rocker', 'rocker'],
  ['burglar', 'burglar'],
  ['engineer', 'engineer'],
  ['fisherman', 'fisherman'],
  ['swimmer-m', 'swimmer'],
  ['swimmer-f', 'swimmer'],
  ['biker', 'biker'],
  ['beauty', 'beauty'],
  ['psychic-m', 'psychic'],
  ['psychic-f', 'psychic'],
  ['channeler', 'channeler'],
  ['juggler', 'juggler'],
  ['tamer', 'tamer'],
  ['bird-keeper', 'bird-keeper'],
  ['black-belt', 'black-belt'],
  ['scientist', 'scientist'],
  ['cooltrainer-m', 'cooltrainer'],
  ['cooltrainer-f', 'cooltrainer'],
  ['gentleman', 'gentleman'],
  ['twins', 'twins'],
  ['karateka', 'battle-girl'],
  ['pokemon-breeder', 'pokemon-breeder'],
  ['aroma-lady', 'aroma-lady'],
  ['lady', 'lady'],
  ['ranger-m', 'pokemon-ranger'],
  ['ranger-f', 'pokemon-ranger'],
  ['painter', 'painter'],
  ['ruin-maniac', 'ruin-maniac'],
  ['little-swimmer', 'tuber'],
  ['swimmers', 'swimmers'],
  ['sis-and-bro', 'sis-and-bro'],
  ['cool-couple', 'cool-couple'],
  ['crush-kin', 'crush-kin'],
]

/** HeartGold / SoulSilver sprites. Silver is the rival, not a leader, so he is in. */
const JOHTO: [string, string][] = [
  ['youngster', 'youngster'],
  ['bug-catcher', 'bug-catcher'],
  ['lass', 'lass'],
  ['schoolboy', 'schoolboy'],
  ['schoolgirl', 'school-kid'],
  ['camper', 'camper'],
  ['picnicker', 'picnicker'],
  ['hiker', 'hiker'],
  ['fisherman', 'fisherman'],
  ['swimmer-m', 'swimmer'],
  ['swimmer-f', 'swimmer'],
  ['bird-keeper', 'bird-keeper'],
  ['black-belt', 'black-belt'],
  ['beauty', 'beauty'],
  ['biker', 'biker'],
  ['cyclist', 'cyclist'],
  ['firebreather', 'firebreather'],
  ['guitarist', 'guitarist'],
  ['gentleman', 'gentleman'],
  ['kimono-girl', 'kimono-girl'],
  ['lady', 'lady'],
  ['officer', 'officer'],
  ['pokefan', 'pokefan'],
  ['psychic-m', 'psychic'],
  ['psychic-f', 'psychic'],
  ['sage', 'sage'],
  ['scientist', 'scientist'],
  ['skier', 'skier'],
  ['super-nerd', 'super-nerd'],
  ['twins', 'twins'],
]

export const AVATAR_GROUPS: { group: AvatarGroup; avatars: SocialAvatar[] }[] = [
  {
    group: 'default',
    avatars: [character('red', 'trainerName.red'), character('green', 'trainerName.leaf')],
  },
  {
    group: 'kanto',
    avatars: KANTO.map(([s, cls]) => ({
      id: `kanto/${s}`,
      src: `/trainers/classes/${s}.png`,
      labelKey: `trainerClass.${cls}`,
    })),
  },
  {
    group: 'johto',
    avatars: [
      ...JOHTO.map(([s, cls]) => ({
        id: `johto/${s}`,
        src: `/trainers/classes/johto/${s}.png`,
        labelKey: `trainerClass.${cls}`,
      })),
      { id: 'johto/silver', src: '/trainers/classes/johto/silver.png', labelKey: 'trainerName.silver' },
    ],
  },
]

/** A trainer look's name: its class or character, and a sex or outfit where two would read the same. */
const LOOK_NAMES: Record<string, string | [labelKey: string, extra: string]> = {
  red: 'trainerName.red',
  green: 'trainerName.leaf',
  'kanto/youngster': 'trainerClass.youngster',
  'kanto/bug-catcher': 'trainerClass.bug-catcher',
  'kanto/lass': 'trainerClass.lass',
  'kanto/hiker': 'trainerClass.hiker',
  'kanto/sailor': 'trainerClass.sailor',
  'kanto/camper': 'trainerClass.camper',
  'kanto/picnicker': 'trainerClass.picnicker',
  'kanto/channeler': 'trainerClass.channeler',
  'kanto/biker': 'trainerClass.biker',
  'kanto/scientist': 'trainerClass.scientist',
  'kanto/swimmer-m': ['trainerClass.swimmer', '♂'],
  'kanto/swimmer-f': ['trainerClass.swimmer', '♀'],
  'kanto/burglar': 'trainerClass.burglar',
  'kanto/beauty': 'trainerClass.beauty',
  'kanto/cooltrainer-m': ['trainerClass.cooltrainer', '♂'],
  'kanto/cooltrainer-f': ['trainerClass.cooltrainer', '♀'],
  'kanto/blue': 'trainerName.blue',
  'kanto/chase': 'trainerName.chase',
  'kanto/elaine': 'trainerName.elaine',
  'kanto/red-gen1': ['trainerName.red', 'ui.looks.outfit.gameboy'],
  'johto/youngster': 'trainerClass.youngster',
  'johto/sage': 'trainerClass.sage',
  'johto/guitarist': 'trainerClass.guitarist',
  'johto/bug-catcher': 'trainerClass.bug-catcher',
  'johto/firebreather': 'trainerClass.firebreather',
  'johto/schoolgirl': 'trainerClass.school-kid',
  'johto/black-belt': 'trainerClass.black-belt',
  'johto/pokefan': 'trainerClass.pokefan',
  'johto/kimono-girl': 'trainerClass.kimono-girl',
  'johto/silver': 'trainerName.silver',
  'johto/ethan': 'trainerName.ethan',
  'johto/lyra': 'trainerName.lyra',
  'johto/kris': 'trainerName.kris',
  'hoenn/youngster': 'trainerClass.youngster',
  'hoenn/bug-catcher': 'trainerClass.bug-catcher',
  'hoenn/hiker': 'trainerClass.hiker',
  'hoenn/triathlete': 'trainerClass.triathlete',
  'hoenn/guitarist': 'trainerClass.guitarist',
  'hoenn/kindler': 'trainerClass.kindler',
  'hoenn/collector': 'trainerClass.collector',
  'hoenn/ninja-boy': 'trainerClass.ninja-boy',
  'hoenn/bird-keeper': 'trainerClass.bird-keeper',
  'hoenn/hex-maniac': 'trainerClass.hex-maniac',
  'hoenn/rich-boy': 'trainerClass.rich-boy',
  'hoenn/lady': 'trainerClass.lady',
  'hoenn/battle-girl': 'trainerClass.battle-girl',
  'hoenn/wally': 'trainerName.wally',
  'hoenn/brendan': 'trainerName.brendan',
  'hoenn/may': 'trainerName.may',
  'hoenn/brendan-rs': ['trainerName.brendan', 'ui.looks.outfit.ruby'],
  'hoenn/may-rs': ['trainerName.may', 'ui.looks.outfit.sapphire'],
  'sinnoh/youngster': 'trainerClass.youngster',
  'sinnoh/worker': 'trainerClass.worker',
  'sinnoh/aroma-lady': 'trainerClass.aroma-lady',
  'sinnoh/cyclist-f': 'trainerClass.cyclist',
  'sinnoh/artist': 'trainerClass.artist',
  'sinnoh/school-kid-m': 'trainerClass.school-kid',
  'sinnoh/ruin-maniac': 'trainerClass.ruin-maniac',
  'sinnoh/idol': 'trainerClass.idol',
  'sinnoh/skier-f': 'trainerClass.skier',
  'sinnoh/barry': 'trainerName.barry',
  'sinnoh/lucas': 'trainerName.lucas',
  'sinnoh/dawn': 'trainerName.dawn',
  'sinnoh/rei': 'trainerName.rei',
  'sinnoh/akari': 'trainerName.akari',
  'unova/youngster': 'trainerClass.youngster',
  'unova/waiter': 'trainerClass.waiter',
  'unova/waitress': 'trainerClass.waitress',
  'unova/backpacker-m': ['trainerClass.backpacker', '♂'],
  'unova/school-kid-f': 'trainerClass.school-kid',
  'unova/clerk': 'trainerClass.clerk',
  'unova/backpacker-f': ['trainerClass.backpacker', '♀'],
  'unova/harlequin': 'trainerClass.harlequin',
  'unova/dancer': 'trainerClass.dancer',
  'unova/pilot': 'trainerClass.pilot',
  'unova/psychic-m': 'trainerClass.psychic',
  'unova/nurse': 'trainerClass.nurse',
  'unova/veteran': 'trainerClass.veteran',
  'unova/cheren': 'trainerName.cheren',
  'unova/bianca': 'trainerName.bianca',
  'unova/n': 'trainerName.n',
  'unova/hilbert': 'trainerName.hilbert',
  'unova/hilda': 'trainerName.hilda',
  'unova/nate': 'trainerName.nate',
  'unova/rosa': 'trainerName.rosa',
  'kalos/youngster': 'trainerClass.youngster',
  'kalos/roller-skater-m': 'trainerClass.roller-skater',
  'kalos/butler': 'trainerClass.butler',
  'kalos/maid': 'trainerClass.maid',
  'kalos/furisode-girl-pink': 'trainerClass.furisode-girl',
  'kalos/punk-girl': 'trainerClass.punk-girl',
  'kalos/shauna': 'trainerName.shauna',
  'kalos/calem': 'trainerName.calem',
  'kalos/serena': 'trainerName.serena',
  'kalos/trevor': 'trainerName.trevor',
  'alola/youngster': 'trainerClass.youngster',
  'alola/trial-guide-m': 'trainerClass.trial-guide',
  'alola/lillie': 'trainerName.lillie',
  'alola/firefighter': 'trainerClass.firefighter',
  'alola/golfer': 'trainerClass.golfer',
  'alola/gladion': 'trainerName.gladion',
  'alola/surfer': 'trainerClass.surfer',
  'alola/hau': 'trainerName.hau',
  'alola/elio': 'trainerName.elio',
  'alola/selene': 'trainerName.selene',
  'alola/elio-usum': ['trainerName.elio', 'ui.looks.outfit.ultra'],
  'alola/selene-usum': ['trainerName.selene', 'ui.looks.outfit.ultra'],
  'galar/youngster': 'trainerClass.youngster',
  'galar/backpacker': 'trainerClass.backpacker',
  'galar/worker-f': 'trainerClass.worker',
  'galar/musician': 'trainerClass.musician',
  'galar/bede': 'trainerName.bede',
  'galar/madame': 'trainerClass.madame',
  'galar/marnie': 'trainerName.marnie',
  'galar/reporter': 'trainerClass.reporter',
  'galar/hop': 'trainerName.hop',
  'galar/victor': 'trainerName.victor',
  'galar/gloria': 'trainerName.gloria',
  'galar/victor-dojo': ['trainerName.victor', 'ui.looks.outfit.dojo'],
  'galar/gloria-dojo': ['trainerName.gloria', 'ui.looks.outfit.dojo'],
  'paldea/youngster': 'trainerClass.youngster',
  'paldea/backpacker': 'trainerClass.backpacker',
  'paldea/artist': 'trainerClass.artist',
  'paldea/musician': 'trainerClass.musician',
  'paldea/cook': 'trainerClass.cook',
  'paldea/office-worker-m': ['trainerClass.office-worker', '♂'],
  'paldea/office-worker-f': ['trainerClass.office-worker', '♀'],
  'paldea/nemona': 'trainerName.nemona',
  'paldea/arven': 'trainerName.arven',
  'paldea/penny': 'trainerName.penny',
  'paldea/florian': 'trainerName.florian',
  'paldea/juliana': 'trainerName.juliana',
  'paldea/kieran': 'trainerName.kieran',
  'paldea/carmine': 'trainerName.carmine',
  'paldea/florian-bb': ['trainerName.florian', 'ui.looks.outfit.blueberry'],
  'paldea/juliana-bb': ['trainerName.juliana', 'ui.looks.outfit.blueberry'],
  // Event looks (docs/31 §7): drawn for the game, in their own folder.
  'events/halloween-2026-pokemaniac': 'trainerName.halloween-2026-pokemaniac',
}

/**
 * A look's sprite: Kanto's classes sit at the top of /trainers/classes, every other region's in its own folder, and the
 * event looks in `events/`.
 */
const lookSrc = (id: string): string => {
  if (!id.includes('/')) return `/characters/${id}.png`
  const [region, sprite] = id.split('/') as [string, string]
  return region === 'kanto' ? `/trainers/classes/${sprite}.png` : `/trainers/classes/${region}/${sprite}.png`
}

/** The trainer looks (docs/31), in the menu's order: the engine's list with a sprite and a name each. */
export const TRAINER_LOOKS: SocialAvatar[] = LOOKS.map(({ id }) => {
  const name = LOOK_NAMES[id] ?? 'trainerName.red'
  return {
    id,
    src: lookSrc(id),
    ...(typeof name === 'string' ? { labelKey: name } : { labelKey: name[0], extra: name[1] }),
  }
})

const BY_ID = new Map(
  [...AVATAR_GROUPS.flatMap((g) => g.avatars), ...TRAINER_LOOKS].map((a): [string, SocialAvatar] => [
    a.id,
    a,
  ]),
)

export const isAvatarId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id)

/** Any id — from a save, from the database, from an old client — to one of ours. Unknown means Red. */
export const avatarOf = (id: string | null | undefined): SocialAvatar =>
  BY_ID.get(id ?? '') ?? BY_ID.get('red')!

/** The id a player shows as: their pick, else their character. */
export const playerAvatarId = (player: Partial<PlayerProfile> | null | undefined): string =>
  isAvatarId(player?.avatar) ? player.avatar : player?.character === 'green' ? 'green' : 'red'

/** A look's name in the player's language: "Swimmer ♂", "Red (Game Boy)". */
export function avatarName(
  a: SocialAvatar,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!a.extra) return t(a.labelKey)
  const name = t(a.labelKey)
  return a.extra.startsWith('ui.') ? t('ui.looks.outfit', { name, outfit: t(a.extra) }) : `${name} ${a.extra}`
}
