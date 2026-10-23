// Live events (docs/20), what players see: Home's square (first among the event squares), the pop-up once per event,
// and the pieces other screens show while one runs: the Shiny Parade's chip where it applies, Cash Flow's "+50 %" on
// the purse and on the ₽ won. The Special Shop's section is the Poké Mart's (screens/Shop.tsx).
import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import {
  cashMultiplier,
  dayCareTutorialDue,
  donationDue,
  eventUnlockDue,
  inWorld,
  kitsHeld,
  leaderboardTutorialDue,
  liveCovers,
  liveLeft,
  livePopupDue,
  liveShopRows,
  regionOfferDue,
  shinyBoost,
  generalRulesDue,
  versusRulesDue,
  worldFor,
  worldPopupDue,
  type Area,
  type GameData,
  type LiveEvent,
} from '@/engine'
import { getLang, joinList, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { countdown, money } from '@/lib/format'
import { useGame } from '@/store/game'
import { askPush, pushReady } from '@/lib/push'
import { markLivePopupSeen, useLive } from '@/store/live'
import { ugRulesSeen } from '@/store/underground'
import { UgCave, UgRulesModal } from '@/components/Underground'
import { serverNow } from '@/store/serverTime'
import { useRaidGifts } from '@/store/raidGifts'
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

/** Asked from Home's square: the pop-up again. */
const usePopupAsked = create<{ asked: boolean }>(() => ({ asked: false }))
export const openLivePopup = () => usePopupAsked.setState({ asked: true })

/**
 * Home's square for the live event: the same frame and rows as the other squares, its picture behind all of it. A tap
 * opens the shop for a Special Shop, else its pop-up again.
 */
export function LiveSquare() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const ug = useGame((s) => s.save?.underground)
  const { live, now } = useLive(1000)
  if (!live || now == null) return null
  const left = liveLeft(live, now)
  const name = liveName(live)
  const shop = live.type === 'shop'
  const dig = live.type === 'underground'
  // The Underground's square says what the player holds: kits, and when the next free one comes.
  const kits = dig && ug?.eventId === live.id ? kitsHeld(ug) : null
  const sub =
    kits == null
      ? liveSub(live, data)
      : ug!.freeAt != null
        ? t('ui.live.underground.kitsNext', { n: kits, time: countdown(Math.max(0, ug!.freeAt - now)) })
        : t('ui.live.underground.kits', { n: kits })
  const time = t('ui.live.endsIn', { time: liveTime(left.ms) })
  const hot = left.ms < 3 * HOUR
  return (
    <button
      type="button"
      onClick={() => (shop ? navigate('/shop') : dig ? navigate('/underground') : openLivePopup())}
      aria-label={t(shop ? 'ui.live.labelShop' : dig ? 'ui.live.labelUnderground' : 'ui.live.label', { name, sub, time })}
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
            <small className="font-pixel-sm text-[15px] text-muted">{r.text}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The live event's pop-up: once per event, the first time the player is between fights while it runs, after Prof.
 * Oak's tutorials and the other pop-ups; again from Home's square. OK; a Special Shop adds "Go to the shop".
 */
export function LivePopup() {
  const { t } = useT()
  const navigate = useNavigate()
  const onShop = useLocation().pathname.startsWith('/shop')
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const asked = usePopupAsked((s) => s.asked)
  const gifts = useRaidGifts((s) => s.gifts.length)
  const others = useGame(
    (s) =>
      !s.save ||
      dayCareTutorialDue(s.save, s.data) ||
      leaderboardTutorialDue(s.save, s.data) ||
      donationDue(s.save, s.data) ||
      regionOfferDue(s.save, s.data) ||
      !!eventUnlockDue(s.save, s.data) ||
      versusRulesDue(s.save, s.data) ||
      generalRulesDue(s.save, s.data) ||
      // A small world's pop-up (priority 1) goes first.
      (!inWorld(s.save, s.data) && worldPopupDue(s.save, worldFor(s.save, s.data, serverNow()))),
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  const { live, now } = useLive(asked ? 1000 : 5000)
  if (!live || !save || now == null) return null
  const due = livePopupDue(save, live) && !others && !gifts && !onShop
  const open = idle && (asked || due)
  const close = () => {
    usePopupAsked.setState({ asked: false })
    if (livePopupDue(save, live)) markLivePopupSeen(live)
    if (live.type === 'underground') ugRulesSeen()
    // Push notifications' question, once (docs/27): the next live event can be announced as it starts.
    if (pushReady(data)) askPush('live')
  }
  // The Underground's pop-up is its rules (docs/15 §20): Later, or Let's go! to its page.
  if (live.type === 'underground')
    return (
      <UgRulesModal
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
    <Modal open={open} onClose={close} title={liveName(live)} className="max-w-md">
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
  const { live } = useLive(15_000)
  return liveCovers(live, area) ? ` · ${t('ui.live.chip.shiny', { n: shinyBoost(live, area) })}` : ''
}

/** The Shiny Parade's chip where it applies: ×5 and a sparkle. */
export function ShinyParadeChip({ area, className }: { area: Area | undefined; className?: string }) {
  const { t } = useT()
  const { live } = useLive(15_000)
  if (!liveCovers(live, area)) return null
  const n = shinyBoost(live, area)
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

/** Cash Flow's "+50%": on the purse, and beside ₽ just won. */
export function CashChip({ className }: { className?: string }) {
  const { t } = useT()
  const { live } = useLive(15_000)
  if (live?.type !== 'cash') return null
  const p = pct(cashMultiplier(live))
  const label = t('ui.live.chip.cash', { pct: p })
  return (
    <span role="img" aria-label={label} title={label} className={cx('inline-flex shrink-0', className)}>
      <Chip tone="green">{t('ui.live.pct', { pct: p })}</Chip>
    </span>
  )
}
