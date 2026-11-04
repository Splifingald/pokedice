// Full screen (docs/66): the admin's switch, and whether this device wants it — the player's choice, else on in a
// phone's installed app only.
import { describe, expect, it } from 'vitest'
import { compileGameData, fullScreenOn, type GameData } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { leftByChoice, wantsFullScreen } from '@/lib/screenFill'

const base = compileGameData(BUNDLE)
const withAccess = (access: 'off' | 'admin' | 'all'): GameData => ({
  ...base,
  config: { ...base.config, fullScreen: { access } },
})

describe('full screen', () => {
  it('is off by default, for the admin only on admin, for everyone on all', () => {
    expect(fullScreenOn(base)).toBe(false)
    expect(fullScreenOn(withAccess('admin'))).toBe(false)
    expect(fullScreenOn({ ...withAccess('admin'), viewer: { admin: true } } as GameData)).toBe(true)
    expect(fullScreenOn(withAccess('all'))).toBe(true)
  })

  it("is wanted by default in a phone's installed app only", () => {
    expect(wantsFullScreen(null, { mobile: true, standalone: true })).toBe(true)
    expect(wantsFullScreen(null, { mobile: true, standalone: false })).toBe(false)
    expect(wantsFullScreen(null, { mobile: false, standalone: true })).toBe(false)
    expect(wantsFullScreen(null, { mobile: false, standalone: false })).toBe(false)
  })

  it("follows the player's choice on any device", () => {
    expect(wantsFullScreen('off', { mobile: true, standalone: true })).toBe(false)
    expect(wantsFullScreen('on', { mobile: false, standalone: false })).toBe(true)
    expect(wantsFullScreen('on', { mobile: true, standalone: false })).toBe(true)
  })

  it("reads a computer's Esc as the player's choice, a phone's drop as the browser's", () => {
    expect(leftByChoice({ mobile: false })).toBe(true)
    expect(leftByChoice({ mobile: true })).toBe(false)
  })
})
