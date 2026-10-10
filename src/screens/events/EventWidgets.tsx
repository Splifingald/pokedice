// Home's squares for the special events (docs/18): one per open event, in the admin's order, beside the Day Care and
// Versus, in the same frame as theirs (a banner of the Day Care's shape, then the same three rows), so every square on
// Home is the same size. Before any event opens, one square holds the place: "coming later", then from the 3rd Kanto
// badge a locked teaser naming the area that opens the first event.
import { useNavigate } from 'react-router-dom'
import { activeEvents, currentTier, eventsTeaser, rebattleEncounter, rebattleOnHome, regionOf, type EventId } from '@/engine'
import { PixelIcon } from '@/components/icons'
import { TrainerSprite } from '@/components/TrainerArt'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { useGame } from '@/store/game'
import { HeadTag, Meter, Widget, WidgetBanner, WIDGET_BANNER_H, WidgetRows } from '@/screens/home/Widget'
import { Medal, tierName } from './RebattlePage'
import { EVENT_ICON, EventPicture, RewardIcon, rewardName, useWheelDay } from './shared'

const DAY = 24 * 60 * 60 * 1000

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
    <span key={i} className="grid h-full w-[56px] place-items-center">
      <RewardIcon reward={p.reward} data={data} size={48} />
    </span>
  ))
  return (
    <Widget
      title={name}
      tag={<HeadTag />}
      label={label}
      onClick={() => navigate('/events/wheel')}
      className={ready ? 'panel-gold' : undefined}
    >
      <WidgetBanner>
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
      </WidgetBanner>
      {/* The gauge fills toward the next spin; full, and green, while today's is waiting. */}
      <WidgetRows
        top={<span className="truncate text-[20px] leading-none">{ready ? t('ui.events.wheel.free') : t('ui.events.wheel.spun')}</span>}
        meter={day.known && <Meter value={day.ready ? DAY : DAY - day.msLeft} max={DAY} />}
        bottom={sub}
      />
    </Widget>
  )
}

/** The Elite Rebattle's square: the tier's medal, the next trainer to beat and where the gauntlet stands. */
function RebattleSquare() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const region = regionOf(save)
  const tier = currentTier(save, data, region)
  const next = rebattleEncounter(save, data, region)
  const name = t('ui.events.rebattle.name')
  const tierLabel = tierName(t, data, tier)
  const sub = next?.kind === 'gym' ? t('ui.events.rebattle.fightOf', { n: next.index, total: next.total }) : ''
  const foe = next?.kind === 'gym' ? next.name : ''
  return (
    <Widget
      title={name}
      tag={
        <HeadTag>
          <Medal tier={tier} size="sm" />
        </HeadTag>
      }
      label={t('ui.events.rebattle.label', { name, tier: tierLabel, foe, sub })}
      onClick={() => navigate('/events/rebattle')}
    >
      {/* The League's hall, the next trainer standing in it. */}
      <WidgetBanner>
        <span className="absolute inset-0">
          <EventPicture id="rebattle" data={data} className="h-full w-full">
            <TrainerSprite
              src={next?.kind === 'gym' ? next.spriteUrl : null}
              size={64}
              className="absolute bottom-[-6px] left-1/2 -translate-x-1/2"
            />
          </EventPicture>
        </span>
      </WidgetBanner>
      <WidgetRows
        top={<span className="truncate text-[20px] leading-none">{foe}</span>}
        meter={next?.kind === 'gym' && <Meter value={next.index - 1} max={next.total} />}
        bottom={`${tierLabel} · ${sub}`}
      />
    </Widget>
  )
}

/** An event's square. Each event draws its own inside (docs/19); this is the frame they share. */
function EventSquare({ id }: { id: EventId }) {
  const { t } = useT()
  const navigate = useNavigate()
  const name = t(`ui.events.${id}.name`)
  return (
    <Widget title={name} tag={<HeadTag />} label={t('ui.events.open', { name })} onClick={() => navigate(`/events/${id}`)}>
      <WidgetBanner>
        <span className="grid h-full place-items-center bg-well">
          <PixelIcon name={EVENT_ICON[id]} size={40} />
        </span>
      </WidgetBanner>
      <WidgetRows top={null} bottom={t('ui.events.building', { name })} />
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
      className="flex min-w-0 flex-col gap-[5px] bg-panel/50 px-2.5 pb-2.5 pt-2 text-faint outline-dashed outline-2 -outline-offset-2 outline-shadow"
    >
      {/* The same rows as a widget's, so the placeholder is the size of the squares beside it. */}
      <span className="flex w-full items-center gap-1.5 text-[19px] leading-none text-muted">
        <span className="min-w-0 flex-1 truncate">{t('ui.home.events')}</span>
        <HeadTag>{areaName && <PixelIcon name="lock" size={16} />}</HeadTag>
      </span>
      <span className="block w-full" style={{ aspectRatio: `288 / ${WIDGET_BANNER_H}` }}>
        <span className="grid h-full place-items-center">
          <PixelIcon name="star" size={24} style={{ filter: 'grayscale(1) opacity(0.4)' }} />
        </span>
      </span>
      <WidgetRows top={null} bottom={sub} />
    </div>
  )
}

export function EventWidgets() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const open = activeEvents(save, data)
  // The rebattle only shows while the region being played has tiers left to fight.
  const onHome = open.filter((id) => id !== 'rebattle' || rebattleOnHome(save, data))
  if (open.length)
    return onHome.map((id) =>
      id === 'wheel' ? <WheelSquare key={id} /> : id === 'rebattle' ? <RebattleSquare key={id} /> : <EventSquare key={id} id={id} />,
    )
  const teaser = eventsTeaser(save, data)
  const area = teaser?.kind === 'soon' ? data.areas.find((a) => a.id === teaser.areaId) : null
  return <EventsTeaser areaName={area?.name ?? null} />
}
