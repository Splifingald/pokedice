// Nicknames: given from a Pokémon's sheet, kept on the instance, so they go with it in a trade (and its new trainer can
// change them), through an evolution and into battle.
import { describe, expect, it } from 'vitest'
import {
  activeBattler,
  applyTake,
  applyTaken,
  cleanNickname,
  createBattle,
  createInstance,
  createRng,
  DEFAULT_CONFIG,
  evolve,
  listBack,
  listOut,
  makeBattler,
  monName,
  newSave,
  NICKNAME_MAX,
  receiveTrade,
  reduce,
  renamePokemon,
  tradesOf,
  uniformLevels,
  type PokemonInstance,
  type SaveData,
  type TradeConfig,
} from '@/engine'
import { parseInstance } from '@/lib/trades'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const data = makeData({ trade: { ...DEFAULT_CONFIG.trade, access: 'all', minBadges: 0 } satisfies TradeConfig })
const NOW = 1_000_000

const mon = (dex: number, level: number, extra: Partial<PokemonInstance> = {}): PokemonInstance => ({
  ...createInstance(dex, level, data, newId(), NOW),
  ...extra,
})

function kanto(...mons: PokemonInstance[]): SaveData {
  const s = newSave(4, data, NOW, newId)
  return { ...s, box: [...s.box, ...mons], pokedex: [...new Set([...s.pokedex, ...mons.map((m) => m.dex)])] }
}

const find = (s: SaveData, id: string) => s.box.find((p) => p.id === id)

describe('a nickname as it is kept', () => {
  it('is trimmed, its spaces collapsed, and empty means none', () => {
    expect(cleanNickname('  Sparky  ')).toBe('Sparky')
    expect(cleanNickname('Big   Red')).toBe('Big Red')
    expect(cleanNickname('   ')).toBeUndefined()
    expect(cleanNickname('')).toBeUndefined()
    expect(cleanNickname(42)).toBeUndefined()
    expect(cleanNickname(undefined)).toBeUndefined()
  })
  it('loses control and invisible characters', () => {
    expect(cleanNickname('Spa\u0000rk​y\n')).toBe('Sparky')
    expect(cleanNickname('‮evil')).toBe('evil')
  })
  it(`is cut to ${NICKNAME_MAX} characters, an accent or a CJK character counting once`, () => {
    expect(cleanNickname('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJKL')
    expect(cleanNickname('ピカチュウピカチュウピカチュウ')).toBe('ピカチュウピカチュウピカ')
    expect(cleanNickname('Éévéé-Éévéé-Éé')).toBe('Éévéé-Éévéé-')
    // NFC: an "e" and its combining accent count as one.
    expect(cleanNickname('é'.repeat(13))).toBe('é'.repeat(NICKNAME_MAX))
  })
  it('names the Pokémon, or its species does', () => {
    expect(monName(mon(25, 5, { nickname: 'Sparky' }), data)).toBe('Sparky')
    expect(monName(mon(25, 5), data)).toBe('Pikachu')
  })
})

describe('renaming one of your Pokémon', () => {
  it('gives it a nickname, and changes it', () => {
    const p = mon(25, 12)
    const s = renamePokemon(kanto(p), data, p.id, ' Sparky ')!
    expect(find(s, p.id)!.nickname).toBe('Sparky')
    const again = renamePokemon(s, data, p.id, 'Volt')!
    expect(find(again, p.id)!.nickname).toBe('Volt')
  })
  it('takes it away when the name is empty or its species’ own', () => {
    const p = mon(25, 12, { nickname: 'Sparky' })
    expect(find(renamePokemon(kanto(p), data, p.id, '')!, p.id)).not.toHaveProperty('nickname')
    expect(find(renamePokemon(kanto(p), data, p.id, 'PIKACHU')!, p.id)).not.toHaveProperty('nickname')
  })
  it('changes nothing for the same name or a Pokémon you don’t have', () => {
    const p = mon(25, 12, { nickname: 'Sparky' })
    expect(renamePokemon(kanto(p), data, p.id, 'Sparky ')).toBeNull()
    expect(renamePokemon(kanto(mon(25, 12)), data, 'nobody', 'Sparky')).toBeNull()
  })
  it('finds it in a parked region’s Box too', () => {
    const p = mon(158, 10)
    const base = kanto()
    const s: SaveData = { ...base, parked: { johto: { ...base, box: [p], team: [p.id], pokedex: [158] } } }
    const r = renamePokemon(s, data, p.id, 'Chomp')!
    expect(r.parked!.johto!.box[0]!.nickname).toBe('Chomp')
    expect(r.box).toBe(s.box)
  })
  it('keeps it through an evolution', () => {
    expect(evolve(mon(25, 30, { nickname: 'Sparky' }), 26, data).nickname).toBe('Sparky')
  })
  it('survives the save’s checks, and a bad one is dropped without losing the save', () => {
    const p = mon(25, 12, { nickname: 'Sparky' })
    const raw = JSON.parse(JSON.stringify(kanto(p))) as SaveData
    const ok = parseSave(raw)
    expect(ok.ok && ok.save.box.find((m) => m.id === p.id)?.nickname).toBe('Sparky')
    const edited = (nickname: unknown) =>
      parseSave({ ...raw, box: raw.box.map((m) => (m.id === p.id ? { ...m, nickname } : m)) })
    const bad = edited(7)
    expect(bad.ok && bad.save.box.find((m) => m.id === p.id)?.nickname).toBeUndefined()
    const long = edited(' Sparky the Electric Mouse ')
    expect(long.ok && long.save.box.find((m) => m.id === p.id)?.nickname).toBe('Sparky the E')
  })
})

describe('a nickname in a trade', () => {
  // A Lv.60 in the Box: a traded Pokémon above a region's best would wait, locked (docs/23 §1.4).
  const trainer = (...mons: PokemonInstance[]) => kanto(...mons, mon(9, 60))
  it('comes from the other trainer’s save, cleaned', () => {
    const raw = { id: 'x', dex: 25, level: 9, xp: 0, currentHp: 20, caughtAt: 0, nickname: '  Spar\u0000ky  ' }
    expect(parseInstance(raw)?.nickname).toBe('Sparky')
    expect(parseInstance({ ...raw, nickname: 'x'.repeat(500) })?.nickname).toHaveLength(NICKNAME_MAX)
    expect(parseInstance({ ...raw, nickname: '' })).not.toHaveProperty('nickname')
  })
  it('arrives with the Pokémon, and its new trainer can change it', () => {
    const r = receiveTrade(trainer(), data, { dex: 7, nickname: 'Bubbles' }, 20, NOW, newId)
    expect(r.outcome).toBe('new')
    const got = find(r.save, r.instId!)!
    expect(got.nickname).toBe('Bubbles')
    expect(find(renamePokemon(r.save, data, got.id, 'Squirt')!, got.id)!.nickname).toBe('Squirt')
  })
  it('stays on through a trade evolution', () => {
    const r = receiveTrade(trainer(), data, { dex: 64, nickname: 'Spoons' }, 22, NOW, newId)
    expect(r.evolvedTo).toBe(65)
    expect(find(r.save, r.instId!)).toMatchObject({ dex: 65, nickname: 'Spoons' })
  })
  it('replaces yours with the stronger one’s, or keeps yours when it has none', () => {
    const mine = mon(7, 10, { nickname: 'Mine' })
    const named = receiveTrade(trainer(mine), data, { dex: 7, nickname: 'Bubbles' }, 30, NOW, newId)
    expect(named.outcome).toBe('replaced')
    expect(find(named.save, mine.id)).toMatchObject({ level: 30, nickname: 'Bubbles' })
    const plain = receiveTrade(trainer(mine), data, { dex: 7 }, 30, NOW, newId)
    expect(find(plain.save, mine.id)).toMatchObject({ level: 30, nickname: 'Mine' })
  })
  it('goes nowhere when it merges into a stronger one of yours', () => {
    const mine = mon(7, 40, { nickname: 'Mine' })
    const r = receiveTrade(trainer(mine), data, { dex: 7, nickname: 'Bubbles' }, 20, NOW, newId)
    expect(r.outcome).toBe('merged')
    expect(find(r.save, mine.id)!.nickname).toBe('Mine')
  })
  it('both sides: the taker gets the listed one’s, the poster the given one’s, and the log keeps them', () => {
    const given = mon(16, 22, { nickname: 'Birdy' })
    const listed = mon(4, 12, { nickname: 'Embers' })
    const take = applyTake(trainer(given), data, { id: 'T1', listed, given, with: 'Misty' }, NOW, newId)
    expect(take.save.box.find((p) => p.dex === 4 && p.id !== given.id && p.nickname)?.nickname).toBe('Embers')
    expect(tradesOf(take.save).log![0]).toMatchObject({
      gave: { dex: 16, nickname: 'Birdy' },
      got: { dex: 4, nickname: 'Embers' },
    })

    const posted = listOut(
      trainer(listed),
      data,
      listed.id,
      { id: 'T1', code: 'C', endsAt: NOW + 1, want: { kind: 'any' }, visibility: 'public' },
      NOW,
    )!
    const taken = applyTaken(posted, data, { id: 'T1', listed, given, with: 'Ash' }, NOW, newId)
    expect(taken.save.box.find((p) => p.dex === 16)?.nickname).toBe('Birdy')
    expect(tradesOf(taken.save).log![0]).toMatchObject({ gave: { nickname: 'Embers' }, got: { nickname: 'Birdy' } })
  })
  it('comes back with a listing nobody took', () => {
    const p = mon(25, 12, { nickname: 'Sparky' })
    const out = listOut(
      kanto(p),
      data,
      p.id,
      { id: 'L', code: 'C', endsAt: NOW + 1, want: { kind: 'any' }, visibility: 'public' },
      NOW,
    )!
    expect(tradesOf(out).out[0]!.mon.nickname).toBe('Sparky')
    expect(find(listBack(out, data, 'L')!.save, p.id)!.nickname).toBe('Sparky')
  })
})

describe('a nickname in battle', () => {
  it('names your Pokémon, and stays through a Mega Evolution', () => {
    expect(makeBattler({ uid: 'a', dex: 25, level: 5, hp: 20, nickname: 'Sparky' }, data).name).toBe('Sparky')
    expect(makeBattler({ uid: 'a', dex: 25, level: 5, hp: 20 }, data).name).toBe('Pikachu')
    const s = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 6, level: 60, hp: 9999, nickname: 'Blaze' }],
        leadUid: 'a',
        enemy: { dex: 19, level: 5 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        megaAllowed: true,
      },
      data,
    ).state
    const turn = { ...s, phase: 'player_roll' as const, actor: 'player' as const, dice: [], selected: [] }
    const mega = reduce(turn, { t: 'MEGA', toDex: 10034 }, data, createRng(1)).state
    expect(activeBattler(mega)).toMatchObject({ dex: 10034, name: 'Blaze' })
  })
})
