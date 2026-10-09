// Pokémon on a pixel stage (Home's scene, the battle stage): where a sprite's art sits, standing on a feet line, one
// sprite pixel to one art pixel. The picture is the same Showdown sprite every other screen loads (one cached request,
// docs/13-SHOWDOWN-SPRITES.md); the local sprite when Showdown has no such view.
import {
  SHOWDOWN_SCALE,
  showdownView,
  SPRITE_CANVAS,
  SPRITE_METRICS,
  spriteUrlFor,
} from '@/components/SpriteImg'
import { artBox } from '@/lib/showdown'

/** The tallest or widest a Pokémon may stand on a stage (art pixels); bigger art is shrunk. */
export const MAX_ART = 80

export interface StageSprite {
  url: string
  /** Its fallback when the first can't be loaded (offline): the local sprite. */
  fallback: string | null
  /** The image's own size, drawn at `k` art pixels per image pixel. */
  w: number
  h: number
  k: number
  /** The art inside the image (image pixels): its left edge and width, and how many rows lie under its feet. */
  artX: number
  artW: number
  artH: number
  below: number
}

/** A Pokémon's sprite for a stage: the front (a foe, Home) or the back (yours in battle). */
export function stageSprite(dex: number, back: boolean, shiny: boolean): StageSprite {
  const local = spriteUrlFor(dex, back ? 'back' : 'front', shiny)
  const sd = showdownView(dex, back, shiny)
  if (sd) {
    const [x0, y0, x1, y1] = artBox(sd.box)
    const artW = x1 - x0 + 1
    const artH = y1 - y0 + 1
    const k = Math.min(SHOWDOWN_SCALE, MAX_ART / Math.max(artW, artH))
    return {
      url: sd.url,
      fallback: local,
      w: sd.box[0],
      h: sd.box[1],
      k,
      artX: x0,
      artW,
      artH,
      below: sd.box[1] - 1 - y1,
    }
  }
  const m = SPRITE_METRICS[dex]
  const size = m?.size ?? SPRITE_CANVAS
  const box = (back ? m?.backBox : m?.frontBox) ?? [0, 0, size - 1, size - 1]
  const below = m?.[back ? 'back' : 'front'] ?? 0
  const artW = box[2] - box[0] + 1
  const artH = size - below - box[1]
  return {
    url: local,
    fallback: null,
    w: size,
    h: size,
    k: Math.min(1, MAX_ART / Math.max(artW, artH)),
    artX: box[0],
    artW,
    artH,
    below,
  }
}

/** Where to put the image (art pixels) so its art is centred on x and stands on the line y. */
export function placeSprite(s: StageSprite, x: number, y: number) {
  const w = s.w * s.k
  const h = s.h * s.k
  return { left: x - (s.artX + s.artW / 2) * s.k, top: y - h + s.below * s.k, w, h }
}
