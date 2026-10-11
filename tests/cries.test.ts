// Cries come from Showdown, one shared player, and nothing is asked for while sound is off.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A stand-in for the browser's audio element: records what it was asked to play. */
class FakeAudio {
  static made: FakeAudio[] = []
  src = ''
  paused = true
  ended = false
  volume = 1
  preload = ''
  played: string[] = []
  loads = 0
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeAudio.made.push(this)
  }
  play() {
    this.played.push(this.src)
    this.paused = false
    this.ended = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
  load() {
    this.loads++
  }
  finish() {
    this.paused = true
    this.ended = true
    this.onended?.()
  }
  /** The file never loads: like a browser's element, it still says it isn't paused. */
  fail() {
    this.onerror?.()
  }
}

const CRIES = 'https://play.pokemonshowdown.com/audio/cries/'

async function fresh() {
  vi.resetModules()
  FakeAudio.made = []
  return import('@/audio/cries')
}

beforeEach(() => vi.stubGlobal('Audio', FakeAudio))
afterEach(() => vi.unstubAllGlobals())

describe('cryUrl', () => {
  it("is the species' own, a form's own where Showdown has one, else its species'", async () => {
    const { cryUrl, hasOwnCry } = await fresh()
    expect(cryUrl(25)).toBe(`${CRIES}pikachu.mp3`)
    expect(cryUrl(122)).toBe(`${CRIES}mrmime.mp3`)
    // Mega Charizard X has its own; Alolan Vulpix sounds like Vulpix.
    expect(cryUrl(10034)).toBe(`${CRIES}charizard-megax.mp3`)
    expect(hasOwnCry(10034)).toBe(true)
    expect(cryUrl(10103)).toBe(`${CRIES}vulpix.mp3`)
    expect(hasOwnCry(10103)).toBe(false)
    expect(cryUrl(999_999)).toBeNull()
  })
})

describe('playCry', () => {
  it('asks for nothing while sound is off', async () => {
    const { playCry, setCriesEnabled } = await fresh()
    playCry(25)
    setCriesEnabled(false)
    playCry(25)
    expect(FakeAudio.made).toHaveLength(0)
  })

  it('plays through one element, a new cry cutting the last one off', async () => {
    const { playCry, setCriesEnabled } = await fresh()
    setCriesEnabled(true)
    playCry(25)
    playCry(4)
    expect(FakeAudio.made).toHaveLength(1)
    expect(FakeAudio.made[0]!.played).toEqual([`${CRIES}pikachu.mp3`, `${CRIES}charmander.mp3`])
    expect(FakeAudio.made[0]!.preload).toBe('none')
  })

  it('with `wait`, plays after the cry playing now', async () => {
    const { playCry, setCriesEnabled } = await fresh()
    setCriesEnabled(true)
    playCry(25)
    playCry(1, { wait: true })
    const a = FakeAudio.made[0]!
    expect(a.played).toEqual([`${CRIES}pikachu.mp3`])
    a.finish()
    expect(a.played).toEqual([`${CRIES}pikachu.mp3`, `${CRIES}bulbasaur.mp3`])
  })

  it("moves on to the waiting cry when one can't load", async () => {
    const { playCry, setCriesEnabled } = await fresh()
    setCriesEnabled(true)
    playCry(19)
    const a = FakeAudio.made[0]!
    a.fail()
    // Nothing plays now, so yours goes at once…
    playCry(4, { wait: true })
    expect(a.played).toEqual([`${CRIES}rattata.mp3`, `${CRIES}charmander.mp3`])
    // …and a cry waiting behind one that fails plays all the same.
    playCry(19)
    playCry(4, { wait: true })
    a.fail()
    expect(a.played.slice(2)).toEqual([`${CRIES}rattata.mp3`, `${CRIES}charmander.mp3`])
  })

  it('stays silent when the browser refuses to play', async () => {
    const { playCry, setCriesEnabled } = await fresh()
    setCriesEnabled(true)
    vi.spyOn(FakeAudio.prototype, 'play').mockImplementation(() =>
      Promise.reject(new Error('NotAllowedError')),
    )
    expect(() => playCry(25)).not.toThrow()
  })
})
