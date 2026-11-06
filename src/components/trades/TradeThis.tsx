// TRADE on a Pokémon's sheet (docs/23 §2), beside Send on: it opens New listing on the Trades page with this one
// picked. Shown once trades are open to the player; a Pokémon that can't be listed says why instead.
import { useNavigate } from 'react-router-dom'
import { monName, tradeBlocked, tradeChoices, tradeClosed, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { PixelButton } from '../PixelButton'
import { useBlockText } from './TradeBits'

/** The button and the line under it (only when it can't be listed), or null when trades aren't open to this player. */
export function useTradeThis(inst: PokemonInstance, primary: boolean, onGone: () => void) {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const blockText = useBlockText()
  if (!isSupabaseConfigured || !signedIn || !save || tradeClosed(save, data)) return null
  const at = tradeChoices(save, data).find((m) => m.inst.id === inst.id)
  if (!at) return null
  const why = tradeBlocked(save, data, at)
  const name = monName(inst, data)
  return {
    button: (
      <PixelButton
        key="trade"
        variant={primary ? 'primary' : 'secondary'}
        disabled={!!why}
        onClick={() => {
          onGone()
          navigate('/trades', { state: { list: inst.id } })
        }}
      >
        {t('ui.trades.trade')}
      </PixelButton>
    ),
    // Only a reason it can't be listed (the user, 2026-10-27: TRADE explains itself on the Trades page).
    note: why ? t('ui.trades.sheet.cant', { name, why: blockText(why, inst.dex) }) : null,
  }
}
