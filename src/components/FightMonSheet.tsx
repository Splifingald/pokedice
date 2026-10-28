import { useRef } from 'react'
import { instanceMaxHp, monName, nationalDex, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { dexNo } from '@/lib/format'
import { useGame } from '@/store/game'
import { PokemonSheet } from './PokemonSheet'
import { Sheet } from './Sheet'

/**
 * A fight's INFO (the send-out, a switch, the one sent after a K.O.): the Pokémon as it fights — its HP in the fight,
 * its dice, its stats — and nowhere to go from there: no Pokédex entry, no nickname, nothing to travel to (the user's
 * rule, 2026-10-28). A Versus clone, in no Box, shows the same.
 */
export function FightMonSheet({ inst, onClose }: { inst: PokemonInstance | null; onClose: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  // The last one stays while the sheet slides away.
  const last = useRef(inst)
  if (inst) last.current = inst
  const shown = inst ?? last.current
  if (!shown) return null
  return (
    <Sheet
      open={!!inst}
      onClose={onClose}
      title={monName(shown, data)}
      sub={[
        ...(shown.nickname ? [data.species[shown.dex]?.name ?? ''] : []),
        dexNo(nationalDex(data, shown.dex)),
        t('ui.common.level.short', { n: shown.level }),
        t('ui.lead.hp', { hp: shown.currentHp, max: instanceMaxHp(shown, data) }),
      ].join(' · ')}
    >
      {/* No onOpenDex: its evolutions are named, not links. No XP: a fight isn't where it grows. */}
      <PokemonSheet dex={shown.dex} inst={shown} xp={false} />
    </Sheet>
  )
}
