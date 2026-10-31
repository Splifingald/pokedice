// Welcome-back gifts (docs/56): the engine's side of the rule the server applies (0101) — the tiers as the admin set
// them, cleaned; the cooldown; days away from the days played; only the highest tier; the edge cases (a new player, the
// same day, the clock moved back); the switch with the gifts'; the message's numbers.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  dayNumber,
  welcomeBackCooldown,
  welcomeBackNote,
  welcomeBackOn,
  welcomeBackOutcome,
  welcomeBackReply,
  welcomeBackSends,
  welcomeBackTier,
  welcomeBackTiers,
  type EventAccess,
  type GameData,
  type WelcomeBackConfig,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { compileGameData } from '@/engine'

const TIERS = welcomeBackTiers(DEFAULT_CONFIG.welcomeBack)
const COOL = welcomeBackCooldown(DEFAULT_CONFIG.welcomeBack)

const outcome = (today: string, played: string[], lastClaim: string | null = null) =>
  welcomeBackOutcome({ today, played, lastClaim }, TIERS, COOL)

describe('the defaults', () => {
  it('are 3, 7 and 14 days, every 14 days, off', () => {
    expect(DEFAULT_CONFIG.welcomeBack.access).toBe('off')
    expect(TIERS.map((t) => t.minDays)).toEqual([3, 7, 14])
    expect(COOL).toBe(14)
  })

  it('hold the brief’s packages, each into the latest region, with items the game knows', () => {
    const data = compileGameData(BUNDLE as never)
    const said = TIERS.map((t) =>
      t.gifts.map((g) =>
        g.kind === 'gold' ? `₽${g.amount}` : g.kind === 'item' ? `${g.key}×${g.qty}` : '?',
      ),
    )
    expect(said).toEqual([
      ['₽300', 'great-ball×5', 'super-potion×3', 'rare-candy×1'],
      ['₽1000', 'ultra-ball×5', 'hyper-potion×3', 'revive×2', 'rare-candy×2'],
      ['₽2500', 'ultra-ball×10', 'max-revive×3', 'max-ether×2', 'rare-candy×5'],
    ])
    for (const t of TIERS)
      for (const g of t.gifts) {
        expect(g.region).toBe('latest')
        if (g.kind === 'item') expect(data.items[g.key], g.key).toBeTruthy()
      }
  })
})

describe('the admin’s tiers, cleaned', () => {
  const gold = (amount: number) => ({ kind: 'gold' as const, amount, region: 'latest' })
  it('sorted, each number of days once (the first kept), 1–365 whole days, six at most', () => {
    const cfg: Partial<WelcomeBackConfig> = {
      tiers: [
        { minDays: 10, gifts: [gold(10)] },
        { minDays: 2, gifts: [gold(2)] },
        { minDays: 10, gifts: [gold(99)] },
        { minDays: 0, gifts: [gold(1)] },
        { minDays: 366, gifts: [gold(1)] },
        { minDays: 2.5, gifts: [gold(1)] },
        ...[20, 30, 40, 50, 60].map((d) => ({ minDays: d, gifts: [gold(d)] })),
      ],
    }
    const tiers = welcomeBackTiers(cfg)
    expect(tiers.map((t) => t.minDays)).toEqual([2, 10, 20, 30, 40, 50])
    expect(tiers[1]!.gifts).toEqual([gold(10)])
  })

  it('a tier without a gift, or with one the game can’t read, is left out (as the server’s check does)', () => {
    const cfg = {
      tiers: [
        { minDays: 3, gifts: [] },
        { minDays: 4, gifts: [gold(5), { kind: 'item', key: 'potion', qty: 0, region: 'latest' }] },
        { minDays: 5, gifts: [gold(5)] },
      ],
    } as unknown as Partial<WelcomeBackConfig>
    expect(welcomeBackTiers(cfg).map((t) => t.minDays)).toEqual([5])
    expect(welcomeBackTiers(undefined)).toEqual([])
    expect(welcomeBackTiers({ tiers: 'nope' } as never)).toEqual([])
  })

  it('the cooldown: whole days 1–365, 14 when unset', () => {
    expect(welcomeBackCooldown({ cooldownDays: 7.4 })).toBe(7)
    expect(welcomeBackCooldown({ cooldownDays: 0 })).toBe(1)
    expect(welcomeBackCooldown({ cooldownDays: 9999 })).toBe(365)
    expect(welcomeBackCooldown({})).toBe(14)
    expect(welcomeBackCooldown({ cooldownDays: 'x' } as never)).toBe(14)
  })
})

describe('days away and the tier', () => {
  it('counts calendar days, across months and years', () => {
    expect(dayNumber('2026-11-01')! - dayNumber('2026-10-31')!).toBe(1)
    expect(dayNumber('2027-01-02')! - dayNumber('2026-12-30')!).toBe(3)
    expect(dayNumber('2028-03-01')! - dayNumber('2028-02-28')!).toBe(2)
    expect(dayNumber('31/10/2026')).toBeNull()
  })

  it('only the highest tier reached', () => {
    expect(welcomeBackTier(2, TIERS)).toBeNull()
    expect(welcomeBackTier(3, TIERS)?.minDays).toBe(3)
    expect(welcomeBackTier(6, TIERS)?.minDays).toBe(3)
    expect(welcomeBackTier(7, TIERS)?.minDays).toBe(7)
    expect(welcomeBackTier(13, TIERS)?.minDays).toBe(7)
    expect(welcomeBackTier(14, TIERS)?.minDays).toBe(14)
    expect(welcomeBackTier(400, TIERS)?.minDays).toBe(14)
  })

  it('days away = today − the last day played before today (back the next day = 1)', () => {
    expect(outcome('2026-10-31', ['2026-10-30'])).toEqual({ kind: 'none', reason: 'short' })
    expect(outcome('2026-10-31', ['2026-10-28'])).toMatchObject({
      kind: 'send',
      days: 3,
      tier: { minDays: 3 },
    })
    // Today's own ping, and older days, don't change it.
    expect(outcome('2026-10-31', ['2026-10-01', '2026-10-22', '2026-10-31'])).toMatchObject({
      days: 9,
      tier: { minDays: 7 },
    })
    expect(outcome('2026-10-31', ['2025-01-01'])).toMatchObject({ kind: 'send', tier: { minDays: 14 } })
  })

  it('nothing for a brand-new player, nor one who played only today', () => {
    expect(outcome('2026-10-31', [])).toEqual({ kind: 'none', reason: 'new' })
    expect(outcome('2026-10-31', ['2026-10-31'])).toEqual({ kind: 'none', reason: 'new' })
  })

  it('a day played after today (the device moved back a day) gives nothing', () => {
    expect(outcome('2026-10-31', ['2026-10-01', '2026-11-01'])).toEqual({ kind: 'none', reason: 'clock' })
    expect(outcome('not a day', ['2026-10-01'])).toEqual({ kind: 'none', reason: 'clock' })
  })
})

describe('the cooldown and the same day', () => {
  it('the same day: the same answer again, not a second gift', () => {
    expect(outcome('2026-10-31', ['2026-10-01'], '2026-10-31')).toEqual({ kind: 'same' })
  })

  it('nothing until cooldownDays have passed since the last one', () => {
    expect(outcome('2026-10-31', ['2026-10-20'], '2026-10-18')).toEqual({ kind: 'none', reason: 'cooldown' })
    expect(outcome('2026-10-31', ['2026-10-20'], '2026-10-17')).toMatchObject({ kind: 'send', days: 11 })
    // A last one dated after today (the clock moved back): nothing.
    expect(outcome('2026-10-31', ['2026-10-01'], '2026-11-01')).toEqual({ kind: 'none', reason: 'cooldown' })
  })

  it('back after a gift, playing every day, then gone again: the next one waits for the cooldown and a new absence', () => {
    const played = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']
    // The return of Oct 1 was a gift; back on the 16th after 11 days away: the cooldown is over.
    expect(outcome('2026-10-16', played, '2026-10-01')).toMatchObject({
      kind: 'send',
      days: 11,
      tier: { minDays: 7 },
    })
    // Back on the 6th: not away.
    expect(outcome('2026-10-06', played, '2026-10-01')).toEqual({ kind: 'none', reason: 'cooldown' })
  })
})

describe('the switch, and the message', () => {
  const withAccess = (welcome: EventAccess, gifts: EventAccess, admin = false): GameData =>
    ({
      config: {
        ...DEFAULT_CONFIG,
        welcomeBack: { ...DEFAULT_CONFIG.welcomeBack, access: welcome },
        gifts: { access: gifts },
      },
      viewer: { admin },
    }) as unknown as GameData

  it('is on for whom the switch says, and sends only with the gifts on too', () => {
    expect(welcomeBackOn(withAccess('off', 'all'))).toBe(false)
    expect(welcomeBackOn(withAccess('admin', 'all'))).toBe(false)
    expect(welcomeBackOn(withAccess('admin', 'all', true))).toBe(true)
    expect(welcomeBackSends(withAccess('all', 'all'))).toBe(true)
    expect(welcomeBackSends(withAccess('all', 'off'))).toBe(false)
    expect(welcomeBackSends(withAccess('all', 'admin'))).toBe(false)
    expect(welcomeBackSends(withAccess('all', 'admin', true))).toBe(true)
  })

  it('reads the server’s numbers back, and nothing from another message', () => {
    const note = { days: 9, minDays: 7, from: 3, cooldown: 14 }
    expect(welcomeBackNote(welcomeBackReply(note))).toEqual(note)
    expect(welcomeBackNote('@welcome_back:{"days":4}')).toEqual({
      days: 4,
      minDays: 4,
      from: 4,
      cooldown: 14,
    })
    expect(welcomeBackNote('@welcome_back:{oops')).toBeNull()
    expect(welcomeBackNote('Thanks for the report!')).toBeNull()
    expect(welcomeBackNote(null)).toBeNull()
  })
})
