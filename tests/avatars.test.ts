// The looks a player can pick for the leaderboard and Versus: every one has a sprite on disk, none is a Gym Leader,
// Elite Four member, Champion or Team Rocket, and a save keeps the pick.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasKey } from '@/i18n'
import { AVATAR_GROUPS, avatarOf, isAvatarId, playerAvatarId } from '@/lib/avatars'
import { newSave } from '@/engine'
import { parseSave } from '@/save/schema'
import { data, newId } from './fixtures'

const all = AVATAR_GROUPS.flatMap((g) => g.avatars)

describe('the looks', () => {
  it('start with Red and Leaf, then Kanto and Johto', () => {
    expect(AVATAR_GROUPS.map((g) => g.group)).toEqual(['default', 'kanto', 'johto'])
    expect(AVATAR_GROUPS[0]!.avatars.map((a) => a.id)).toEqual(['red', 'green'])
  })

  it('have unique ids, a sprite on disk and a name in the sheet', () => {
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length)
    expect(all.filter((a) => !existsSync(path.join(__dirname, '..', 'public', a.src)))).toEqual([])
    expect(all.filter((a) => !hasKey(a.labelKey)).map((a) => a.labelKey)).toEqual([])
  })

  it('leave out Gym Leaders, the Elite Four, Champions and Team Rocket', () => {
    const banned =
      /champion|elite|leader|rocket|giovanni|blue|lance|falkner|bugsy|whitney|morty|chuck|jasmine|pryce|clair|brock|misty|surge|erika|koga|sabrina|blaine|johto\/red/
    expect(all.filter((a) => banned.test(a.id) || banned.test(a.src)).map((a) => a.id)).toEqual([])
  })

  it('fall back to the character, and an unknown id to Red', () => {
    expect(playerAvatarId({ name: 'A', character: 'green' })).toBe('green')
    expect(playerAvatarId({ name: 'A', character: 'green', avatar: 'johto/sage' })).toBe('johto/sage')
    expect(playerAvatarId({ name: 'A', character: 'green', avatar: 'kanto/team-rocket-m' })).toBe('green')
    expect(playerAvatarId(null)).toBe('red')
    expect(isAvatarId('kanto/lass')).toBe(true)
    expect(avatarOf('/etc/passwd').id).toBe('red')
  })

  it('survive a save round trip', () => {
    const save = {
      ...newSave(7, data, 1, newId),
      player: { name: 'Sam', character: 'red' as const, avatar: 'kanto/hiker' },
    }
    const res = parseSave(JSON.parse(JSON.stringify(save)))
    expect(res.ok && res.save.player).toEqual({ name: 'Sam', character: 'red', avatar: 'kanto/hiker' })
  })
})
