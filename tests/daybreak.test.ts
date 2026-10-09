import { describe, expect, it } from 'vitest'
import { pipLayout } from '@/components/Die'
import { motionLevel } from '@/lib/motion'
import { DAYBREAK_TYPES, PALETTE, THEMES } from '@/theme/colors'
import { FRAME_SLICE, FRAME_SPECS, frameArt, frameSpecs, textureArt } from '@/theme/frames'
import { badgeColors, contrast } from '@/theme/util'

describe('Daybreak frames', () => {
  const N = 2 * FRAME_SLICE + 2

  it('draws every frame on a (2S + 2) grid with its corners cut', () => {
    for (const [name, spec] of Object.entries(FRAME_SPECS)) {
      const art = frameArt(spec)
      expect(art.length, name).toBe(N)
      expect(
        art.every((r) => r.length === N),
        name,
      ).toBe(true)
      // The top-left corner is cut by the profile: transparent, never squared off.
      expect(art[0]![0], name).toBeNull()
      // The top edge, past the corner, is the outline.
      expect(art[0]![FRAME_SLICE], name).toBe(spec.out)
    }
  })

  it('leaves the middle empty, for the element background to fill', () => {
    for (const spec of Object.values(FRAME_SPECS))
      expect(frameArt(spec)[FRAME_SLICE]![FRAME_SLICE]).toBeNull()
  })

  it('casts the shadow under the shape, and drops it when pressed', () => {
    const btn = FRAME_SPECS.btn
    const up = frameArt(btn)
    const down = frameArt(btn, true)
    const shadowRows = (g: (string | null)[][]) =>
      g
        .slice(N - btn.shadow.dy)
        .flat()
        .filter((c) => c === btn.shadow.color).length
    expect(shadowRows(up)).toBeGreaterThan(0)
    expect(shadowRows(down)).toBe(0)
  })

  it('dots the disabled outline', () => {
    const top = frameArt(FRAME_SPECS.off)[0]!.slice(3, N - 3)
    expect(top.some((c) => c === null)).toBe(true)
    expect(top.some((c) => c === FRAME_SPECS.off.out)).toBe(true)
  })

  it('tiles the ground texture from the pale sky and its dots', () => {
    const tex = textureArt().flat()
    expect(new Set(tex)).toEqual(new Set([PALETTE.parchment, '#dde7f3']))
  })
})

describe('Daybreak colours', () => {
  it('gives every type badge text at 4.5:1 or better', () => {
    for (const [type, hex] of Object.entries(DAYBREAK_TYPES)) {
      const { bg, fg } = badgeColors(hex)
      expect(contrast(fg, bg), type).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps text tokens readable on panels and on the ground', () => {
    for (const fg of [PALETTE.ink, PALETTE.muted, PALETTE.danger, PALETTE.good])
      for (const bg of [PALETTE.panel, PALETTE.parchment])
        expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(PALETTE.ink, PALETTE.gold)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(PALETTE.dangerLight, PALETTE.ink)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('dice pips', () => {
  it('sit on whole pixels, the same even size on every pip, for any die size', () => {
    for (let size = 16; size <= 96; size++) {
      const { pip, at } = pipLayout(size)
      expect(pip % 2, `size ${size}`).toBe(0)
      expect(at.every(Number.isInteger), `size ${size}`).toBe(true)
      // Three distinct columns, inside the die.
      expect(at[0]! < at[1]! && at[1]! < at[2]!, `size ${size}`).toBe(true)
      expect(at[2]! + pip, `size ${size}`).toBeLessThanOrEqual(size)
    }
  })
})

describe('animation levels', () => {
  it('is full by default, short on request or with the OS setting, off only with the admin switch', () => {
    expect(motionLevel({ reducedMotion: false }, false)).toBe('full')
    expect(motionLevel({ reducedMotion: false, animations: 'short' }, false)).toBe('short')
    expect(motionLevel({ reducedMotion: false, animations: 'full' }, true)).toBe('short')
    expect(motionLevel({ reducedMotion: true, animations: 'full' }, false)).toBe('off')
    expect(motionLevel({ reducedMotion: true, animations: 'short' }, true)).toBe('off')
  })
})

describe('themes', () => {
  it('keeps light identical to the Daybreak palette', () => {
    expect(THEMES.light.ink).toBe(PALETTE.ink)
    expect(THEMES.light.edge).toBe(PALETTE.ink)
    expect(THEMES.light.panel).toBe(PALETTE.panel)
    expect(THEMES.light.muted).toBe(PALETTE.muted)
  })

  it('gives both themes the same tokens', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort())
  })

  it('keeps text readable at dusk: 4.5:1 for every text colour on every surface, 3:1 for outlines', () => {
    const T = THEMES.dark
    const surfaces = [T.parchment, T.panel, T.paper, T.well, T.sky, T.cream, T.sand, T['gold-pale'], T.rose]
    for (const bg of surfaces) {
      for (const fg of [T.ink, T.muted])
        expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const bg of [T.panel, T.paper]) {
      for (const fg of [T.danger, T.good])
        expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(T.edge, bg)).toBeGreaterThanOrEqual(3)
    }
    // Inverted chips (bg-ink): their panel, gold and red text.
    for (const fg of [T.panel, T['gold-light'], T['danger-light']])
      expect(contrast(fg, T.ink)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(T.good, T['good-pale'])).toBeGreaterThanOrEqual(4.5)
  })

  it('draws the dusk frames with the slate outline and a night ground', () => {
    const dark = frameSpecs('dark')
    expect(dark.panel.out).toBe(THEMES.dark.edge)
    expect(dark.btn.out).toBe(THEMES.dark.edge)
    expect(new Set(textureArt('dark').flat())).toEqual(new Set([THEMES.dark.parchment, THEMES.dark.dot]))
  })
})
