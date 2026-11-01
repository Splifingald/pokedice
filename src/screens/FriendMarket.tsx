// The Friend Market (docs/59; docs/15 §41), reached from the Friends page's Friendship card: Heart Scales earned by
// friendship streaks buy the week's shelf — the shiny of the week, then Friend Balls, Rare Candies and Talent Candies,
// each with its weekly limit. The rules the first time (a card at the top), INFO at the foot. The server prices,
// limits and pays; a purchase opens like a gift (GiftMoment) into the region being played.
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { friendshipRulesDue, friendshipWaits, marketRows, marketWeek, marketWeekEnds, utcDay } from '@/engine'
import { AccountButton } from '@/components/AccountButton'
import { until } from '@/components/Calendar'
import {
  FriendshipRulesModal,
  MarketHead,
  MarketItemCard,
  MarketShinyCard,
  useFriendshipRules,
} from '@/components/friends/Friendship'
import { PixelIcon } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { RulesCard } from '@/components/RulesCard'
import { useT } from '@/i18n/react'
import { buyMarket, loadFriendship, seeFriendshipRules, useFriendship } from '@/store/friendship'
import { useGame } from '@/store/game'
import { useGiftMoment } from '@/store/gifts'

export function FriendMarketScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth.status)
  const status = useFriendship((s) => s.status)
  const state = useFriendship((s) => s.state)
  const busy = useFriendship((s) => s.busy)
  const opening = useGiftMoment((s) => !!s.opening)
  const rules = useFriendshipRules()
  const [info, setInfo] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    void loadFriendship(true)
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!save) return null
  const waits = friendshipWaits(save, data)
  if (waits === 'off') return <Navigate to="/friends" replace />

  const head = <PageHead icon="navShop" title={t('ui.market.title')} onBack={() => navigate('/friends')} />
  const note = (text: string, extra?: ReactNode) => (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      {head}
      <div className="flex flex-col items-center gap-3 bg-paper px-3.5 py-4 text-center shadow-card">
        <PixelIcon name="heartScale" size={48} />
        <p className="m-0 text-[20px] leading-[1.15]">{text}</p>
        {extra}
      </div>
    </div>
  )
  if (waits === 'extreme') return note(t('ui.market.extreme'))
  if (auth === 'signed_out') return note(t('ui.market.signedOut'), <AccountButton />)
  if (waits === 'world') return note(t('ui.market.world'))
  if (!status)
    return note(
      state === 'error' ? t('ui.fship.failed') : t('ui.common.loading'),
      state === 'error' ? (
        <PixelButton size="sm" onClick={() => void loadFriendship(true)}>
          {t('ui.wipe.tryAgain')}
        </PixelButton>
      ) : undefined,
    )

  const week = status.week || marketWeek(utcDay(now))
  const rows = marketRows(data, week, status.bought)
  const shiny = rows.find((r) => r.kind === 'pokemon')
  const items = rows.filter((r) => r.kind === 'item')
  const restock = until(Math.max(0, marketWeekEnds(week) - now))
  const buy = (key: string) => (qty: number) => {
    if (!busy && !opening) void buyMarket(key, qty)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-4">
      {head}
      {friendshipRulesDue(save, data) && (
        <RulesCard title={t('ui.fship.title')} icon="heart" rules={rules} onDone={seeFriendshipRules} />
      )}
      <MarketHead balance={status.balance} restock={restock} />
      {shiny && (
        <MarketShinyCard
          row={shiny}
          balance={status.balance}
          busy={!!busy || opening}
          onBuy={buy('shiny')}
          restock={t('ui.market.nextShiny', { time: restock })}
        />
      )}
      <section aria-labelledby="market-items" className="flex flex-col gap-1.5">
        <h2 id="market-items" className="m-0 text-[24px] font-normal leading-none">
          {t('ui.market.shelf')}
        </h2>
        <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
          {items.map((r) => (
            <MarketItemCard
              key={r.key}
              row={r}
              balance={status.balance}
              busy={!!busy || opening}
              onBuy={buy(r.key)}
            />
          ))}
        </ul>
      </section>
      <p className="copy m-0 text-[18px] text-muted">{t('ui.market.earnMore')}</p>
      <InfoButton name={t('ui.fship.title')} onClick={() => setInfo(true)} />
      <FriendshipRulesModal open={info} onClose={() => setInfo(false)} />
    </div>
  )
}
