// A notification's picture, described for the service worker to draw (public/sw.js, docs/25): a 2:1 window of an area
// picture, cut where the land is, with Pokémon standing on it, and a square icon of one Pokémon. Notifications show
// pictures at their own sizes (a 2:1 image under the text, a small square or round icon), so nothing here is a
// stretched area picture: the worker draws them at whole-pixel scales, the way the game draws its pixel art.
import { spriteUrlFor } from '@/components/SpriteImg'
import { ART_CROP, ART_K, ART_PX, artUrl } from '@/fx/areaArt'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { clamp } from '@/fx/pixel'

export interface PushMon {
  src: string
  shiny?: boolean
}

/** What sw.js draws: `bg` a window of a picture (its own pixels), `mons` standing on `ground`, `icon` alone. */
export interface PushArt {
  bg?: { src: string; x?: number; y?: number; w?: number; h?: number }
  mons?: PushMon[]
  /** Where their feet go, 0 (top) to 1 (bottom) of the window. */
  ground?: number
  /** How tall they stand, a share of the window's height. */
  height?: number
  icon?: PushMon
}

export const monArt = (dex: number, shiny = false): PushMon => ({
  src: spriteUrlFor(dex, 'front', shiny),
  ...(shiny && { shiny }),
})

/**
 * A picture's 2:1 window, as wide as the picture, where its Pokémon would stand: a little way into the box the team
 * walks in on Home, with the horizon above. Null for a picture that isn't measured (a path of its own: sw.js then
 * takes the middle of it).
 */
export function pictureWindow(
  key: string,
): { bg: Required<NonNullable<PushArt['bg']>>; ground: number } | null {
  const geo = ART_GEOMETRY[key]
  if (!geo) return null
  const w = ART_PX
  const h = ART_PX / 2
  const [, y0, , y1] = geo.walk
  const foot = ART_CROP + (y0 + (y1 - y0) * 0.4) * ART_K
  const y = Math.round(clamp(foot - h * 0.82, 0, ART_PX - h))
  return { bg: { src: artUrl(key), x: 0, y, w, h }, ground: clamp((foot - y) / h, 0.5, 0.95) }
}

/** The picture of a key that may be an area picture's or a path of its own (an event's banner). */
export function pictureArt(key: string): Pick<PushArt, 'bg' | 'ground'> {
  const win = pictureWindow(key)
  return win ?? { bg: { src: key.includes('/') ? key : artUrl(key) } }
}
