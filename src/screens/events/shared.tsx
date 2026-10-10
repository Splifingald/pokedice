// What the special events' screens share (docs/18): each event's icon and names, its banner picture, and the rules the
// unlock pop-up lists. The rules read their numbers from the admin's config, so a rebalance shows up in the text.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { canSpin, msToUtcMidnight, utcDay, type EventId, type GameData, type WheelReward } from '@/engine'
import { PixelIcon, type IconName } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { ART_CROP, ART_K, ART_PX, artUrl, horizonOf } from '@/fx/areaArt'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useGame } from '@/store/game'
import { useServerNow } from '@/store/serverTime'
import { cx } from '@/theme/util'

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
    const prizes = data.config.events.wheel.prizes.filter((p) => p.count > 0 && p.odds > 0)
    const total = prizes.reduce((n, p) => n + p.count * p.odds, 0) || 1
    const name = (p: (typeof prizes)[number]) =>
      p.reward.kind === 'gold' ? money(p.reward.amount) : (data.items[p.reward.key]?.name ?? p.reward.key)
    const rarest = [...prizes].sort((a, b) => a.count * a.odds - b.count * b.odds)[0]
    return {
      prizes: prizes.map(name).join(', '),
      rarest: rarest ? name(rarest) : '',
      chance: rarest ? +((rarest.count * rarest.odds * 100) / total).toFixed(1) : 0,
    }
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
            <small className="font-pixel-sm text-[15px] text-muted">{t(`ui.events.rules.${rule}.text`, params)}</small>
          </span>
        </li>
      ))}
    </ul>
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

/** A wheel prize in words: "₽10", "Poké Ball", "2 × Great Ball". */
export function rewardName(r: WheelReward, data: GameData): string {
  if (r.kind === 'gold') return money(r.amount)
  const name = data.items[r.key]?.name ?? r.key
  return r.qty > 1 ? `${r.qty} × ${name}` : name
}

/** A wheel prize's picture: the item's, or a coin for ₽. */
export function RewardIcon({ reward, data, size }: { reward: WheelReward; data: GameData; size: number }) {
  return reward.kind === 'gold' ? (
    <PixelIcon name="coin" size={Math.round(size * 0.7)} />
  ) : (
    <ItemSprite item={data.items[reward.key]} size={size} />
  )
}

/**
 * Today's spin, on the server's clock: `known` false while the real time hasn't come back yet (offline), then whether
 * the free spin is there and how long until the next one. Re-read every `ms`.
 */
export function useWheelDay(ms = 1000): { known: false } | { known: true; day: string; ready: boolean; msLeft: number } {
  const now = useServerNow(ms)
  const save = useGame((s) => s.save)
  if (now == null || !save) return { known: false }
  const day = utcDay(now)
  return { known: true, day, ready: canSpin(save, day), msLeft: msToUtcMidnight(now) }
}
