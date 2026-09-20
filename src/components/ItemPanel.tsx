import { useState } from 'react'
import { evolutionGate, instanceMaxHp, stoneEvolution, usableIn, type PokemonInstance } from '@/engine'
import { effectText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { applyBagItem } from '@/store/actions'
import { useGame } from '@/store/game'
import { EvolutionQueue, type EvolutionShow } from './Evolution'
import { ItemSprite } from './ItemSprite'
import { PixelButton } from './PixelButton'

/** "Use an item" inside a Pokémon's sheet: the bag items that work outside battle (potions, revives, stones, Rare Candy). */
export function ItemPanel({ inst }: { inst: PokemonInstance }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const save = useGame((s) => s.save)
  // An evolution (a stone, a Rare Candy level) plays its scene — kept even if that used up the last usable item.
  const [evolving, setEvolving] = useState<EvolutionShow | null>(null)
  const scene = evolving && <EvolutionQueue items={[evolving]} onDone={() => setEvolving(null)} />
  const bag = Object.entries(inventory ?? {}).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'field'))
  if (!bag.length || inst.revivesAt != null) return scene || null
  const helps = (key: string) => {
    const fx = data.items[key]?.effect
    // A stone whose only branch is a later generation's does nothing yet, so it must not offer to be used.
    if (fx?.kind === 'stone') return !!save && stoneEvolution(inst, key, data, evolutionGate(save, data)) != null
    if (fx?.kind === 'revive') return inst.currentHp <= 0
    if (fx?.kind === 'heal') return inst.currentHp > 0 && inst.currentHp < instanceMaxHp(inst, data)
    if (fx?.kind === 'level') return inst.level < data.config.maxLevel
    return false
  }
  return (
    <section className="flex flex-col gap-2 border-t-[3px] border-dashed border-shadow pt-3">
      <h3 className="text-xl">{t('ui.itemPanel.title')}</h3>
      {bag.map(([k, n]) => (
        <PixelButton
          key={k}
          className="justify-between"
          disabled={!helps(k)}
          onClick={() => {
            const r = applyBagItem(k, inst.id)
            if (r?.evolved) setEvolving(r.evolved)
          }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <ItemSprite item={data.items[k]} size={24} />
            <span className="min-w-0">
              {data.items[k]!.name} <span className="text-base">({effectText(data.items[k]!)})</span>
            </span>
          </span>
          <span className="font-mono text-base">×{n}</span>
        </PixelButton>
      ))}
      {scene}
    </section>
  )
}
