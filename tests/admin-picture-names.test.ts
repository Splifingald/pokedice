import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BATTLE_SCENE_NAMES, PICTURE_GROUPS } from '@/admin/pictureNames'
import { BATTLE_BACKGROUNDS } from '@/engine'
import { ART_GEOMETRY } from '@/fx/areaArtMap'

describe("the admin's picture names", () => {
  const keys = PICTURE_GROUPS.flatMap((g) => Object.keys(g.names))

  it('names every battle scene', () => {
    for (const b of BATTLE_BACKGROUNDS) expect(BATTLE_SCENE_NAMES[b], b).toBeTruthy()
  })

  it('names every pickable area picture, once', () => {
    for (const id of Object.keys(ART_GEOMETRY))
      expect(keys, `${id} needs a name in src/admin/pictureNames.ts`).toContain(id)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('names only pictures that exist', () => {
    for (const k of keys)
      expect(existsSync(k.includes('/') ? `public${k}` : `public/area-art/${k}.png`), k).toBe(true)
  })
})
