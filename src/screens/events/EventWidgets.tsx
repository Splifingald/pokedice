// Home's squares for the special events (docs/18): one per open event, in the admin's order, beside the Day Care and
// Versus, in the same frame as theirs (a banner of the Day Care's shape, then the same three rows), so every square on
// Home is the same size. Before any event opens there is no square: from the 3rd Kanto badge, Home's "Coming up" line
// names the area that opens the first one (engine/comingUp.ts).
import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { activeEvents, currentTier, rebattleEncounter, rebattleOnHome, regionOf, type EventId } from '@/engine'
import { AreaStrip } from '@/components/AreaStrip'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { useGame } from '@/store/game'
import { useTodayRaid } from '@/store/raid'
import { HeadTag, Meter, Widget, WidgetBanner, WIDGET_BANNER_H, WidgetRows } from '@/screens/home/Widget'
import { Medal, tierName } from './RebattlePage'
import { LiveSquare } from './live'
import { WorldSlot } from './worldPreview'
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

/**
 * The Raid Battles' square: today's raid Pokémon on its area, LIVE or CAUGHT on the picture (the title keeps the whole
 * header), the day's time left (the gauge and the line under it).
 */
function RaidSquare() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const { raid, msLeft } = useTodayRaid()
  const name = t('ui.events.raid.name')
  const mon = raid ? (raid.shiny ? t('ui.events.raid.shinyName', { name: data.species[raid.dex]?.name ?? '' }) : (data.species[raid.dex]?.name ?? '')) : ''
  const time = raid && msLeft != null ? t(raid.caught ? 'ui.events.raid.newIn' : 'ui.events.raid.endsIn', { time: countdown(msLeft) }) : '…'
  const sub = raid ? `${time} · ${tPlural('ui.events.raid.tries', raid.tries, { n: raid.tries })}` : t('ui.events.raid.loading')
  return (
    <Widget
      title={name}
      tag={<HeadTag />}
      label={t('ui.events.raid.label', { name, mon, sub })}
      onClick={() => navigate('/events/raid')}
    >
      <WidgetBanner>
        {raid && (
          <>
            <AreaStrip area={{ id: raid.areaId }} h={WIDGET_BANNER_H} className="absolute inset-0 h-full w-full" />
            {/* The menu icon, as everywhere a Pokémon is named in a list; it has no shiny colours, so a shiny raid
                gets the star beside it. */}
            <span className="absolute inset-0 flex items-center justify-center">
              <MiniSprite dex={raid.dex} size={40} className={raid.caught ? 'grayscale-[0.5]' : undefined} />
              {raid.shiny && <PixelIcon name="star" size={18} title={t('ui.mon.shiny')} className="-ml-1 mb-6 shrink-0" />}
            </span>
            <Chip tone={raid.caught ? 'done' : 'gold'} className="absolute right-1 top-1 tracking-[0.04em]">
              {t(raid.caught ? 'ui.events.raid.caught' : 'ui.events.raid.live')}
            </Chip>
          </>
        )}
      </WidgetBanner>
      <WidgetRows
        top={<span className="truncate text-[20px] leading-none">{mon}</span>}
        meter={raid && msLeft != null && <Meter value={DAY - msLeft} max={DAY} />}
        bottom={raid ? time : sub}
      />
    </Widget>
  )
}

/**
 * The next trainer on the hall's picture, as tall as the banner and centred in it. The banner grows with the widget
 * (a phone's half width up to a wide screen's column), so a fixed size was tiny on the big ones.
 */
function TrainerFit({ src }: { src: string | null }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [h, setH] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setH(el.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <span ref={ref} className="absolute inset-0 flex items-center justify-center">
      {h > 0 && <TrainerSprite src={src} size={Math.round(h)} />}
    </span>
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
            <TrainerFit src={next?.kind === 'gym' ? next.spriteUrl : null} />
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

export function EventWidgets() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const open = activeEvents(save, data)
  // The rebattle only shows while the region being played has tiers left to fight.
  const onHome = open.filter((id) => id !== 'rebattle' || rebattleOnHome(save, data))
  // A small world (docs/21, priority 1) comes first (or its preview before it starts, §9), then a live event (docs/20,
  // priority 2), whatever else is open.
  return [<WorldSlot key="world" />, <LiveSquare key="live" />, ...onHome.map((id) =>
    id === 'wheel' ? (
      <WheelSquare key={id} />
    ) : id === 'rebattle' ? (
      <RebattleSquare key={id} />
    ) : id === 'raid' ? (
      <RaidSquare key={id} />
    ) : (
      <EventSquare key={id} id={id} />
    ),
  )]
}
