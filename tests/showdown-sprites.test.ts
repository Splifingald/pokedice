import { existsSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import pokemon from '@/data/pokemon.json'
import showdown from '@/data/showdown-sprites.json'
import atlas from '@/data/trainer-atlas.json'
import trainers from '@/data/trainers.json'
import { AVATAR_GROUPS } from '@/lib/avatars'
import {
  artBox,
  cryId,
  ICON_COLS,
  ICON_H,
  TRAINER_COLS,
  TRAINER_PITCH,
  type ShowdownEntry,
} from '@/lib/showdown'

const entries = showdown as unknown as Record<string, ShowdownEntry>
const cells = (atlas as unknown as { cells: Record<string, [string, number]> }).cells
const sheets = (atlas as unknown as { sheets: Record<string, number> }).sheets

describe('Showdown Pokémon sprites (pnpm showdown-sprites)', () => {
  it('has an entry, with a box for every view it claims, for every species and form', () => {
    for (const p of pokemon as { dex: number }[]) {
      const e = entries[p.dex]
      expect(e, `#${p.dex}`).toBeTruthy()
      expect(e!.v, `#${p.dex}`).toMatch(/^[ag-]{4}$/)
      // Every Pokémon has its front and back on Showdown (animated, or the static set for the few not animated yet);
      // only the newest Megas can miss views, and fall back to the local sprites.
      if (p.dex <= 1025) expect(e!.v, `#${p.dex}`).toMatch(/^[ag]{4}$/)
      if (e!.v[0] !== '-') expect(e!.f, `#${p.dex} front`).toBeTruthy()
      if (e!.v[1] !== '-') expect(e!.b, `#${p.dex} back`).toBeTruthy()
      for (const box of [e!.f, e!.b, e!.fs, e!.bs]) {
        if (!box) continue
        const [x0, y0, x1, y1] = artBox(box)
        expect(x1 >= x0 && y1 >= y0 && x1 < box[0] && y1 < box[1], `#${p.dex} ${box}`).toBe(true)
      }
    }
  })

  it("gives a form without a cry of its own its species' cry, never a file Showdown doesn't have", () => {
    const withOwnCry = new Set(Object.values(entries).flatMap((e) => (e.c === undefined ? [e.id] : [])))
    for (const [dex, e] of Object.entries(entries)) {
      const id = cryId(e)
      if (id === null) continue
      expect(withOwnCry.has(id), `#${dex} ${e.id} → ${id}`).toBe(true)
      if (e.c) expect(e.id.startsWith(`${e.c}-`), `#${dex} ${e.id} → ${e.c}`).toBe(true)
    }
    // Every species (as opposed to a form) has its own.
    for (const p of pokemon as { dex: number }[])
      if (p.dex <= 1025) expect(entries[p.dex]!.c, `#${p.dex}`).toBeUndefined()
  })

  it('points every icon at a cell of the bundled sheet', () => {
    const sheet = PNG.sync.read(readFileSync(path.join('src/assets/pokemon-icons.png')))
    const max = (sheet.height / ICON_H) * ICON_COLS
    for (const p of pokemon as { dex: number }[]) expect(entries[p.dex]!.i, `#${p.dex}`).toBeLessThan(max)
  })
})

describe('trainer sheets (pnpm showdown-sprites trainers)', () => {
  it('holds every sprite the game names', () => {
    const named = new Set<string>([
      '/characters/red.png',
      '/characters/green.png',
      '/characters/prof-oak.png',
    ])
    for (const t of trainers as { spriteUrl: string | null }[]) if (t.spriteUrl) named.add(t.spriteUrl)
    for (const g of AVATAR_GROUPS) for (const a of g.avatars) named.add(a.src)
    for (const url of named) expect(cells[url], url).toBeTruthy()
  })

  it('has a sheet of the right size for every cell', () => {
    for (const [region, rows] of Object.entries(sheets)) {
      const file = path.join('src/assets/trainers', `${region}.png`)
      expect(existsSync(file), file).toBe(true)
      const img = PNG.sync.read(readFileSync(file))
      expect([img.width, img.height]).toEqual([TRAINER_COLS * TRAINER_PITCH, rows * TRAINER_PITCH])
    }
    for (const [url, [region, cell]] of Object.entries(cells))
      expect(cell, url).toBeLessThan(sheets[region]! * TRAINER_COLS)
  })
})
