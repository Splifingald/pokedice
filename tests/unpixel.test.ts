import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { unpixel, type Image } from '../scripts/unpixel'
import { fakeAiArt } from './fake-ai-art'

const load = (file: string): Image => {
  const png = PNG.sync.read(readFileSync(file))
  return { width: png.width, height: png.height, data: png.data }
}

/** Share of pixels that came back right: transparent where the sprite is, else within a small colour distance. */
function match(a: Image, b: Image): number {
  let ok = 0
  for (let i = 0; i < a.data.length; i += 4) {
    const ta = a.data[i + 3]! < 128
    const tb = b.data[i + 3]! < 128
    if (ta || tb) ok += ta === tb ? 1 : 0
    else
      ok +=
        Math.hypot(
          a.data[i]! - b.data[i]!,
          a.data[i + 1]! - b.data[i + 1]!,
          a.data[i + 2]! - b.data[i + 2]!,
        ) <= 40
          ? 1
          : 0
  }
  return ok / (a.data.length / 4)
}

describe('unpixel (AI pixel art → true pixel art)', () => {
  it.each([
    ['public/pokemon/118_front.png', 32],
    ['public/pokemon/366_front.png', 24],
    ['public/characters/prof-oak.png', 12.8],
  ])('recovers %s from a fuzzy ×%f upscale', (file, scale) => {
    const src = load(file)
    const { out, cell, cleared } = unpixel(fakeAiArt(src, scale), { merge: 24, bg: 'auto' })
    expect(Math.abs(cell - scale)).toBeLessThan(scale * 0.05)
    expect([out.width, out.height]).toEqual([src.width, src.height])
    expect(cleared).toBe(true)
    expect(match(src, out)).toBeGreaterThan(0.97)
  })

  it('leaves a full scene opaque', () => {
    const src = load('graphics/battlebackgrounds/grass.png')
    const { out, cleared } = unpixel(fakeAiArt(src, 8), { merge: 24, bg: 'auto' })
    expect(cleared).toBe(false)
    expect([out.width, out.height]).toEqual([src.width, src.height])
  })
})
