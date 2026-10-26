// What the special events' screens share (docs/18): each event's icon and names, its banner picture, and the rules the
// unlock pop-up lists. The rules read their numbers from the admin's config, so a rebalance shows up in the text.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ticketRules, type EventId, type GameData, type WheelReward } from '@/engine'
import { PixelIcon, type IconName } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { ART_CROP, ART_K, ART_PX, artUrl, horizonOf } from '@/fx/areaArt'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { getLang, t as tr } from '@/i18n'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** A raid day ('YYYY-MM-DD', UTC) as the player reads dates: "Sat 22 Apr", in their language. */
export function raidDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat(getLang(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

/** A raid day's calendar page, in the player's language: weekday "Sat", day "22", month "Oct". */
export function raidDateParts(day: string): { weekday: string; date: string; month: string } {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(y, m - 1, d))
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(getLang(), { ...o, timeZone: 'UTC' }).format(at)
  return { weekday: part({ weekday: 'short' }), date: part({ day: 'numeric' }), month: part({ month: 'short' }) }
}

/** Each event's icon (Home's square, the pop-up's banner tag). */
export const EVENT_ICON: Record<EventId, IconName> = { wheel: 'coin', raid: 'star', rebattle: 'trophy' }

/** The banner's picture: an area picture's key (public/area-art), or a path once an event has its own art. */
export const bannerUrl = (key: string) => (key.includes('/') ? key : artUrl(key))

/** A rule's icon. */
const RULE_ICON: Record<string, IconName> = {
  'wheel.daily': 'coin',
  'wheel.prizes': 'masterball',
  'wheel.odds': 'book',
  'raid.daily': 'star',
  'raid.sides': 'friends',
  'raid.bars': 'sword',
  'raid.catch': 'ball',
  'rebattle.tiers': 'trophy',
  'rebattle.gauntlet': 'potion',
  'rebattle.gold': 'coin',
}

type Params = Record<string, string | number>

/** The numbers the rules of an event read, from the config (and the item names, already in the player's language). */
export function ruleParams(id: EventId, data: GameData): Params {
  if (id === 'wheel') {
    const wheel = data.config.events.wheel
    const { everyMs, cap, price } = ticketRules(wheel)
    const pct = (n: number) => `${+n.toFixed(2)} %`
    return {
      hours: Math.round((everyMs / 3_600_000) * 10) / 10,
      cap,
      price: money(price),
      prizes: wheel.slices.filter((p) => p.count > 0 && p.odds > 0).map((p) => rewardName(p.reward, data)).join(', '),
      chain: (wheel.jackpot ?? []).map((j) => `${rewardName(j.reward, data)} ${pct(j.odds)}`).join(' → '),
    }
  }
  if (id === 'raid') {
    // The raid's type matchups, as the admin set them: your super-effective hits, its resisted and blocked ones.
    const { sideTypes, bossTypes } = data.config.events.raid
    const n = (x: number) => x.toLocaleString(getLang())
    return { super: n(sideTypes.super), resisted: n(bossTypes.resisted), immune: n(bossTypes.immune) }
  }
  return {}
}

/** The unlock pop-up's rule rows: an icon, a short title, a line or two. */
export function EventRules({ id, data }: { id: EventId; data: GameData }) {
  const { t } = useT()
  const params = ruleParams(id, data)
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {data.config.events[id].rules.map((rule) => (
        <li key={rule} className="flex items-center gap-2.5">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
            <PixelIcon name={RULE_ICON[rule] ?? 'star'} size={24} />
          </span>
          <span className="grid gap-0.5 leading-tight">
            <b className="text-[19px] font-normal leading-none">{t(`ui.events.rules.${rule}.title`)}</b>
            <small className="font-pixel-sm text-[16px] text-muted">{t(`ui.events.rules.${rule}.text`, params)}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** An event's rules in a pop-up, as the unlock pop-up showed them, with the admin's numbers: INFO, or a page's first open. */
export function EventRulesModal({ id, open, onClose }: { id: EventId; open: boolean; onClose: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <Modal open={open} onClose={onClose} title={t(`ui.events.${id}.name`)} className="max-w-md">
      <div className="flex flex-col gap-3">
        <EventPicture id={id} data={data} className="-mx-4 h-[124px] shadow-[0_3px_0_rgb(var(--c-edge)),0_-2px_0_rgb(var(--c-edge))]" />
        <EventRules id={id} data={data} />
        <PixelButton variant="primary" onClick={onClose}>
          {t('ui.common.ok')}
        </PixelButton>
      </div>
    </Modal>
  )
}

/** The Info button at the foot of an event's page (the wheel's look): its rules again. */
export function EventInfo({ id }: { id: EventId }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const name = t(`ui.events.${id}.name`)
  return (
    <>
      <button type="button" className="ev-info w-full" onClick={() => setOpen(true)} aria-label={t('ui.events.infoLabel', { name })}>
        {t('ui.events.info')}
      </button>
      <EventRulesModal id={id} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * An event's picture, cropped to a strip: the page's banner and the pop-up's header. An area picture keeps its horizon
 * a little below the strip's middle at any width, the way the area lists cut theirs; the event's own art is centred.
 */
export function EventPicture({ id, data, className, children }: { id: EventId; data: GameData; className?: string; children?: ReactNode }) {
  const key = data.config.events[id].banner
  const geo = ART_GEOMETRY[key]
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => e && setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // An event's own picture is composed for a strip from its middle; an area picture centres on its horizon.
  let objectPosition = '50% 50%'
  if (geo && box && box.w > box.h) {
    // The picture is square, drawn box.w wide: its horizon (in picture pixels) lands 60 % down the strip.
    const horizon = (ART_CROP + horizonOf(geo) * ART_K) * (box.w / ART_PX)
    const top = Math.min(0, Math.max(box.h - box.w, Math.round(box.h * 0.6 - horizon)))
    objectPosition = `50% ${top}px`
  }
  return (
    <div ref={ref} className={cx('relative overflow-hidden bg-night', className)}>
      <img src={bannerUrl(key)} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" style={{ objectPosition }} />
      {children}
    </div>
  )
}

/** A wheel prize in words: "₽10", "Poké Ball", "2 × Great Ball", "Shiny Porygon". */
export function rewardName(r: WheelReward, data: GameData): string {
  if (r.kind === 'gold') return money(r.amount)
  if (r.kind === 'pokemon') {
    const name = data.species[r.dex]?.name ?? `#${r.dex}`
    return r.shiny ? tr('ui.events.raid.shinyName', { name }) : name
  }
  const name = data.items[r.key]?.name ?? r.key
  return r.qty > 1 ? `${r.qty} × ${name}` : name
}

/** A wheel prize's picture: the item's, the Pokémon's (in its shiny colours), or a coin for ₽. */
export function RewardIcon({ reward, data, size }: { reward: WheelReward; data: GameData; size: number }) {
  if (reward.kind === 'gold') return <PixelIcon name="coin" size={Math.round(size * 0.7)} />
  if (reward.kind === 'pokemon') return <SpriteImg dex={reward.dex} shiny={!!reward.shiny} size={size} alt="" />
  return <ItemSprite item={data.items[reward.key]} size={size} />
}
