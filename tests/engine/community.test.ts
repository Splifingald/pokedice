// The community Discord button: shown only once the admin has set a usable invite link.
import { describe, expect, it } from 'vitest'
import { discordUrl } from '@/engine'
import { makeData } from '../fixtures'

describe('Discord link', () => {
  it('is off by default: no link, no button', () => {
    expect(discordUrl(makeData())).toBeNull()
  })

  it('opens the admin’s invite link, trimmed', () => {
    expect(discordUrl(makeData({ discordUrl: ' https://discord.gg/pokedice ' }))).toBe('https://discord.gg/pokedice')
  })

  it('stays hidden for anything but a web address', () => {
    for (const link of ['', '   ', 'discord.gg/pokedice', 'javascript:alert(1)', 'data:text/html,hi']) {
      expect(discordUrl(makeData({ discordUrl: link }))).toBeNull()
    }
  })
})
