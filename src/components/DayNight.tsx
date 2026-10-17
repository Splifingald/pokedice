// Day and night in Johto (docs/31, docs/15 §30): the sun or the moon in the top bar (a tap shows the rules), its small
// twin on a fight's stage, the tags in an area's lists, and the rules pop-up. The engine decides the time
// (`dayTimeAt`, `areaDayTime`); these only show it.
import { useState } from 'react'
import {
  DAY_START_HOUR,
  NIGHT_START_HOUR,
  dayCareTutorialDue,
  dayNightRulesDue,
  donationDue,
  eventUnlockDue,
  extremeRulesDue,
  generalRulesDue,
  inviteRulesDue,
  leaderboardTutorialDue,
  markDayNightRulesSeen,
  nextTurnHour,
  regionOfferDue,
  tradeRulesDue,
  versusRulesDue,
  type DayTime,
} from '@/engine'
import { useT } from '@/i18n/react'
import { hourOfDay } from '@/lib/format'
import { useDayTime } from '@/store/dayTime'
import { mutateSave, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'

const ICON: Record<DayTime, 'daySun' | 'nightMoon'> = { day: 'daySun', night: 'nightMoon' }

/** The time's chip: a sky-blue tile with the sun by day, a night tile with the moon by night. */
export function DayNightChip({
  time,
  size = 22,
  className,
}: {
  time: DayTime
  size?: number
  className?: string
}) {
  return (
    <span
      className={cx(
        'pixel-corners inline-flex items-center justify-center',
        time === 'day' ? 'bg-sky shadow-ring-line' : 'light-scope bg-night',
        className,
      )}
      style={{ padding: Math.round(size / 5) }}
      data-day-time={time}
    >
      <PixelIcon name={ICON[time]} size={size} />
    </span>
  )
}

/** "It's day in Johto until 18:00". */
export function useDayNightLine(time: DayTime): string {
  const { t } = useT()
  return t(time === 'day' ? 'ui.dayNight.nowDay' : 'ui.dayNight.nowNight', {
    region: t('region.johto'),
    time: hourOfDay(nextTurnHour(time)),
  })
}

/** Top bar, far left, while in Johto with the switch on: the sun or the moon. A tap shows the rules (its INFO). */
export function DayNightButton() {
  const { t } = useT()
  const time = useDayTime()
  const [open, setOpen] = useState(false)
  const line = useDayNightLine(time ?? 'day')
  if (!time) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] shrink-0 items-center md:min-h-[36px]"
        aria-label={t('ui.dayNight.rulesLabel', { now: line })}
        title={line}
      >
        <DayNightChip time={time} size={22} />
      </button>
      <DayNightRulesModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * A fight's indicator, on the stage's top right in an area that keeps the time: the chip at a small size, with the
 * time's name for screen readers. Never on the plates or the Pokémon.
 */
export function BattleDayTime({ time }: { time: DayTime }) {
  const { t } = useT()
  return (
    <span
      className="pointer-events-none absolute right-1 top-1 z-10 leading-[0]"
      role="img"
      aria-label={t(time === 'day' ? 'ui.dayNight.day' : 'ui.dayNight.night')}
    >
      <DayNightChip time={time} size={16} />
    </span>
  )
}

/** By a Pokémon in an area's list: met only by day or only by night. Greyed while it's the other half. */
export function DayNightTag({
  time,
  now,
  size = 14,
}: {
  time: DayTime
  now?: DayTime | null
  size?: number
}) {
  const { t } = useT()
  const label = t(time === 'day' ? 'ui.dayNight.onlyDay' : 'ui.dayNight.onlyNight')
  return (
    <span className={cx('inline-flex leading-[0]', now && now !== time && 'opacity-50')} title={label}>
      <PixelIcon name={ICON[time]} size={size} title={label} />
    </span>
  )
}

/** The rules' banner: the day's sky on the left with its sun, the night's on the right with its moon and stars. */
function DayNightBanner() {
  return (
    <div className="absolute inset-0 grid grid-cols-2" aria-hidden>
      <span className="grid place-items-center bg-sky">
        <PixelIcon name="daySun" size={64} />
      </span>
      <span className="light-scope grid place-items-center bg-night">
        <PixelIcon name="nightMoon" size={64} />
      </span>
    </div>
  )
}

export function useDayNightRules(): RuleRow[] {
  const { t } = useT()
  const day = hourOfDay(DAY_START_HOUR)
  const night = hourOfDay(NIGHT_START_HOUR)
  return [
    {
      icon: 'daySun',
      title: t('ui.dayNight.rules.day.title', { from: day, to: night }),
      text: t('ui.dayNight.rules.day.text'),
    },
    {
      icon: 'nightMoon',
      title: t('ui.dayNight.rules.night.title', { from: night, to: day }),
      text: t('ui.dayNight.rules.night.text'),
    },
    { icon: 'dex', title: t('ui.dayNight.rules.where.title'), text: t('ui.dayNight.rules.where.text') },
  ]
}

/** Its rules (docs/15 §20): once, the first time in Johto with it on (Later / Let's go!), then from the top bar's chip. */
export function DayNightRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useDayNightRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.dayNight.title')}
      picture={<DayNightBanner />}
      icon="nightMoon"
      rules={rules}
      onGo={onGo}
    />
  )
}

const seen = () => mutateSave((s) => (s.dayNight?.rulesSeen ? null : markDayNightRulesSeen(s)))

/**
 * Once, between fights, the first time the player is in Johto with the switch on. It waits its turn behind Prof. Oak's
 * tutorials and the other one-time pop-ups, the General upgrades' last.
 */
export function DayNightRulesPopup() {
  const due = useGame(
    (s) =>
      !!s.save &&
      dayNightRulesDue(s.save, s.data) &&
      !dayCareTutorialDue(s.save, s.data) &&
      !leaderboardTutorialDue(s.save, s.data) &&
      !donationDue(s.save, s.data) &&
      !regionOfferDue(s.save, s.data) &&
      !eventUnlockDue(s.save, s.data) &&
      !versusRulesDue(s.save, s.data) &&
      !extremeRulesDue(s.save, s.data) &&
      !generalRulesDue(s.save, s.data) &&
      !(s.auth.status === 'signed_in' && (tradeRulesDue(s.save, s.data) || inviteRulesDue(s.save, s.data))),
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  if (!due) return null
  // Let's go! has nowhere to lead: the feature is the whole region. Both buttons just close it.
  return <DayNightRulesModal open={idle} onClose={seen} onGo={seen} />
}
