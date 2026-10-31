// The champions' cinematics (docs/54): each League Champion's own entrance, by its picture. Every version of a champion
// (the Elite Rebattle's tiers) shows the same person, so the same scene; a Kanto rival's version shows Red or Green
// (engine/rival `asSeenBy`), and is Kanto's champion all the same.
import type { ChampionCinema } from '../champion'
import { geetaChampion } from './geeta'
import { ghetsisChampion } from './ghetsis'
import { lanceChampion } from './lance'
import { leonChampion } from './leon'
import { palmerChampion } from './palmer'
import { wallaceChampion } from './wallace'

export const CHAMPION_CINEMAS: Readonly<Record<string, ChampionCinema>> = {
  lance: lanceChampion,
  wallace: wallaceChampion,
  palmer: palmerChampion,
  ghetsis: ghetsisChampion,
  leon: leonChampion,
  geeta: geetaChampion,
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
