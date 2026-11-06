// Our own copy of Showdown's files (docs/45-SPRITE-MIRROR.md): it must hold every file the game can ask for, at
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
import { existsSync } from 'node:fs'
import { OUTFITS } from '@/engine/outfits'
import { OUTFIT_SPRITES, outfitSprite } from '@/lib/outfitSprites'
import { customFiles, mirrorFiles } from '../scripts/sprites-mirror'

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

  it('holds our own sprites, every view of each, read from disk rather than Showdown', () => {
    const own = customFiles()
    expect(own.map((f) => f.path)).toContain('sprites/gen5ani/pikachu-santa.gif')
    const ids = new Set(
      own.map((f) =>
        f.path
          .split('/')
          .pop()!
          .replace(/\.\w+$/, ''),
      ),
    )
    for (const id of ids) {
      // The game asks for all four views of a sprite: a missing one would cost a failed request.
      for (const view of SHOWDOWN_VIEWS)
        expect(paths.has(pathOf(showdownSpriteUrl(id, view, 'a'))), `${id} ${view}`).toBe(true)
    }
    for (const f of own) {
      expect(paths.has(f.path), f.path).toBe(true)
      expect(existsSync(f.cache), f.cache).toBe(true)
    }
  })

  it('has every outfit sprite the game can ask for (docs/59), with its measures; never asked of Showdown itself', () => {
    for (const [key, o] of Object.entries(OUTFITS))
      for (const [dex, id] of Object.entries(o.sprites)) {
        const e = OUTFIT_SPRITES[id]
        expect(e, `${key} on ${dex}`).toBeDefined()
        expect(e!.id).toBe(id)
        SHOWDOWN_VIEWS.forEach((view, v) => {
          if (e!.v[v] === 'a' || e!.v[v] === 'g')
            expect(
              paths.has(pathOf(showdownSpriteUrl(id, view, e!.v[v] as 'a' | 'g'))),
              `${id} ${view}`,
            ).toBe(true)
        })
        // These tests build without VITE_SPRITES_HOST: the game reads Showdown, which has none of our own drawings.
        if (o.own) expect(outfitSprite(key, Number(dex))).toBeNull()
      }
  })
})
