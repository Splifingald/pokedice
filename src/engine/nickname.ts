// A Pokémon's nickname: given from its sheet, kept on the instance, so it travels wherever the Pokémon goes (an
// evolution, another region, a trade) and its new trainer can change it.
import type { GameData, PokemonInstance, SaveData } from './types'

/** At most this many characters, like a trainer's name. */
export const NICKNAME_MAX = 12

/**
 * A nickname as it is kept: control and invisible characters out, spaces collapsed, trimmed, cut to `NICKNAME_MAX`
 * characters (code points, so an accent or a CJK name counts once). Nothing left means no nickname.
 */
export function cleanNickname(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
  const cut = [...s].slice(0, NICKNAME_MAX).join('').trim()
  return cut || undefined
}

/** The name it goes by: its nickname, or its species' name. */
export const monName = (inst: Pick<PokemonInstance, 'dex' | 'nickname'>, data: GameData): string =>
  inst.nickname || data.species[inst.dex]?.name || `#${inst.dex}`

const named = (inst: PokemonInstance, nickname: string | undefined): PokemonInstance => {
  const { nickname: _old, ...rest } = inst
  return nickname ? { ...rest, nickname } : rest
}

/**
 * Gives one of your Pokémon a nickname, or takes it away: an empty name, or its species' own name, means none (so it
 * shows its species' name again, and its next form's once it evolves). Looks in every region's Box. Null when the
 * Pokémon isn't there or nothing changes.
 */
export function renamePokemon(save: SaveData, data: GameData, instId: string, raw: string): SaveData | null {
  const holds = (box: PokemonInstance[]) => box.some((p) => p.id === instId)
  const inst = [save.box, ...Object.values(save.parked ?? {}).map((b) => b?.box ?? [])]
    .flat()
    .find((p) => p.id === instId)
  if (!inst) return null
  let nickname = cleanNickname(raw)
  const species = data.species[inst.dex]?.name
  if (nickname && species && nickname.toLocaleLowerCase() === species.toLocaleLowerCase())
    nickname = undefined
  if (nickname === inst.nickname) return null
  const rename = (box: PokemonInstance[]) => box.map((p) => (p.id === instId ? named(p, nickname) : p))
  if (holds(save.box)) return { ...save, box: rename(save.box) }
  const parked = { ...save.parked }
  for (const [id, b] of Object.entries(parked))
    if (b && holds(b.box)) parked[id] = { ...b, box: rename(b.box) }
  return { ...save, parked }
}
