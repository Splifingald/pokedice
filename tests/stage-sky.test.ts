// The sky over the battle's grid (docs/43 §5.3): the picture's window behind sky and grid must end exactly where the
// battle's own window ends, so its rows meet the grid's picture without a seam, and only grow upward.
import { describe, expect, it } from 'vitest'
import { battleWindow, type ArtGeometry } from '@/fx/areaArt'
import { SKY_H, skyWindow } from '@/screens/battle/skyWindow'

const geo = (horizon: number | null): ArtGeometry => ({ horizon, walk: [24, 168, 264, 266] })

describe('skyWindow', () => {
  it.each([83, 124, 170, null])('grows the battle window upward only (horizon %s)', (h) => {
    const sky = skyWindow(geo(h))
    const grid = battleWindow(geo(h))
    expect(sky.x).toBe(grid.x)
    expect(sky.w).toBe(grid.w)
    expect(sky.y + sky.h).toBe(grid.y + grid.h)
    expect(grid.y - sky.y).toBe(SKY_H)
  })
})
