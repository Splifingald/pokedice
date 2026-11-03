// The admin's outfit choice on a Pokémon gift (docs/59): only for a species that has one drawn, "None" first.
import { outfitChoices } from '@/engine'
import { outfitName } from '@/components/Outfit'
import { inputCls } from './widgets'

export function OutfitSelect({
  dex,
  value,
  onChange,
}: {
  dex: number
  value: string | undefined
  onChange: (outfit: string | undefined) => void
}) {
  const choices = outfitChoices(dex)
  if (!choices.length) return null
  return (
    <label className="flex w-40 flex-col text-base">
      Outfit
      <select
        className={inputCls}
        value={value && choices.includes(value) ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">None</option>
        {choices.map((k) => (
          <option key={k} value={k}>
            {outfitName(k)}
          </option>
        ))}
      </select>
    </label>
  )
}
