// The champions' cinematics (docs/56): each League Champion's own entrance, by its picture. Every version of a champion
// (the Elite Rebattle's tiers) shows the same person, so the same scene; a Kanto rival's version shows Red or Green
// (engine/rival `asSeenBy`), and is Kanto's champion all the same.
import type { ChampionCinema } from '../champion'
import { blueChampion } from './blue'
import { cynthiaChampion } from './cynthia'
import { dianthaChampion } from './diantha'
import { geetaChampion } from './geeta'
import { ghetsisChampion } from './ghetsis'
import { kieranChampion } from './kieran'
import { kukuiChampion } from './kukui'
import { lanceChampion } from './lance'
import { leonChampion } from './leon'
import { nemonaChampion } from './nemona'
import { palmerChampion } from './palmer'
import { redChampion } from './red'
import { stevenChampion } from './steven'
import { wallaceChampion } from './wallace'

export const CHAMPION_CINEMAS: Readonly<Record<string, ChampionCinema>> = {
  blue: blueChampion,
  red: redChampion,
  lance: lanceChampion,
  wallace: wallaceChampion,
  steven: stevenChampion,
  cynthia: cynthiaChampion,
  palmer: palmerChampion,
  ghetsis: ghetsisChampion,
  diantha: dianthaChampion,
  kukui: kukuiChampion,
  leon: leonChampion,
  geeta: geetaChampion,
  nemona: nemonaChampion,
  kieran: kieranChampion,
}

/** The scene a trainer's picture calls for: `…/champion-lance.png` → lance, `blue-3.png` → blue, a rival's → blue. */
export function championSceneId(spriteUrl: string | null | undefined): string | null {
  if (!spriteUrl) return null
  if (spriteUrl.startsWith('/characters/')) return 'blue'
  const file = spriteUrl.split('/').pop() ?? ''
  return (
    file
      .replace(/\.[a-z]+$/i, '')
      .replace(/^champion-/, '')
      .replace(/-\d+$/, '') || null
  )
}

/** The champion's own entrance, when its scene is made. */
export function championCinemaFor(spriteUrl: string | null | undefined): ChampionCinema | undefined {
  const id = championSceneId(spriteUrl)
  return id && Object.hasOwn(CHAMPION_CINEMAS, id) ? CHAMPION_CINEMAS[id] : undefined
}
