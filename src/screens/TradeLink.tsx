// /t/<code>: a listing's link (docs/23 §2.5). Keeps the code (src/lib/trades) and goes on: to the Trades page when
// there is a game, to the title screen otherwise. The game shell's TradesService opens the listing.
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { saveTradeLink, TRADE_LINK_EVENT } from '@/lib/trades'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'

export function TradeLink() {
  const { code = '' } = useParams()
  const hasSave = useGame((s) => !!s.save)
  const [kept] = useState(() => (isSupabaseConfigured ? saveTradeLink(code) : null))
  useEffect(() => {
    if (kept) window.dispatchEvent(new Event(TRADE_LINK_EVENT))
  }, [kept])
  return <Navigate to={kept && hasSave ? '/trades' : '/'} replace />
}
