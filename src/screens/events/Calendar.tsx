// The gift calendar's page (docs/55; docs/15 §40), reached from Home's live card: its picture and time left, its rules
// the first time (a card at the top), the doors, what's opened and missed, and in the dock the door to open now (or
// when the next one opens) with INFO. A door opens into the gifts' own opening, full screen. Every rule is the engine's.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  calendarDoors,
  calendarNextAt,
  calendarReady,
  calendarRulesDue,
  liveLeft,
  LIVE_BANNERS,
  newLiveEvent,
  type LiveEvent,
} from '@/engine'
import { CalendarGrid, CalendarRulesModal, until, useCalendarRules } from '@/components/Calendar'
import { BackButton } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { InfoButton } from '@/components/RulesModal'
import { RulesCard } from '@/components/RulesCard'
import { useT } from '@/i18n/react'
import { calendarRulesSeen, openCalendarDoor, useCalendars } from '@/store/calendar'
import { useGame } from '@/store/game'
import { useGiftMoment } from '@/store/gifts'
import { StagePanel } from './layout'
import { LivePicture, liveName, liveTime } from './live'

/** Outside a calendar (or before its content arrives): a picture, a line, back Home. */
export function CalendarClosed() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="relative -mx-3 -mt-4 min-h-[132px] overflow-hidden bg-night shadow-[0_2px_0_rgb(var(--c-edge))]">
        <img
          src={LIVE_BANNERS.celebration}
          alt=""
          className="pixelated absolute inset-0 h-full w-full object-cover"
        />
        <div className="pixel-plate absolute left-2 top-2 z-[1] flex items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
          <BackButton onClick={() => navigate('/home')} />
          <h1 className="m-0 text-[24px] font-normal leading-none">{t('ui.live.calendar.name')}</h1>
        </div>
      </div>
      <p className="copy m-0 text-muted" role="status">
        {t('ui.cal.closed')}
      </p>
      <PixelButton variant="primary" onClick={() => navigate('/home')}>
        {t('ui.ug.home')}
      </PixelButton>
    </div>
  )
}

export function CalendarScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const busy = useGiftMoment((s) => s.busy || !!s.opening)
  const { calendars, now } = useCalendars(1000)
  const [info, setInfo] = useState(false)
  const cal = calendars.find((e) => e.id === params.get('id')) ?? calendars[0]
  // Read before any return (hooks run in the same order every time); a placeholder while there's no calendar.
  const rules = useCalendarRules(cal ?? PLACEHOLDER)
  if (now == null || !save) return <p className="copy p-3 text-muted">{t('ui.common.loading')}</p>
  if (!cal) return <CalendarClosed />

  const name = liveName(cal)
  const doors = calendarDoors(save, cal, now)
  const ready = calendarReady(save, cal, now)
  const next = calendarNextAt(cal, now)
  const opened = doors.filter((d) => d.state === 'opened').length
  const missed = doors.filter((d) => d.state === 'missed').length
  const left = liveLeft(cal, now)
  const first = ready[0]
  const open = (day: number) => {
    if (!busy) openCalendarDoor(cal.id, day)
  }

  return (
    <StagePanel
      head={
        <div className="flex flex-col gap-3">
          <div className="relative -mx-3 -mt-4 h-[104px] shadow-[0_2px_0_rgb(var(--c-edge))] [@media(min-height:740px)]:h-[132px] lg:mx-0 lg:mt-0 lg:h-[132px] lg:shadow-card">
            <LivePicture e={cal} className="absolute inset-0" />
            <div className="pixel-plate absolute left-2 top-2 z-[1] flex max-w-[calc(100%-16px)] items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
              <BackButton onClick={() => navigate('/home')} />
              <span className="grid min-w-0 gap-0.5">
                <h1 className="m-0 truncate text-[24px] font-normal leading-none">{name}</h1>
                <small className="truncate text-[16px] leading-none text-muted">
                  {t('ui.live.endsIn', { time: liveTime(left.ms) })}
                </small>
              </span>
            </div>
          </div>
          {/* Its rules where they apply (docs/43 §7): a card at the top until GOT IT; INFO at the foot again. */}
          {calendarRulesDue(save, data, now) && (
            <RulesCard title={name} icon="calendar" rules={rules} onDone={calendarRulesSeen} />
          )}
        </div>
      }
      stage={
        <section aria-labelledby="cal-doors" className="pixel-panel flex flex-col gap-2 p-3 lg:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h2 id="cal-doors" className="m-0 text-[24px] font-normal leading-none">
              {t('ui.cal.doors')}
            </h2>
            <span className="font-pixel-sm text-[16px] text-muted" data-testid="cal-progress">
              {missed
                ? t('ui.cal.progressMissed', { opened, total: doors.length, missed })
                : t('ui.cal.progress', { opened, total: doors.length })}
            </span>
          </div>
          <CalendarGrid doors={doors} now={now} onOpen={open} busy={busy} />
        </section>
      }
      panel={
        <section
          aria-labelledby="cal-now"
          className="flex items-center gap-3 bg-cream p-3 shadow-card-gold"
          data-testid="cal-now"
        >
          <PixelIcon
            name={first ? 'gift' : 'calendar'}
            size={40}
            className={first ? 'egg-shake' : undefined}
          />
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 id="cal-now" className="m-0 text-[22px] font-normal leading-none">
              {first
                ? t(first.state === 'late' ? 'ui.cal.lateNow' : 'ui.cal.readyNow', { n: first.day })
                : next != null
                  ? t('ui.cal.nextIn', { time: until(next - now) })
                  : t(missed ? 'ui.cal.noMore' : 'ui.cal.allDone')}
            </h2>
            <span className="font-pixel-sm text-[16px] leading-tight text-muted">
              {ready.length > 1 ? t('ui.cal.twoReady', { n: ready.length }) : t('ui.cal.where')}
            </span>
          </div>
        </section>
      }
      dock={
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          {first ? (
            <PixelButton
              variant="primary"
              size="lg"
              className="sheen min-w-0"
              aria-disabled={busy || undefined}
              onClick={() => open(first.day)}
            >
              {t('ui.cal.openDay', { n: first.day })}
            </PixelButton>
          ) : (
            <PixelButton size="lg" className="min-w-0" disabled>
              {next != null ? t('ui.cal.nextIn', { time: until(next - now) }) : t('ui.cal.allDone')}
            </PixelButton>
          )}
          <InfoButton compact name={name} onClick={() => setInfo(true)} />
          <CalendarRulesModal open={info} onClose={() => setInfo(false)} e={cal} name={name} />
        </div>
      }
    />
  )
}

/** The rules' numbers while there's no calendar to read them from (nothing is shown then). */
const PLACEHOLDER: LiveEvent = {
  ...newLiveEvent('', new Date(0).toISOString(), new Date(0).toISOString()),
  type: 'calendar',
}
