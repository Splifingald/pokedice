// Live events (docs/20), what players see: Home's squares (first among the event squares, one per event running), the
// pop-up once per event, and the pieces other screens show while they run: the Shiny Parade's chip where it applies,
// Cash Flow's "+50 %" on the purse and on the ₽ won (two at once add up). The Special Shop's sections are the Poké
// Mart's (screens/Shop.tsx).
import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import {
  calendarDoors,
  calendarNextAt,
  calendarReady,
  cashMultiplier,
  kitsHeld,
  liveCovers,
  liveLeft,
  livePopupDue,
  livePopupNext,
  queuedLives,
  liveShopRows,
  shinyBoost,
  type Area,
  type GameData,
  type LiveEvent,
  type SaveData,
} from '@/engine'
import { getLang, joinList, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { useMyTurn, useOnScreen } from '@/components/popupTurn'
import { countdown, money } from '@/lib/format'
import { useGame } from '@/store/game'
import { askPush, pushReady } from '@/lib/push'
import { markLivePopupSeen, useLive } from '@/store/live'
import { ugRulesSeen } from '@/store/underground'
import { UgCave, UgRulesModal } from '@/components/Underground'
import { HeadTag, WidgetRows, WIDGET_BANNER_H } from '@/screens/home/Widget'
import { cx } from '@/theme/util'
import { bannerUrl } from './shared'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Its title: the admin's custom one for this language (or English), else the type's own name. */
export function liveName(e: LiveEvent): string {
  return e.title[getLang()]?.trim() || e.title.en?.trim() || t(`ui.live.${e.type}.name`)
}

/** Time left: "2d 5h" from a day on, else the usual countdown ("5h 12m", "12:30"). */
export function liveTime(ms: number): string {
  if (ms < DAY) return countdown(ms)
  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / HOUR)
  return h ? t('ui.live.daysHours', { d, h }) : t('ui.live.days', { d })
}

const pct = (m: number) => Math.round((m - 1) * 100)
const regionName = (data: GameData, id: string | null) => data.regions.find((r) => r.id === id)?.name ?? id ?? ''
const areaNames = (data: GameData, ids: string[]) => ids.map((id) => data.areas.find((a) => a.id === id)?.name).filter((n): n is string => !!n)

/** What it does, in a line: "×5 shiny in Kanto", "3 items, for a while", "+50% on every ₽". */
export function liveSub(e: LiveEvent, data: GameData): string {
  if (e.type === 'underground') return t('ui.live.underground.sub')
  if (e.type === 'calendar') return t('ui.live.calendar.sub', { n: e.calendar.days.length })
  if (e.type === 'cash') return t('ui.live.cash.sub', { pct: pct(e.cash.multiplier) })
  if (e.type === 'shop') {
    const n = e.shop.items.length
    return t(`ui.live.shop.sub.${n === 1 ? 'one' : 'other'}`, { count: n })
  }
  const s = e.shiny
  if (s.scope === 'all') return t('ui.live.shiny.subAll', { n: s.multiplier })
  if (s.scope === 'region') return t('ui.live.shiny.subIn', { n: s.multiplier, place: regionName(data, s.regionId) })
  const names = areaNames(data, s.areaIds)
  return t('ui.live.shiny.subIn', { n: s.multiplier, place: names.length > 1 ? `${names[0]} +${names.length - 1}` : (names[0] ?? '') })
}

/**
 * A gift calendar's line on Home, for this player: the door to open now ("Day 5's gift is ready!", "Day 4: last
 * chance!", "2 gifts to open!"), else when the next opens, else that every door is done.
 */
export function calendarSub(save: SaveData, e: LiveEvent, now: number): string {
  const ready = calendarReady(save, e, now)
  if (ready.length > 1) return t('ui.cal.twoReady', { n: ready.length })
  if (ready[0]) return t(ready[0].state === 'late' ? 'ui.cal.lateNow' : 'ui.cal.readyNow', { n: ready[0].day })
  const next = calendarNextAt(e, now)
  if (next != null) return t('ui.cal.nextIn', { time: liveTime(next - now) })
  return t(calendarDoors(save, e, now).some((d) => d.state === 'missed') ? 'ui.cal.noMore' : 'ui.cal.allDone')
}

/** The date it ends, in the player's language and time: "Sat 12 Oct, 20:00". */
const endDate = (e: LiveEvent) =>
  new Date(e.end).toLocaleString(getLang(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** The type's tag: ×5 with a sparkle, SALE, +50% ₽. */
export function LiveTag({ e, className }: { e: LiveEvent; className?: string }) {
  const { t } = useT()
  if (e.type === 'shiny')
    return (
      <Chip tone="gold" className={className}>
        ×{e.shiny.multiplier}
        <PixelIcon name="sparkle" size={11} />
      </Chip>
    )
  if (e.type === 'shop')
    return (
      <Chip tone="red" className={cx('tracking-[0.04em]', className)}>
        {t('ui.live.sale')}
      </Chip>
    )
  if (e.type === 'underground')
    return (
      <Chip tone="dark" className={cx('tracking-[0.04em]', className)}>
        <PixelIcon name="pickaxeSm" size={11} />
        {t('ui.ug.tag')}
      </Chip>
    )
  if (e.type === 'calendar')
    return (
      <Chip tone="gold" className={cx('tracking-[0.04em]', className)}>
        <PixelIcon name="gift" size={12} />
        {t('ui.live.calendar.tag')}
      </Chip>
    )
  return (
    <Chip tone="green" className={className}>
      {t('ui.live.pct', { pct: pct(e.cash.multiplier) })} ₽
    </Chip>
  )
}

/** LIVE, its dot blinking. */
export function LiveBadge({ className, label = 'ui.live.live' }: { className?: string; label?: string }) {
  const { t } = useT()
  return (
    <Chip tone="red" className={cx('tracking-[0.06em]', className)}>
      <i className="lv-dot" aria-hidden />
      {t(label)}
    </Chip>
  )
}

/** The time left, as a gauge that drains; red in its last hours. */
export function LiveGauge({ share, hot, className }: { share: number; hot: boolean; className?: string }) {
  return (
    <span className={cx('lv-gauge relative block h-1.5 w-full', hot && 'hot', className)} aria-hidden>
      <i className="absolute inset-y-0 left-0 block" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
    </span>
  )
}

/** Its picture, darkened at the foot so white text reads on it. */
export function LivePicture({ e, className, children }: { e: LiveEvent; className?: string; children?: ReactNode }) {
  return (
    <span className={cx('lv-pic block overflow-hidden bg-night', className)} aria-hidden>
      {/* The Underground's cave is drawn in code when the admin picked no picture. */}
      {!e.banner && e.type === 'underground' && <UgCave className="absolute inset-0" />}
      {e.banner && <img src={bannerUrl(e.banner)} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" />}
      {children}
    </span>
  )
}

/** What floats over the picture: sparkles, falling coins, the shop's first items. */
export function LiveFx({ e, data, big }: { e: LiveEvent; data: GameData; big?: boolean }) {
  if (e.type === 'underground') return null
  // A gift calendar: three wrapped gifts bobbing (what's inside is each door's surprise).
  if (e.type === 'calendar')
    return (
      <span className={cx('lv-fx lv-shelf', big && 'big')} aria-hidden>
        {[0, 1, 2].map((i) => (
          <i key={i} style={{ ['--i' as string]: i }}>
            <PixelIcon name="gift" size={big ? 48 : 26} />
          </i>
        ))}
      </span>
    )
  if (e.type === 'shiny')
    return (
      <span className={cx('lv-fx lv-spk', big && 'big')} aria-hidden>
        {Array.from({ length: big ? 7 : 5 }, (_, i) => (
          <i key={i}>
            <PixelIcon name="sparkle" size={big ? 27 : 18} />
          </i>
        ))}
      </span>
    )
  if (e.type === 'cash')
    return (
      <span className={cx('lv-fx lv-coins', big && 'big')} aria-hidden>
        {Array.from({ length: big ? 5 : 3 }, (_, i) => (
          <i key={i} style={{ ['--i' as string]: i }}>
            <PixelIcon name="coin" size={big ? 32 : 24} />
          </i>
        ))}
      </span>
    )
  return (
    <span className={cx('lv-fx lv-shelf', big && 'big')} aria-hidden>
      {e.shop.items.slice(0, 3).map((r, i) => (
        <i key={r.key} style={{ ['--i' as string]: i }}>
          <ItemSprite item={data.items[r.key]} size={big ? 56 : 30} />
        </i>
      ))}
    </span>
  )
}

/** Asked from Home's square: that event's pop-up again (its id). */
const usePopupAsked = create<{ asked: string | null }>(() => ({ asked: null }))
export const openLivePopup = (id: string) => usePopupAsked.setState({ asked: id })

/** A gift calendar's page, for that calendar (two could run at once). */
export const calendarPath = (e: LiveEvent) => `/calendar?id=${encodeURIComponent(e.id)}`

/** A live card's label key: what a tap opens (the shop, the Underground, the calendar, else its pop-up). */
export const liveLabel = (e: LiveEvent): string =>
  e.type === 'shop'
    ? 'ui.live.labelShop'
    : e.type === 'underground'
      ? 'ui.live.labelUnderground'
      : e.type === 'calendar'
        ? 'ui.live.labelCalendar'
        : 'ui.live.label'

/** Home's squares: one per live event running for this player, the earliest started first. */
export function LiveSquares() {
  const { lives, now } = useLive(1000)
  if (now == null) return null
  return (
    <>
      {lives.map((e) => (
        <LiveSquare key={e.id} live={e} now={now} />
      ))}
    </>
  )
}

/**
 * Home's square for a live event: the same frame and rows as the other squares, its picture behind all of it. A tap
 * opens the shop for a Special Shop, else its pop-up again.
 */
export function LiveSquare({ live, now }: { live: LiveEvent; now: number }) {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const ug = useGame((s) => s.save?.underground)
  const left = liveLeft(live, now)
  const name = liveName(live)
  const shop = live.type === 'shop'
  const dig = live.type === 'underground'
  const cal = live.type === 'calendar'
  // The Underground's square says what the player holds: kits, and when the next free one comes.
  const kits = dig && ug?.eventId === live.id ? kitsHeld(ug) : null
  const save = useGame((s) => s.save)
  const sub =
    cal && save
      ? calendarSub(save, live, now)
      : kits == null
        ? liveSub(live, data)
        : ug!.freeAt != null
          ? t('ui.live.underground.kitsNext', { n: kits, time: countdown(Math.max(0, ug!.freeAt - now)) })
          : t('ui.live.underground.kits', { n: kits })
  const time = t('ui.live.endsIn', { time: liveTime(left.ms) })
  const hot = left.ms < 3 * HOUR
  return (
    <button
      type="button"
      onClick={() =>
        shop ? navigate('/shop') : dig ? navigate('/underground') : cal ? navigate(calendarPath(live)) : openLivePopup(live.id)
      }
      aria-label={t(liveLabel(live), { name, sub, time })}
      data-testid="live-square"
      className="pixel-panel lv-square relative isolate flex min-w-0 flex-col gap-[5px] overflow-hidden px-2.5 pb-2.5 pt-2 text-left"
    >
      <LivePicture e={live} className="absolute inset-0 -z-10" />
      <span className="lv-ink flex w-full items-center gap-1.5 text-[19px] leading-none">
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <HeadTag>
          <LiveTag e={live} />
        </HeadTag>
      </span>
      <span className="relative block w-full" style={{ aspectRatio: `288 / ${WIDGET_BANNER_H}` }}>
        <LiveFx e={live} data={data} />
        <LiveBadge className="absolute left-0 top-0" />
      </span>
      <WidgetRows
        top={<span className="lv-ink truncate text-[20px] leading-none">{sub}</span>}
        meter={<LiveGauge share={left.share} hot={hot} />}
        bottom={<span className={cx('lv-ink', hot ? 'text-[#ffb3a8]' : 'text-gold-light')}>{time}</span>}
      />
    </button>
  )
}

/** The pop-up's rows: an icon, a short title, a line, with the event's numbers. */
function LiveRules({ e }: { e: LiveEvent }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const rows: { icon: ReactNode; title: string; text: string }[] = []
  const icon = (name: 'sparkle' | 'ball' | 'coin' | 'navShop') => <PixelIcon name={name} size={24} />
  if (e.type === 'shiny') {
    const s = e.shiny
    const place = s.scope === 'region' ? regionName(data, s.regionId) : joinList(areaNames(data, s.areaIds))
    rows.push({
      icon: icon('sparkle'),
      title: t('ui.live.rules.shiny.title', { n: s.multiplier }),
      text: s.scope === 'all' ? t('ui.live.rules.shiny.all', { n: s.multiplier }) : t('ui.live.rules.shiny.in', { n: s.multiplier, place }),
    })
    rows.push({ icon: icon('ball'), title: t('ui.live.rules.wild.title'), text: t('ui.live.rules.wild.text') })
  } else if (e.type === 'cash') {
    rows.push({ icon: icon('coin'), title: t('ui.live.rules.cash.title', { pct: pct(e.cash.multiplier) }), text: t('ui.live.rules.cash.text') })
    rows.push({ icon: icon('navShop'), title: t('ui.live.rules.sell.title'), text: t('ui.live.rules.sell.text') })
  } else if (save) {
    const shelf = liveShopRows(save, data, e)
    const never = shelf.filter((r) => r.usual == null)
    const sale = shelf.filter((r) => r.usual != null && r.price < r.usual)
    const limited = shelf.filter((r) => r.limit != null)
    if (never.length)
      rows.push({
        icon: <ItemSprite item={never[0]!.item} size={32} />,
        title: t('ui.live.rules.never.title'),
        text: t('ui.live.rules.never.text', { items: joinList(never.map((r) => r.item.name)) }),
      })
    if (sale.length)
      rows.push({
        icon: <ItemSprite item={sale[0]!.item} size={32} />,
        title: t('ui.live.rules.sale.title'),
        text: joinList(sale.map((r) => t('ui.live.rules.sale.item', { item: r.item.name, price: money(r.price), usual: money(r.usual!) }))),
      })
    if (limited.length)
      rows.push({
        icon: <span className="font-pixel-sm text-[16px] leading-none">×{limited[0]!.limit}</span>,
        title: t('ui.live.rules.limit.title'),
        text: t('ui.live.rules.limit.text', { items: joinList(limited.map((r) => t('ui.live.rules.limit.item', { n: r.limit!, item: r.item.name }))) }),
      })
  }
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {rows.slice(0, 3).map((r) => (
        <li key={r.title} className="flex items-center gap-2.5">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
            {r.icon}
          </span>
          <span className="grid gap-0.5 leading-tight">
            <b className="text-[19px] font-normal leading-none">{r.title}</b>
            <small className="font-pixel-sm text-[16px] text-muted">{r.text}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A live event's pop-up: once per event, the first time the player is between fights while it runs, on its turn in
 * the one-time pop-ups' queue (engine/popups.ts: after the small world's, never in the Mart); again from Home's square.
 * With several running, one after the other, the earliest started first. OK; a Special Shop adds "Go to the shop".
 */
export function LivePopup() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const asked = usePopupAsked((s) => s.asked)
  const turn = useMyTurn('live')
  const idle = useGame((s) => s.run.phase === 'idle')
  const { lives, now } = useLive(asked ? 1000 : 5000)
  // The queue's turn is for the live events still announced by a pop-up: the Underground's rules are its page's card
  // now (docs/43 §7), so it never takes another event's turn.
  const next = save ? livePopupNext(save, queuedLives(lives)) : null
  const live = (asked && lives.find((e) => e.id === asked)) || next
  // The Underground's page shows its rules itself, as a card at its top (docs/43 §7): never this pop-up over it.
  const path = useLocation().pathname
  const onItsPage = live?.type === 'underground' && path.startsWith('/underground')
  const open = !!live && !!save && now != null && !onItsPage && ((idle && !!asked) || (turn && !!next))
  useOnScreen('live', open)
  if (!live || !save || now == null) return null
  const close = () => {
    usePopupAsked.setState({ asked: null })
    if (livePopupDue(save, live)) markLivePopupSeen(live)
    if (live.type === 'underground') ugRulesSeen()
    // Push notifications' question, once (docs/27): the next live event can be announced as it starts.
    if (pushReady(data)) askPush('live')
  }
  // The Underground's pop-up is its rules (docs/15 §20): Later, or Let's go! to its page.
  if (live.type === 'underground')
    return (
      <UgRulesModal
        key={live.id}
        open={open}
        onClose={close}
        onGo={() => {
          close()
          navigate('/underground')
        }}
        data={data}
      />
    )
  const left = liveLeft(live, now)
  const big = live.type === 'shiny' ? `×${live.shiny.multiplier}` : live.type === 'cash' ? t('ui.live.pct', { pct: pct(cashMultiplier(live)) }) : null
  return (
    <Modal key={live.id} open={open} onClose={close} title={liveName(live)} className="max-w-md">
      <div className="flex flex-col gap-3">
        <span className="relative -mx-4 block h-[128px] shadow-[0_3px_0_rgb(var(--c-edge)),0_-2px_0_rgb(var(--c-edge))]">
          <LivePicture e={live} className="absolute inset-0">
            <LiveFx e={live} data={data} big />
            {big && <span className={cx('lv-big', live.type === 'cash' && 'cash')}>{big}</span>}
          </LivePicture>
          <LiveBadge label="ui.live.liveEvent" className="absolute left-2.5 top-2.5" />
        </span>
        <div className="grid gap-1.5">
          <p className="m-0 font-pixel-sm text-[16px] leading-none text-muted">
            {t('ui.live.leftUntil', { time: liveTime(left.ms), date: endDate(live) })}
          </p>
          <LiveGauge share={left.share} hot={left.ms < 3 * HOUR} className="lv-gauge-light" />
        </div>
        <LiveRules e={live} />
        {live.type === 'shop' ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5 pt-1">
            <PixelButton onClick={close}>{t('ui.common.ok')}</PixelButton>
            <PixelButton
              variant="primary"
              onClick={() => {
                close()
                navigate('/shop')
              }}
            >
              {t('ui.live.goShop')}
            </PixelButton>
          </div>
        ) : (
          <PixelButton variant="primary" onClick={close}>
            {t('ui.common.ok')}
          </PixelButton>
        )}
      </div>
    </Modal>
  )
}

/** " · Shiny odds ×5 here" for a label, where a Shiny Parade covers the area (a chip inside a button isn't read out). */
export function useParadeLabel(area: Area | undefined): string {
  const { t } = useT()
  const { lives } = useLive(15_000)
  return liveCovers(lives, area) ? ` · ${t('ui.live.chip.shiny', { n: shinyBoost(lives, area) })}` : ''
}

/** The Shiny Parade's chip where it applies: ×5 and a sparkle. */
export function ShinyParadeChip({ area, className }: { area: Area | undefined; className?: string }) {
  const { t } = useT()
  const { lives } = useLive(15_000)
  if (!liveCovers(lives, area)) return null
  const n = shinyBoost(lives, area)
  const label = t('ui.live.chip.shiny', { n })
  return (
    <span role="img" aria-label={label} title={label} className={cx('inline-flex shrink-0', className)}>
      <Chip tone="gold">
        ×{n}
        <PixelIcon name="sparkle" size={11} />
      </Chip>
    </span>
  )
}

/** Cash Flow's "+50%" (every one running, added up): on the purse, and beside ₽ just won. */
export function CashChip({ className }: { className?: string }) {
  const { t } = useT()
  const { lives } = useLive(15_000)
  if (!lives.some((e) => e.type === 'cash')) return null
  const p = pct(cashMultiplier(lives))
  const label = t('ui.live.chip.cash', { pct: p })
  return (
    <span role="img" aria-label={label} title={label} className={cx('inline-flex shrink-0', className)}>
      <Chip tone="green">{t('ui.live.pct', { pct: p })}</Chip>
    </span>
  )
}
