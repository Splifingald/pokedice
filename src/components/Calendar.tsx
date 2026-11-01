// The gift calendar (docs/55; docs/15 §40): its doors, one per day (shut, today's, yesterday's last chance, opened,
// missed), the grid of them, a day's reward as a picture and in words, and its rules (the page's card the first time,
// INFO after). Which door is which, and what it holds, is the engine's (engine/calendar.ts).
import type { ReactElement } from 'react'
import { calendarGifts, LIVE_BANNERS, type CalendarDoor, type CalendarReward, type LiveEvent } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { cx } from '@/theme/util'
import { Chip } from './Chip'
import { GiftIcon, useGiftText } from './Gifts'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A day's reward in words: "Rare Candy ×3", "₽1,000", "Delibird Lv.10 ×2". */
export function useRewardText() {
  const { t } = useT()
  const gift = useGiftText()
  return (r: CalendarReward) => {
    const text = gift(calendarGifts(r)[0]!)
    return r.kind === 'pokemon' && r.qty > 1 ? `${text} ${t('ui.gift.qty', { n: r.qty })}` : text
  }
}

/** A day's reward as a picture: the item, the coin, the Pokémon (its ×n under it when more than one). */
export function CalendarRewardIcon({ reward, size = 32 }: { reward: CalendarReward; size?: number }) {
  const { t } = useT()
  const qty = reward.kind === 'pokemon' ? reward.qty : reward.kind === 'item' ? reward.qty : 1
  return (
    <span className="cal-what flex flex-col items-center gap-0.5" aria-hidden>
      <GiftIcon g={calendarGifts(reward)[0]!} size={size} />
      <span className="font-pixel-sm text-[15px] leading-none">
        {reward.kind === 'gold'
          ? `₽${reward.amount.toLocaleString('en')}`
          : qty > 1
            ? t('ui.gift.qty', { n: qty })
            : reward.kind === 'pokemon'
              ? t('ui.common.level.short', { n: reward.level })
              : ' '}
      </span>
    </span>
  )
}

/** Time to a moment, as the live events say it: "2d 5h" from a day on, else "5h 12m". */
export function until(ms: number): string {
  if (ms < DAY) return countdown(ms)
  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / HOUR)
  return h ? tr('ui.live.daysHours', { d, h }) : tr('ui.live.days', { d })
}

/**
 * One door. Today's and yesterday's are buttons (open it); the others say what they are: to come (when it opens),
 * opened (what it held, a check), missed (what it would have held, faded).
 */
export function CalendarDoorTile({
  door,
  now,
  onOpen,
  busy,
}: {
  door: CalendarDoor
  now: number
  onOpen?: (day: number) => void
  busy?: boolean
}) {
  const { t } = useT()
  const text = useRewardText()
  const { day, state, reward } = door
  if (state === 'today' || state === 'late')
    return (
      <button
        type="button"
        className={cx('cal-door light-scope w-full text-ink', state)}
        aria-label={t(state === 'today' ? 'ui.cal.door.today' : 'ui.cal.door.late', { n: day })}
        aria-disabled={busy || undefined}
        data-testid={`cal-door-${day}`}
        onClick={() => !busy && onOpen?.(day)}
      >
        <span className="cal-day" aria-hidden>
          {day}
        </span>
        <span className="flex flex-col items-center gap-1" aria-hidden>
          <PixelIcon name="gift" size={34} className="egg-shake mt-2" />
          {state === 'today' ? (
            <span className="text-[17px] leading-none tracking-[0.06em]">{t('ui.cal.open')}</span>
          ) : (
            <Chip tone="red" className="mx-1 max-w-full !whitespace-normal !px-1 text-center !text-[13px]">
              {t('ui.cal.lastChance')}
            </Chip>
          )}
        </span>
      </button>
    )
  if (state === 'shut')
    return (
      <div
        className="cal-door shut"
        role="img"
        aria-label={t('ui.cal.door.shut', { n: day, time: until(Math.max(0, door.opensAt - now)) })}
        data-testid={`cal-door-${day}`}
      >
        <span className="cal-tag text-[22px] leading-none" aria-hidden>
          {day}
        </span>
      </div>
    )
  const what = reward ? text(reward) : ''
  return (
    <div
      className={cx('cal-door', state === 'opened' ? 'opened' : 'hatched')}
      role="img"
      aria-label={t(state === 'opened' ? 'ui.cal.door.opened' : 'ui.cal.door.missed', { n: day, gift: what })}
      data-testid={`cal-door-${day}`}
    >
      <span className={cx('cal-day', state === 'missed' && 'text-muted')} aria-hidden>
        {day}
      </span>
      {state === 'opened' && <PixelIcon name="check" size={14} className="absolute right-1 top-1" />}
      <span className="mt-2 flex flex-col items-center gap-0.5">
        {reward && <CalendarRewardIcon reward={reward} size={30} />}
        {state === 'missed' && (
          <span className="font-pixel-sm text-[14px] leading-none text-muted" aria-hidden>
            {t('ui.cal.missed')}
          </span>
        )}
      </span>
    </div>
  )
}

/** Every door, day 1 first, in rows of 4 on a phone, 6 from 640 px. */
export function CalendarGrid({
  doors,
  now,
  onOpen,
  busy,
}: {
  doors: CalendarDoor[]
  now: number
  onOpen?: (day: number) => void
  busy?: boolean
}) {
  return (
    <ol className="m-0 grid list-none grid-cols-4 gap-2 p-0 sm:grid-cols-6">
      {doors.map((d) => (
        <li key={d.day} className="min-w-0">
          <CalendarDoorTile door={d} now={now} onOpen={onOpen} busy={busy} />
        </li>
      ))}
    </ol>
  )
}

/** The time of day a door opens, in the player's time ("00:00", "1:00 AM"). */
const doorTime = (e: LiveEvent) =>
  new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/** Its rules, with its numbers: a door a day (how many, at what time), the catch-up, where a gift goes. */
export function useCalendarRules(e: LiveEvent): RuleRow[] {
  const { t } = useT()
  return [
    {
      icon: 'calendar',
      title: t('ui.rules.cal.day.title'),
      text: t('ui.rules.cal.day.text', { n: e.calendar.days.length, time: doorTime(e) }),
    },
    { icon: 'gift', title: t('ui.rules.cal.late.title'), text: t('ui.rules.cal.late.text') },
    { icon: 'bag', title: t('ui.rules.cal.where.title'), text: t('ui.rules.cal.where.text') },
  ]
}

/** The calendar's picture: the event's own (its occasion's, Advent's winter town), as a rules banner. */
export function calendarPicture(e: LiveEvent): { src: string; focus?: string } {
  return { src: !e.banner ? LIVE_BANNERS.celebration : e.banner.includes('/') ? e.banner : artUrl(e.banner) }
}

/** INFO: the rules again (OK). */
export function CalendarRulesModal({
  open,
  onClose,
  e,
  name,
}: {
  open: boolean
  onClose: () => void
  e: LiveEvent
  name: string
}): ReactElement {
  const { t } = useT()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.rules.cardTitle', { name })}
      picture={calendarPicture(e)}
      icon="calendar"
      rules={useCalendarRules(e)}
    />
  )
}
