// A friend's card (docs/23 §2): their open Public and Friends listings, each opening the listing. Shown while trades
// are open to you; their private ones only travel by link.
import { useEffect, useState } from 'react'
import { tradeClosed } from '@/engine'
import { useT } from '@/i18n/react'
import { fetchBoard, type TradeListing } from '@/lib/trades'
import { useGame } from '@/store/game'
import { ListingSheet } from './ListingSheet'
import { ListHead, ListingRow, useTakeWhy } from './TradeBits'

export function TheirTrades({ userId }: { userId: string }) {
  const { t } = useT()
  const open = useGame((s) => !!s.save && !tradeClosed(s.save, s.data) && s.auth.status === 'signed_in')
  const takeWhy = useTakeWhy()
  const [rows, setRows] = useState<TradeListing[] | null>(null)
  const [shown, setShown] = useState<TradeListing | null>(null)
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!open) return
    let live = true
    fetchBoard({ owner: userId })
      .then((r) => live && setRows(r))
      .catch((err) => {
        console.warn('[trades] their listings:', err instanceof Error ? err.message : err)
        if (live) setRows([])
      })
    return () => {
      live = false
    }
  }, [open, userId, n])

  if (!open || !rows) return null
  return (
    <section className="flex flex-col gap-1.5">
      <ListHead count={rows.length}>{t('ui.trades.theirTrades')}</ListHead>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {rows.length === 0 && (
          <li className="bg-paper px-3 py-3 text-center font-pixel-sm text-[16px] text-muted shadow-ring-line">
            {t('ui.trades.theirNone')}
          </li>
        )}
        {rows.map((l) => (
          <ListingRow key={l.id} listing={l} why={takeWhy(l)} onOpen={() => setShown(l)} />
        ))}
      </ul>
      <ListingSheet listing={shown} onClose={() => setShown(null)} onChanged={() => setN((k) => k + 1)} />
    </section>
  )
}
