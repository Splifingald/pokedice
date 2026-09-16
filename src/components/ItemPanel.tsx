import { effectText, instanceMaxHp, usableIn, type PokemonInstance } from '@/engine'
import { applyBagItem } from '@/store/actions'
import { useGame } from '@/store/game'
import { PixelButton } from './PixelButton'

/** "Use an item" inside a Pokémon's sheet: the bag items that work outside battle (potions, Rare Candy). */
export function ItemPanel({ inst }: { inst: PokemonInstance }) {
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const bag = Object.entries(inventory ?? {}).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'field'))
  if (!bag.length) return null
  const helps = (key: string) => {
    const fx = data.items[key]?.effect
    if (fx?.kind === 'heal') return inst.currentHp > 0 && inst.currentHp < instanceMaxHp(inst, data)
    if (fx?.kind === 'level') return inst.level < data.config.maxLevel
    return false
  }
  return (
    <section className="flex flex-col gap-2 border-t-[3px] border-dashed border-shadow pt-3">
      <h3 className="text-xl">Use an item</h3>
      {bag.map(([k, n]) => (
        <PixelButton key={k} className="justify-between" disabled={!helps(k)} onClick={() => applyBagItem(k, inst.id)}>
          <span>
            {data.items[k]!.name} <span className="text-base">({effectText(data.items[k]!)})</span>
          </span>
          <span className="font-mono text-base">×{n}</span>
        </PixelButton>
      ))}
    </section>
  )
}
