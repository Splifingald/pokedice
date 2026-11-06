// The battle music (docs/38 §5): the tune's data and the booking of its notes ahead on the audio clock, which are pure;
// and the music's settings, kept on the device and in the save.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BAR,
  compileSong,
  due,
  hz,
  midi,
  MUSIC_VOLUME,
  MUSIC_VOLUMES,
  SONG,
  stepAt,
  stepSeconds,
  volumeStep,
} from '@/audio/music'
import { newSave } from '@/engine'
import { parseSave } from '@/save/schema'
import { readSettings, SETTINGS_KEY } from '@/save/storage'
import { data, newId } from './fixtures'

describe('the tune', () => {
  it('reads note names', () => {
    expect(midi('A4')).toBe(69)
    expect(midi('C4')).toBe(60)
    expect(midi('G#4')).toBe(68)
    expect(midi('A2')).toBe(45)
    expect(hz(69)).toBe(440)
    expect(hz(81)).toBeCloseTo(880)
    expect(() => midi('H4')).toThrow()
  })

  it('fills every bar: the lead adds up to a bar, the drums have a sixteenth each', () => {
    for (const bar of SONG.bars) expect(bar.drums).toHaveLength(BAR)
    // compileSong checks the lead's bars itself.
    expect(() => compileSong()).not.toThrow()
    expect(() =>
      compileSong({ bpm: 150, bars: [{ chord: 'Am', lead: 'A4:4', drums: '-'.repeat(16) }] }),
    ).toThrow(/lasts 4/)
  })

  it("puts every voice on the loop, inside it, in the chip's range", () => {
    const { steps, byStep } = compileSong()
    expect(steps).toBe(SONG.bars.length * BAR)
    expect(byStep).toHaveLength(steps)
    const all = byStep.flat()
    for (const e of all) {
      expect(e.step).toBeGreaterThanOrEqual(0)
      expect(e.step).toBeLessThan(steps)
      expect(e.len).toBeGreaterThan(0)
      if (e.note != null) {
        expect(hz(e.note)).toBeGreaterThan(60)
        expect(hz(e.note)).toBeLessThan(2500)
      }
    }
    // Something sounds on every sixteenth (the arpeggio), and each voice is there.
    expect(byStep.every((s) => s.length > 0)).toBe(true)
    expect(new Set(all.map((e) => e.voice))).toEqual(new Set(['lead', 'arp', 'bass', 'kick', 'snare', 'hat']))
    // The lead never overlaps itself: each note ends where the next one starts, or before.
    const lead = all.filter((e) => e.voice === 'lead').sort((a, b) => a.step - b.step)
    for (let i = 1; i < lead.length; i++)
      expect(lead[i - 1]!.step + lead[i - 1]!.len).toBeLessThanOrEqual(lead[i]!.step)
  })

  it('loops in about half a minute', () => {
    const secs = compileSong().steps * stepSeconds(SONG.bpm)
    expect(secs).toBeGreaterThan(20)
    expect(secs).toBeLessThan(40)
  })
})

describe('booking the notes ahead', () => {
  const step = stepSeconds(150)

  it('books every sixteenth until the look-ahead, and no further', () => {
    const { steps, next } = due({ step: 0, time: 1 }, 1, 1.3, step, 256)
    expect(steps.map((s) => s.step)).toEqual([0, 1, 2])
    ;[1, 1 + step, 1 + 2 * step].forEach((t, i) => expect(steps[i]!.time).toBeCloseTo(t))
    expect(next.step).toBe(3)
    expect(next.time).toBeCloseTo(1 + 3 * step)
    // The next wake-up carries on where this one stopped.
    const again = due(next, 1.1, 1.4, step, 256)
    expect(again.steps[0]).toEqual(next)
  })

  it('wraps round the loop', () => {
    const { steps, next } = due({ step: 254, time: 5 }, 5, 5 + 3.5 * step, step, 256)
    expect(steps.map((s) => s.step)).toEqual([254, 255, 0, 1])
    expect(next.step).toBe(2)
  })

  it('jumps to now rather than cramming in notes a late timer missed', () => {
    const { steps } = due({ step: 10, time: 2 }, 3, 3.25, step, 256)
    expect(steps[0]!.step).toBe(10)
    expect(steps[0]!.time).toBeGreaterThanOrEqual(3)
    expect(steps.length).toBeLessThanOrEqual(Math.ceil(0.25 / step))
  })

  it('books nothing while the clock stands still (audio not unlocked yet)', () => {
    const first = due({ step: 0, time: 0.1 }, 0, 0.3, step, 256)
    const second = due(first.next, 0, 0.3, step, 256)
    expect(second.steps).toEqual([])
  })

  it('knows the sixteenth playing now, for a pause to pick up from', () => {
    // Booked up to step 8 at t = 1 + 8 steps; at t = 1 + 5.5 steps, step 5 is sounding.
    expect(stepAt({ step: 8, time: 1 + 8 * step }, 1 + 5.5 * step, step, 256)).toBe(5)
    expect(stepAt({ step: 1, time: 1 + 3 * step }, 1, step, 256)).toBe(254)
  })
})

describe('the music settings', () => {
  it('turns a stored volume into the nearest of the three steps', () => {
    expect(volumeStep(undefined)).toBe('mid')
    expect(MUSIC_VOLUMES[volumeStep(undefined)]).toBe(MUSIC_VOLUME)
    expect(volumeStep(0)).toBe('low')
    expect(volumeStep(0.4)).toBe('low')
    expect(volumeStep(0.6)).toBe('mid')
    expect(volumeStep(0.9)).toBe('high')
  })
})

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

describe('the game-feel settings on the device and in the save', () => {
  beforeEach(() => {
    ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
  })
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('are unset (on, the default volume) until the player sets them, then kept', () => {
    const fresh = readSettings()
    expect(fresh.haptics).toBeUndefined()
    expect(fresh.music).toBeUndefined()
    expect(fresh.musicVolume).toBeUndefined()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ haptics: false, music: false, musicVolume: 0.35 }))
    expect(readSettings()).toMatchObject({ haptics: false, music: false, musicVolume: 0.35 })
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ musicVolume: 7 }))
    expect(readSettings().musicVolume).toBeUndefined()
  })

  it('travel in the save, which boot reads first', () => {
    const save = newSave(1, data, 0, newId)
    const res = parseSave(
      JSON.parse(
        JSON.stringify({
          ...save,
          settings: { ...save.settings, haptics: false, music: false, musicVolume: 1 },
        }),
      ),
    )
    expect(res.ok && res.save.settings).toMatchObject({ haptics: false, music: false, musicVolume: 1 })
    // A volume this build can't read never costs the save.
    const odd = parseSave(
      JSON.parse(JSON.stringify({ ...save, settings: { ...save.settings, musicVolume: 'loud' } })),
    )
    expect(odd.ok).toBe(true)
  })
})
