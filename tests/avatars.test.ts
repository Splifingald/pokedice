// The looks a player can pick for the leaderboard and Versus (the old free list, and the trainer looks of docs/31):
// every one has a sprite on disk, none is a Gym Leader, Elite Four member, Champion or Team Rocket, and a save keeps
// the pick.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasKey, t } from '@/i18n'
import { AVATAR_GROUPS, avatarName, avatarOf, isAvatarId, playerAvatarId, TRAINER_LOOKS } from '@/lib/avatars'
import { LOOKS } from '@/engine/looks'
import { newSave } from '@/engine'
import { parseSave } from '@/save/schema'
import { data, newId } from './fixtures'
import atlas from '@/data/trainer-atlas.json'

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

  it('trainer looks (docs/31): every one has a sprite in the sheets, its own name, and resolves', () => {
    expect(TRAINER_LOOKS.map((a) => a.id)).toEqual(LOOKS.map((l) => l.id))
    expect(
      TRAINER_LOOKS.filter((a) => !existsSync(path.join(__dirname, '..', 'public', a.src))).map((a) => a.id),
    ).toEqual([])
    expect(TRAINER_LOOKS.filter((a) => !(a.src in atlas.cells)).map((a) => a.id)).toEqual([])
    const keys = TRAINER_LOOKS.flatMap((a) => [a.labelKey, ...(a.extra?.startsWith('ui.') ? [a.extra] : [])])
    expect(keys.filter((k) => !hasKey(k))).toEqual([])
    // No two looks read the same: a sex or an outfit tells them apart.
    const names = TRAINER_LOOKS.map((a) => `${a.id.split('/')[0]}:${avatarName(a, t)}`)
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
    expect(avatarName(avatarOf('kanto/red-gen1'), t)).toBe('Red (Game Boy)')
    expect(avatarName(avatarOf('kanto/swimmer-f'), t)).toBe('Swimmer ♀')
    expect(playerAvatarId({ name: 'A', character: 'red', avatar: 'paldea/juliana' })).toBe('paldea/juliana')
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
