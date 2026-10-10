// Home's squares for the special events (docs/18): one per open event, in the admin's order, beside the Day Care and
// Versus. Before any event opens, one square holds the place: "coming later", then from the 3rd Kanto badge a locked
// teaser naming the area that opens the first event.
import { useNavigate } from 'react-router-dom'
import { activeEvents, eventsTeaser, type EventId } from '@/engine'
import { PixelIcon } from '@/components/icons'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { useGame } from '@/store/game'
import { Widget } from '@/screens/home/Widget'
import { EVENT_ICON, RewardIcon, rewardName, useWheelDay } from './shared'

/**
 * The Fortune Wheel's square: its prizes rolling by (pictures only: the amounts and odds are on its page), and whether
 * today's spin is still there. The carousel never re-mounts on a tick, so it doesn't jump.
 */
function WheelSquare() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const day = useWheelDay(30_000)
  const name = t('ui.events.wheel.name')
  const prizes = data.config.events.wheel.prizes.filter((p) => p.count > 0 && p.odds > 0)
  const ready = day.known && day.ready
  const sub = !day.known ? '…' : ready ? t('ui.events.wheel.daily') : t('ui.events.wheel.nextSpin', { time: countdown(day.msLeft) })
  const label = t(ready ? 'ui.events.wheel.labelReady' : 'ui.events.wheel.labelSpun', {
    name,
    prizes: prizes.map((p) => rewardName(p.reward, data)).join(', '),
    sub,
  })
  const row = prizes.map((p, i) => (
    <span key={i} className="grid h-full w-[64px] place-items-center">
      <RewardIcon reward={p.reward} data={data} size={64} />
    </span>
  ))
  return (
    <Widget title={name} label={label} onClick={() => navigate('/events/wheel')} className={ready ? 'panel-gold' : undefined}>
      <span className="ev-car" aria-hidden>
        <span className="ev-car-track">
          {row}
          {row.map((el, i) => (
            <span key={`b${i}`} className="contents">
              {el}
            </span>
          ))}
        </span>
      </span>
      <span className="text-[20px] leading-none">{ready ? t('ui.events.wheel.free') : t('ui.events.wheel.spun')}</span>
      <span className="font-pixel-sm text-[15px] leading-none text-muted">{sub}</span>
    </Widget>
  )
}

/** An event's square. Each event draws its own inside (docs/19); this is the frame they share. */
function EventSquare({ id }: { id: EventId }) {
  const { t } = useT()
  const navigate = useNavigate()
  const name = t(`ui.events.${id}.name`)
  return (
    <Widget title={name} label={t('ui.events.open', { name })} onClick={() => navigate(`/events/${id}`)}>
      <span className="grid min-h-[64px] place-items-center">
        <PixelIcon name={EVENT_ICON[id]} size={40} />
      </span>
    </Widget>
  )
}

/** The square before any event: a dashed placeholder, locked and naming its area once the teaser is due. */
function EventsTeaser({ areaName }: { areaName: string | null }) {
  const { t } = useT()
  const sub = areaName ? t('ui.events.teaser', { area: areaName }) : t('ui.shop.comingLater')
  return (
    <div
      role="note"
      aria-label={areaName ? t('ui.events.teaserLabel', { area: areaName }) : t('ui.home.eventsLabel')}
      className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 bg-panel/50 p-2.5 text-center text-faint outline-dashed outline-2 -outline-offset-2 outline-shadow"
    >
      <span className="flex items-center gap-1.5 font-pixel-sm text-[15px] leading-none text-muted">
        {t('ui.home.events')}
        {areaName && <PixelIcon name="lock" size={16} />}
      </span>
      <PixelIcon name="star" size={24} style={{ filter: 'grayscale(1) opacity(0.4)' }} />
      <span className="font-pixel-sm text-[15px] leading-none text-muted">{sub}</span>
    </div>
  )
}

export function EventWidgets() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const open = activeEvents(save, data)
  if (open.length) return open.map((id) => (id === 'wheel' ? <WheelSquare key={id} /> : <EventSquare key={id} id={id} />))
  const teaser = eventsTeaser(save, data)
  const area = teaser?.kind === 'soon' ? data.areas.find((a) => a.id === teaser.areaId) : null
  return <EventsTeaser areaName={area?.name ?? null} />
}
