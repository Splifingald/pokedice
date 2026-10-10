// Discord sign-in (docs/17): which ways in the game offers, which an account has, and the errors a player can act on.
import { describe, expect, it } from 'vitest'
import { parseAuthSettings } from '@/lib/authProviders'
import { authErrorText, providersOf } from '@/store/sync'

describe('parseAuthSettings', () => {
  it('reads the providers Supabase has switched on', () => {
    expect(parseAuthSettings({ external: { google: true, discord: true, github: true } })).toEqual({ google: true, discord: true })
    expect(parseAuthSettings({ external: { google: true, discord: false } })).toEqual({ google: true, discord: false })
  })

  it('assumes Google only when the answer is missing or odd, as before Discord', () => {
    expect(parseAuthSettings(null)).toEqual({ google: true, discord: false })
    expect(parseAuthSettings({})).toEqual({ google: true, discord: false })
    expect(parseAuthSettings({ external: { discord: 'yes' } })).toEqual({ google: true, discord: false })
  })

  it('believes Auth when it says Google is off', () => {
    expect(parseAuthSettings({ external: { google: false, discord: true } })).toEqual({ google: false, discord: true })
  })
})

describe('providersOf', () => {
  const identity = (provider: string) => ({ provider }) as never

  it('lists every linked way in, known ones only, in a fixed order', () => {
    expect(providersOf({ identities: [identity('discord'), identity('google')], app_metadata: {} })).toEqual(['google', 'discord'])
    expect(providersOf({ identities: [identity('email')], app_metadata: { providers: ['discord'] } })).toEqual(['discord'])
    expect(providersOf({ identities: undefined, app_metadata: {} })).toEqual([])
  })
})

describe('authErrorText', () => {
  it('turns the errors a player can act on into words, and keeps Auth’s text for the rest', () => {
    expect(authErrorText('identity_already_exists', 'discord', 'raw')).toContain('Discord')
    expect(authErrorText('identity_already_exists', null, 'raw')).toBe('raw')
    expect(authErrorText('manual_linking_disabled', 'google', 'raw')).not.toBe('raw')
    expect(authErrorText('something_else', 'google', 'raw')).toBe('raw')
  })
})
