// The look other players see: on the leaderboard, on the Versus board and across the field in a Versus fight. It is
// separate from the character (Red or Leaf), which is who throws the Poké Balls and decides the rival. Absent, the
// look is the character. The choice is a fixed list of the Kanto and Johto trainer classes — no Gym Leaders, Elite
// Four, Champions or Team Rocket — so an id from the database only ever turns into one of our own sprite paths.
import type { PlayerCharacter, PlayerProfile } from '@/engine/types'

export interface SocialAvatar {
  /** What the save stores: `red` / `green` for the two characters, `<region>/<sprite>` for a trainer class. */
  id: string
  src: string
  /** The sheet row naming it (a trainer class or name). */
  labelKey: string
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

const BY_ID = new Map(AVATAR_GROUPS.flatMap((g) => g.avatars).map((a) => [a.id, a]))

export const isAvatarId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id)

/** Any id — from a save, from the database, from an old client — to one of ours. Unknown means Red. */
export const avatarOf = (id: string | null | undefined): SocialAvatar =>
  BY_ID.get(id ?? '') ?? BY_ID.get('red')!

/** The id a player shows as: their pick, else their character. */
export const playerAvatarId = (player: Partial<PlayerProfile> | null | undefined): string =>
  isAvatarId(player?.avatar) ? player.avatar : player?.character === 'green' ? 'green' : 'red'
