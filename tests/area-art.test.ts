import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import areas from '@/data/areas.json'
import { ART_PX, battleTop, BATTLE_H, horizonOf, pictureOf, SCENE_H, SCENE_W, stripTop } from '@/fx/areaArt'
import { AREA_ART, ART_GEOMETRY } from '@/fx/areaArtMap'
import { LEAGUE_II } from '@/engine'

const DIR = 'public/area-art'
/** Pictures planned in the Visual Lab and not made yet: their areas keep their drawn scene until they arrive. */
const STILL_TO_MAKE = ['sunne-moone']
const file = (id: string) => path.join(DIR, `${id}.png`)
const size = (id: string) => {
  const png = PNG.sync.read(readFileSync(file(id)))
  return [png.width, png.height]
}

describe('area pictures (public/area-art)', () => {
  it('gives every area a picture, and names no area the game lacks', () => {
    const ids = new Set((areas as { id: string }[]).map((a) => a.id))
    for (const a of areas as { id: string; name: string }[]) expect(AREA_ART[a.id], a.name).toBeTruthy()
    // Victory Road II and League II left the game (the Elite Rebattle replaced them): their lines may stay in the map.
    for (const id of Object.keys(AREA_ART)) if (!(id in LEAGUE_II)) expect(ids.has(id), id).toBe(true)
  })

  it('has every mapped picture in public/area-art, measured, or listed as still to make', () => {
    for (const id of new Set(Object.values(AREA_ART))) {
      if (STILL_TO_MAKE.includes(id)) {
        // Once its file arrives, it needs measuring (and taking off the list).
        expect(existsSync(file(id)), `${id} arrived: measure it`).toBe(false)
        expect(ART_GEOMETRY[id], id).toBeUndefined()
        continue
      }
      expect(existsSync(file(id)), file(id)).toBe(true)
      expect(ART_GEOMETRY[id], id).toBeTruthy()
    }
    for (const id of Object.keys(ART_GEOMETRY)) expect(existsSync(file(id)), file(id)).toBe(true)
  })

  it('keeps every picture at 400 px wide: square scenes, and the 3:2 lab', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.png'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const id = f.replace(/\.png$/, '')
      const [w, h] = size(id)
      expect(w, f).toBe(ART_PX)
      if (id === 'moment-lab') expect(Math.abs(h! / w! - 2 / 3), f).toBeLessThan(0.01)
      else {
        expect(h, f).toBe(ART_PX)
        expect(ART_GEOMETRY[id], `${f} is used by no area`).toBeTruthy()
      }
    }
  })

  it('measures each picture inside its scene: the team on the ground, the strips and the battle in the picture', () => {
    for (const [id, g] of Object.entries(ART_GEOMETRY)) {
      const hz = horizonOf(g)
      expect(hz, id).toBeGreaterThan(40)
      expect(hz, id).toBeLessThan(SCENE_H - 60)
      const [x0, y0, x1, y1] = g.walk
      expect(x0 >= 0 && x1 <= SCENE_W && x0 + 40 < x1, `${id} walk x`).toBe(true)
      expect(y0 > hz && y0 + 20 < y1 && y1 <= SCENE_H, `${id} walk y`).toBe(true)
      if (g.pond) {
        const p = g.pond
        expect(
          p.x - p.rx >= 0 && p.x + p.rx <= SCENE_W && p.y - p.ry > 0 && p.y + p.ry < SCENE_H,
          `${id} pond`,
        ).toBe(true)
      }
      for (const h of [40, 48, 56, 96]) {
        const top = stripTop(hz, h)
        expect(top >= 0 && top + h <= SCENE_H, `${id} strip ${h}`).toBe(true)
      }
      const by = battleTop(g)
      expect(by >= 0 && by + BATTLE_H <= SCENE_H, `${id} battle`).toBe(true)
      // No horizon: the battle takes the bottom of the picture.
      if (g.horizon === null) expect(by, id).toBe(SCENE_H - BATTLE_H)
    }
  })

  it('leaves the areas of a picture still to make on their drawn scene', () => {
    const waiting = (areas as { id: string }[]).filter((a) => STILL_TO_MAKE.includes(AREA_ART[a.id]!))
    expect(waiting.length).toBeGreaterThan(0)
    for (const a of waiting) expect(pictureOf(a.id)).toBeNull()
    expect(pictureOf('no-such-area')).toBeNull()
  })
})
