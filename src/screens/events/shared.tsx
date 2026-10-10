// What the special events' screens share (docs/18): each event's icon and names, its banner picture, and the rules the
// unlock pop-up lists. The rules read their numbers from the admin's config, so a rebalance shows up in the text.
import type { ReactNode } from 'react'
import type { EventId, GameData } from '@/engine'
import { PixelIcon, type IconName } from '@/components/icons'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
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

/** An event's picture, cropped to a strip: the page's banner and the pop-up's header. */
export function EventPicture({ id, data, className, children }: { id: EventId; data: GameData; className?: string; children?: ReactNode }) {
  return (
    <div className={cx('relative overflow-hidden bg-night', className)}>
      <img
        src={bannerUrl(data.config.events[id].banner)}
        alt=""
        className="pixelated absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: '50% 55%' }}
      />
      {children}
    </div>
  )
}
