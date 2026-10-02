import { describe, expect, it } from 'vitest'
import { isNewBuild, pageBuild } from '@/lib/buildId'

const doc = (...srcs: string[]) =>
  ({
    querySelectorAll: () => srcs.map((src) => ({ src, getAttribute: () => src })),
  }) as unknown as Pick<Document, 'querySelectorAll'>

describe('build id', () => {
  it("reads the page's entry script as version.json names it", () => {
    expect(pageBuild(doc('https://pokedice.example/assets/index-AbC_12.js'))).toBe('assets/index-AbC_12.js')
    expect(pageBuild(doc('/assets/vendor-x.js', '/assets/index-Zz9.js?v=1'))).toBe('assets/index-Zz9.js')
  })

  it('has none in dev', () => {
    expect(pageBuild(doc('/src/main.tsx'))).toBeNull()
    expect(pageBuild(doc())).toBeNull()
  })

  it('only a different entry is a new build', () => {
    expect(isNewBuild('assets/index-a.js', 'assets/index-a.js')).toBe(false)
    expect(isNewBuild('assets/index-b.js', 'assets/index-a.js')).toBe(true)
    expect(isNewBuild(undefined, 'assets/index-a.js')).toBe(false)
    expect(isNewBuild('assets/index-b.js', null)).toBe(false)
  })
})
