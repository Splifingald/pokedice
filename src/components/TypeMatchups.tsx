// What a Pokémon beats and what beats it, read off the live type chart. Shown on its sheet and, in
// battle, in a pop-up on tapping it — both only while the "strengths and weaknesses" hint is on.
import { getSpecies, POKE_TYPES, typeMultiplier, type DieType, type Encounter, type GameData, type PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { TypeBadge } from './TypeBadge'

/**
 * Attack takes the most effective type among the dice, so a defender is hit hard when any die
 * doubles on it, and untouchable only when every die is blank against it. Defence is the product
 * over the Pokémon's own types, so ×4 counts as weak and ×¼ as resisted.
 */
export function matchupsOf(data: GameData, types: readonly PokeType[], dice: readonly DieType[]) {
  const chart = data.typeChart
  const attacking = [...new Set(dice)].filter((d): d is PokeType => d !== 'base')
  const best = (d: PokeType) => attacking.reduce((m, a) => Math.max(m, typeMultiplier(chart, a, [d])), 0)
  const taken = (a: PokeType) => typeMultiplier(chart, a, types)
  return {
    hits: attacking.length ? POKE_TYPES.filter((d) => best(d) >= 2) : [],
    cantTouch: attacking.length ? POKE_TYPES.filter((d) => best(d) === 0) : [],
    weak: POKE_TYPES.filter((a) => taken(a) >= 2),
    resists: POKE_TYPES.filter((a) => taken(a) > 0 && taken(a) < 1),
    immune: POKE_TYPES.filter((a) => taken(a) === 0),
  }
}

/**
 * How hard a Pokémon's dice hit this foe: the best multiplier among its typed dice, as the attack type picks it
 * (see `attackType`). Only-base dice are untyped, ×1.
 */
export function attackEdge(data: GameData, dice: readonly DieType[], foe: readonly PokeType[]) {
  const typed = dice.filter((d): d is PokeType => d !== 'base' && !!data.diceTypes[d]?.countsForMajority)
  if (!typed.length) return 1
  return Math.max(...typed.map((d) => typeMultiplier(data.typeChart, d, foe)))
}

export function speciesTypes(data: GameData, dex: number): PokeType[] {
  const sp = getSpecies(data, dex)
  return sp.type2 ? [sp.type1, sp.type2] : [sp.type1]
}

/** The types of the first Pokémon an encounter sends, when the preview shows it (a trainer's team is a silhouette). */
export function foeTypes(data: GameData, enc: Encounter): PokeType[] | undefined {
  if (enc.kind === 'wild' || enc.kind === 'boss') return speciesTypes(data, enc.dex)
  if (enc.kind === 'gym' && enc.team[0]) return speciesTypes(data, enc.team[0].dex)
  return undefined
}

type Row = { label: string; list: PokeType[] }

/** Only the rows with something in them, so the pop-up stays small. */
export function TypeMatchups({
  types,
  dice,
  className,
}: {
  types: readonly PokeType[]
  dice: readonly DieType[]
  className?: string
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const m = matchupsOf(data, types, dice)
  const rows: Row[] = [
    { label: t('ui.types.hits'), list: m.hits },
    { label: t('ui.types.cantTouch'), list: m.cantTouch },
    { label: t('ui.types.weak'), list: m.weak },
    { label: t('ui.types.resists'), list: m.resists },
    { label: t('ui.types.immune'), list: m.immune },
  ].filter((r) => r.list.length > 0)
  if (!rows.length) return null
  return (
    <dl className={cx('grid gap-x-2 gap-y-1 text-base sm:grid-cols-[auto_1fr]', className)}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted first-letter:uppercase">{r.label}</dt>
          <dd className="flex flex-wrap gap-1">
            {r.list.map((x) => (
              <TypeBadge key={x} type={x} size="sm" />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}
