import { useState } from 'react'
import { evolutionGate, instanceMaxHp, stoneEvolution, usableIn, type PokemonInstance } from '@/engine'
import { effectText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { applyBagItem } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { EvolutionQueue, type EvolutionShow } from './Evolution'
import { ItemSprite } from './ItemSprite'

/**
 * "Use an item" in a Pokémon's sheet: the bag items that work outside battle (potions, revives, stones, Rare Candy).
 * Those that would do nothing stay listed, greyed, with the reason ("Already full", "No effect on it"), so the
 * player learns what each one is for. `onUsed` runs after an item took effect (the sheet goes back to the Pokémon).
 */
export function ItemPanel({ inst, onUsed }: { inst: PokemonInstance; onUsed?: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const save = useGame((s) => s.save)
  // An evolution (a stone, a Rare Candy level) plays its scene — kept even if that used up the last usable item.
  const [evolving, setEvolving] = useState<EvolutionShow | null>(null)
  const scene = evolving && (
    <EvolutionQueue
      items={[evolving]}
      onDone={() => {
        setEvolving(null)
        onUsed?.()
      }}
    />
  )
  const bag = Object.entries(inventory ?? {}).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'field'))
  const name = data.species[inst.dex]?.name ?? t('ui.common.pokemon')
  const max = instanceMaxHp(inst, data)

  /** Null when the item would work; otherwise why not, in words. */
  const whyNot = (key: string): string | null => {
    const fx = data.items[key]?.effect
    if (inst.revivesAt != null) return t('ui.sheet.itemReviving')
    if (fx?.kind === 'stone') {
      // A stone whose only branch is a later generation's does nothing yet, so it must not offer to be used.
      const to = save ? stoneEvolution(inst, key, data, evolutionGate(save, data)) : null
      return to == null ? t('ui.sheet.itemNoEffect') : null
    }
    if (fx?.kind === 'revive') return inst.currentHp <= 0 ? null : t('ui.sheet.itemNotFainted')
    if (fx?.kind === 'heal')
      return inst.currentHp <= 0
        ? t('ui.sheet.itemFainted')
        : inst.currentHp >= max
          ? t('ui.sheet.itemFull')
          : null
    if (fx?.kind === 'level') return inst.level < data.config.maxLevel ? null : t('ui.sheet.itemMaxLevel')
    return t('ui.sheet.itemNoEffect')
  }
  /** What it would do to this Pokémon: a stone names what it evolves into. */
  const what = (key: string) => {
    const item = data.items[key]!
    if (item.effect.kind === 'stone' && save) {
      const to = stoneEvolution(inst, key, data, evolutionGate(save, data))
      if (to != null) return t('ui.sheet.itemEvolves', { name: data.species[to]?.name ?? '' })
    }
    return effectText(item)
  }

  if (!bag.length)
    return <p className="font-pixel-sm text-[16px] text-muted">{t('ui.sheet.noItems', { name })}</p>
  return (
    <>
      <ul className="grid gap-1.5">
        {bag.map(([k, n]) => {
          const why = whyNot(k)
          return (
            <li key={k}>
              <button
                type="button"
                disabled={!!why}
                onClick={() => {
                  const r = applyBagItem(k, inst.id)
                  if (!r) return
                  // A stone floats down first in the evolution scene.
                  if (r.evolved)
                    return setEvolving({
                      ...r.evolved,
                      item: data.items[k]?.effect.kind === 'stone' ? k : null,
                    })
                  const after = useGame.getState().save?.box.find((p) => p.id === inst.id)
                  if (after && data.items[k]?.effect.kind !== 'level')
                    pushToast(
                      t('ui.sheet.itemHealed', {
                        name,
                        hp: after.currentHp,
                        max: instanceMaxHp(after, data),
                      }),
                      'good',
                    )
                  onUsed?.()
                }}
                className={cx(
                  'flex min-h-[54px] w-full items-center gap-2.5 px-2 pb-2 pt-1.5 text-left',
                  why
                    ? 'bg-[#f1f4f9] text-muted shadow-[inset_0_0_0_2px_#b6c3d9]'
                    : 'bg-paper shadow-[inset_0_0_0_2px_#24304f,inset_0_-4px_0_#dfe7f2]',
                )}
              >
                <ItemSprite item={data.items[k]} size={32} className={cx(why && 'opacity-60 grayscale')} />
                <span className="grid min-w-0 flex-1 leading-[1.05]">
                  <b className="truncate text-[19px] font-normal">{data.items[k]!.name}</b>
                  <small className="font-pixel-sm text-[14px] text-muted">{why ?? what(k)}</small>
                </span>
                <em className="font-pixel-sm text-[15px] not-italic text-muted">×{n}</em>
              </button>
            </li>
          )
        })}
      </ul>
      {scene}
    </>
  )
}

/** Whether the bag holds anything usable outside battle at all (the sheet hides "Use an item" otherwise). */
export function useHasFieldItems(): boolean {
  return useGame((s) =>
    Object.entries(s.save?.inventory ?? {}).some(([k, n]) => n > 0 && usableIn(s.data.items[k], 'field')),
  )
}
