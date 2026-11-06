// The players' suggestions (docs/67): each switch Off by default and read per player; the favourites list; PASS only
// for a Pokémon already owned; auto-mode's cure only for a stun it can lift, the narrowest cure first.
import { describe, expect, it } from 'vitest'
import {
  autoCureItem,
  autoCureOn,
  canPassCatch,
  createBattle,
  DEFAULT_CONFIG,
  emptyStatus,
  isFavourite,
  MAX_FAVOURITES,
  passOwnedOn,
  raidFavouritesOn,
  routeShiniesOn,
  shinyTilesOn,
  toggleFavourite,
  uniformLevels,
  type BattleState,
  type GameData,
  type PokemonInstance,
  type SaveData,
} from '@/engine'
import { data } from '../fixtures'

const withConfig = (patch: Partial<GameData['config']>): GameData => ({
  ...data,
  config: { ...data.config, ...patch },
})
const SWITCHES = ['raidFavourites', 'shinyTiles', 'passOwned', 'routeShinies', 'autoCure'] as const
const READERS = [raidFavouritesOn, shinyTilesOn, passOwnedOn, routeShiniesOn, autoCureOn]
const ALL = withConfig(Object.fromEntries(SWITCHES.map((k) => [k, { access: 'all' }])))

const mon = (id: string, dex: number, shiny = false): PokemonInstance => ({
  id,
  dex,
  level: 50,
  xp: 0,
  currentHp: 1,
  caughtAt: 0,
  ...(shiny && { shiny: true }),
})
const save = (box: PokemonInstance[], extra: Partial<SaveData> = {}): SaveData =>
  ({ box, team: [], pokedex: [...new Set(box.map((p) => p.dex))], ...extra }) as unknown as SaveData

describe('the switches', () => {
  it('are Off by default, on for admin only with the admin, on for everyone', () => {
    for (const [i, key] of SWITCHES.entries()) {
      const on = READERS[i]!
      expect(DEFAULT_CONFIG[key]).toEqual({ access: 'off' })
      expect(on(data)).toBe(false)
      const admin = withConfig({ [key]: { access: 'admin' } })
      expect(on(admin)).toBe(false)
      expect(on({ ...admin, viewer: { admin: true } } as GameData)).toBe(true)
      expect(on(ALL)).toBe(true)
    }
  })
})

describe('favourites', () => {
  const s = save([mon('a', 22), mon('b', 41)], { favourites: ['gone'] })
  it('puts the heart on and takes it off, dropping Pokémon that left', () => {
    const on = toggleFavourite(s, 'a')
    expect(on.favourites).toEqual(['a'])
    expect(isFavourite(on, 'a')).toBe(true)
    const off = toggleFavourite(on, 'a')
    expect(off.favourites).toEqual([])
    expect(isFavourite(off, 'a')).toBe(false)
  })
  it("counts a parked region's Box, and ignores an id no Box holds", () => {
    const parked = save([mon('a', 22)], {
      parked: { johto: { box: [mon('j', 152)] } },
    } as unknown as Partial<SaveData>)
    expect(toggleFavourite(parked, 'j').favourites).toEqual(['j'])
    expect(toggleFavourite(s, 'nobody')).toBe(s)
  })
  it(`stops at ${MAX_FAVOURITES}`, () => {
    const box = Array.from({ length: MAX_FAVOURITES + 1 }, (_, i) => mon(`m${i}`, 1))
    const full = save(box, { favourites: box.slice(0, MAX_FAVOURITES).map((p) => p.id) })
    expect(toggleFavourite(full, `m${MAX_FAVOURITES}`)).toBe(full)
    expect(toggleFavourite(full, 'm0').favourites).toHaveLength(MAX_FAVOURITES - 1)
  })
})

describe('PASS on the catch', () => {
  const s = save([mon('a', 45), mon('b', 22, true)])
  it('only with its switch on', () => expect(canPassCatch(s, data, 45)).toBe(false))
  it('for a species in the Pokédex, never a new one', () => {
    expect(canPassCatch(s, ALL, 45)).toBe(true)
    expect(canPassCatch(s, ALL, 46)).toBe(false)
  })
  it('for a shiny only once a shiny of it is in the Box', () => {
    expect(canPassCatch(s, ALL, 22, true)).toBe(true)
    expect(canPassCatch(s, ALL, 45, true)).toBe(false)
  })
})

describe("auto-mode's cure", () => {
  const stunned = (
    status: Partial<ReturnType<typeof emptyStatus>>,
    more: Partial<BattleState> = {},
  ): BattleState => {
    const s = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 25, level: 30, hp: 9999 }],
        leadUid: 'a',
        enemy: { dex: 19, level: 5 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state
    return {
      ...s,
      ...more,
      phase: more.phase ?? 'player_stunned',
      player: s.player.map((p) => ({ ...p, status: { ...emptyStatus(), ...status } })),
    }
  }
  const bag = { 'paralyze-heal': 1, 'ice-heal': 2, antidote: 3 }

  it('names the cure for the stun', () => {
    expect(autoCureItem(stunned({ paralyze: 2 }), data, bag)).toBe('paralyze-heal')
    expect(autoCureItem(stunned({ frozen: 1 }), data, bag)).toBe('ice-heal')
  })
  it('nothing without one in the bag, or none left', () => {
    expect(autoCureItem(stunned({ paralyze: 2 }), data, { antidote: 3 })).toBeNull()
    expect(autoCureItem(stunned({ paralyze: 2 }), data, { 'paralyze-heal': 0 })).toBeNull()
    expect(autoCureItem(stunned({ paralyze: 2 }), data, undefined)).toBeNull()
  })
  it('nothing off a stunned turn, after an item this turn, or with the bag shut', () => {
    expect(autoCureItem(stunned({ paralyze: 2 }, { phase: 'player_roll' }), data, bag)).toBeNull()
    expect(autoCureItem(stunned({ paralyze: 2 }, { itemUsedThisTurn: true }), data, bag)).toBeNull()
    expect(autoCureItem(stunned({ paralyze: 2 }, { noBag: true }), data, bag)).toBeNull()
    expect(autoCureItem(stunned({}), data, bag)).toBeNull()
  })
  it('the narrowest cure first, then the cheapest', () => {
    const wide = { ...data.items['paralyze-heal']!, key: 'all-cure', price: 1 }
    const both: GameData = {
      ...data,
      items: {
        ...data.items,
        'all-cure': { ...wide, effect: { kind: 'cure', statuses: ['paralyze', 'frozen'] } },
      },
    }
    expect(autoCureItem(stunned({ paralyze: 2 }), both, { 'all-cure': 1, 'paralyze-heal': 1 })).toBe(
      'paralyze-heal',
    )
    expect(autoCureItem(stunned({ paralyze: 2 }), both, { 'all-cure': 1 })).toBe('all-cure')
  })
})
