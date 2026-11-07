// The outfits' sprites (docs/59): our own drawings in sprites-custom/, at Showdown's paths, served only by our sprite
// copy (docs/45). Their entries have the shape of src/data/showdown-sprites.json's; the boxes are measured from the GIFs
// (design/outfits/README.md), and the icon and cry are the species'.
import { OUTFITS } from '@/engine/outfits'
import { COPY_HOST, type ShowdownEntry } from '@/lib/showdown'
import { spriteSource } from '@/lib/showdownReach'

export const OUTFIT_SPRITES: Record<string, ShowdownEntry> = {
  'pikachu-santa': { id: 'pikachu-santa', v: 'aaaa', i: 25, f: [51, 45], b: [50, 43], c: 'pikachu' },
}

/** Whether this build reads our own sprite copy (only it has our own drawings). */
export const ownSpritesServed = !!COPY_HOST

/** Whether the game reads our copy right now: not when it failed this player and Showdown stands in. */
const copyRead = () => !!COPY_HOST && spriteSource()?.sprites === `${COPY_HOST}/sprites`

/**
 * The sprite entry of a species in an outfit, or null: no such outfit on it, or one of our own drawings while the game
 * reads from Showdown (which doesn't have it: asking would fail, and mark Showdown down for every sprite).
 */
export function outfitSprite(outfit: string | null | undefined, dex: number): ShowdownEntry | null {
  if (!outfit) return null
  const def = OUTFITS[outfit]
  const id = def?.sprites[dex]
  if (!id || (def.own && !copyRead())) return null
  return OUTFIT_SPRITES[id] ?? null
}
