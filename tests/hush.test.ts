// The game goes quiet while a message's pop-up holds a YouTube video (docs/69, the user's call of 2026-11-08): the
// shared audio context is suspended and nothing new asks for it, no cry plays, and the last hold let go brings the
// sound back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeContext {
  static made: FakeContext[] = []
  state: 'running' | 'suspended' = 'running'
  suspends = 0
  resumes = 0
  constructor() {
    FakeContext.made.push(this)
  }
  suspend() {
    this.suspends++
    this.state = 'suspended'
    return Promise.resolve()
  }
  resume() {
    this.resumes++
    this.state = 'running'
    return Promise.resolve()
  }
}

class FakeAudio {
  static played = 0
  src = ''
  paused = true
  volume = 1
  preload = ''
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play() {
    FakeAudio.played++
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
  load() {}
}

async function fresh() {
  vi.resetModules()
  FakeContext.made = []
  FakeAudio.played = 0
  const sfx = await import('@/audio/sfx')
  const cries = await import('@/audio/cries')
  const hush = await import('@/audio/hush')
  sfx.setSfxEnabled(true)
  cries.setCriesEnabled(true)
  return { ...sfx, ...cries, ...hush }
}

beforeEach(() => {
  vi.stubGlobal('window', { AudioContext: FakeContext, addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('Audio', FakeAudio)
})
afterEach(() => vi.unstubAllGlobals())

describe('hushGame', () => {
  it('suspends the shared context and gives no new sound while held, and picks up again on release', async () => {
    const a = await fresh()
    const ctx = a.audio()!
    expect(ctx).toBeTruthy()
    const release = a.hushGame()
    expect(a.gameHushed()).toBe(true)
    expect((ctx as unknown as FakeContext).state).toBe('suspended')
    expect(a.audio()).toBeNull()
    expect(a.audio(true)).toBeNull()
    a.playCry(25)
    expect(FakeAudio.played).toBe(0)
    release()
    expect(a.gameHushed()).toBe(false)
    expect((ctx as unknown as FakeContext).state).toBe('running')
    expect(a.audio()).toBe(ctx)
    a.playCry(25)
    expect(FakeAudio.played).toBe(1)
  })

  it('stacks: the sound comes back with the last hold, and a release twice counts once', async () => {
    const a = await fresh()
    const ctx = a.audio() as unknown as FakeContext
    const one = a.hushGame()
    const two = a.hushGame()
    one()
    one()
    expect(a.gameHushed()).toBe(true)
    expect(ctx.state).toBe('suspended')
    two()
    expect(a.gameHushed()).toBe(false)
    expect(ctx.state).toBe('running')
    expect(ctx.suspends).toBe(1)
    expect(ctx.resumes).toBe(1)
  })

  it('with no sound made yet, holding and letting go is harmless', async () => {
    const a = await fresh()
    const release = a.hushGame()
    expect(a.audio()).toBeNull()
    release()
    expect(FakeContext.made).toHaveLength(0)
    expect(a.audio()).toBeTruthy()
  })
})
