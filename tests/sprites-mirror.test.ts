// Our own copy of Showdown's files (docs/42-SPRITE-MIRROR.md): it must hold every file the game can ask for, at
// Showdown's own paths, so that pointing VITE_SPRITES_HOST at it changes nothing else.
import { describe, expect, it } from 'vitest'
import showdown from '@/data/showdown-sprites.json'
import { UNOWN_LETTERS } from '@/engine/unownDex'
import {
  ANI_DIRS,
  cryId,
  GEN5_DIRS,
  SHOWDOWN_CRIES,
  SHOWDOWN_HOST,
  SHOWDOWN_SPRITES,
  SHOWDOWN_VIEWS,
  showdownSpriteUrl,
  unownShowdownId,
  type ShowdownEntry,
} from '@/lib/showdown'
import { mirrorFiles } from '../scripts/sprites-mirror'

const entries = Object.values(showdown as unknown as Record<string, ShowdownEntry>)

describe('the sprite copy', () => {
  const paths = new Set(mirrorFiles().map((f) => f.path))
  const pathOf = (url: string) => url.slice(SHOWDOWN_HOST.length + 1)

  it("reads from Showdown when the build doesn't name a copy", () => {
    expect(SHOWDOWN_SPRITES).toBe(`${SHOWDOWN_HOST}/sprites`)
    expect(SHOWDOWN_CRIES).toBe(`${SHOWDOWN_HOST}/audio/cries`)
  })

  it('holds every sprite view, cry and Unown letter the game can ask for', () => {
    for (const e of entries) {
      SHOWDOWN_VIEWS.forEach((view, v) => {
        const kind = e.v[v]
        if (kind === 'a' || kind === 'g')
          expect(paths.has(pathOf(showdownSpriteUrl(e.id, view, kind))), e.id).toBe(true)
      })
      const cry = cryId(e)
      if (cry) expect(paths.has(`audio/cries/${cry}.mp3`), cry).toBe(true)
    }
    for (const l of UNOWN_LETTERS)
      expect(paths.has(`sprites/gen5ani/${unownShowdownId(l)}.gif`), l).toBe(true)
  })

  it('stays under Cloudflare Pages’ 20,000 files a site, with nothing it never asks for', () => {
    expect(paths.size).toBeLessThan(20_000)
    for (const p of paths)
      expect(p).toMatch(
        /^(sprites\/(gen5ani|gen5)(-back)?(-shiny)?\/[\w-]+\.(gif|png)|audio\/cries\/[\w-]+\.mp3)$/,
      )
    // Never the 3D renders (`ani`), only the pixel art.
    expect([...Object.values(ANI_DIRS), ...Object.values(GEN5_DIRS)].every((d) => d.startsWith('gen5'))).toBe(
      true,
    )
  })
})
