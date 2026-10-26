// Home's cards for what's on (docs/43 §5.2): a small world (or its preview), each live event, then each special event
// open (docs/18), in the admin's order — all on Home's one card (`HomeCard`: a picture, a name, one status line, a
// gauge), so the Events section reads as a list. Before any event opens there is no card.
import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  activeEvents,
  currentTier,
  heldWorld,
  inWorld,
  jackpotStage,
  kitsHeld,
  liveLeft,
  previewState,
  rebattleEncounter,
  rebattleOnHome,
  regionOf,
  ticketRules,
  worldLeft,
  worldPreviewFor,
  worldPrize,
  worldPrizeCaught,
  worldProgress,
  type EventId,
  type LiveEvent,
  type SmallWorld,
} from '@/engine'
import { AreaStrip } from '@/components/AreaStrip'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { useT } from '@/i18n/react'
import { clockTo, countdown, dayTime, timeLeft } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { useLive } from '@/store/live'
import { useTodayRaid } from '@/store/raid'
import { useWheelTickets } from '@/store/wheel'
import { useWorld, worldName } from '@/store/worlds'

import { CARD_STRIP_H, HomeCard, Meter } from '@/screens/home/Widget'
import { Medal, tierName } from './RebattlePage'
import { LiveFx, LiveGauge, LivePicture, LiveTag, liveName, liveSub, liveTime, openLivePopup } from './live'
import { goIntoWorld, MythicalArt, ShinyTag, WorldTag, worldVars } from './world'
import { PreviewGauge } from './worldPreview'
import { bannerUrl, EVENT_ICON, EventPicture, RewardIcon, rewardName } from './shared'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * The Fortune Wheel: its prizes rolling by on the picture (the amounts and odds are on its page), the jackpot of the
 * moment first, and the tickets held. Gold while a ticket waits. The carousel never re-mounts on a tick.
 */
function WheelCard() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const tickets = useWheelTickets(30_000)
  const name = t('ui.events.wheel.name')
  const wheel = data.config.events.wheel
  const jackpot = save ? wheel.jackpot?.[jackpotStage(save, wheel)] : undefined
  const rewards = [
    ...(jackpot ? [jackpot.reward] : []),
    ...wheel.slices.filter((p) => p.count > 0 && p.odds > 0).map((p) => p.reward),
  ]
  const ready = tickets.known && tickets.tickets > 0
  const sub = !tickets.known
    ? '…'
    : tickets.msLeft == null
      ? t('ui.events.wheel.full')
      : t('ui.events.wheel.nextTicket', { time: countdown(tickets.msLeft) })
  const held = tickets.known
    ? t('ui.events.wheel.ticketsHeld', { n: tickets.tickets, cap: tickets.cap })
    : '…'
  const label = t('ui.events.wheel.squareLabel', {
    name,
    tickets: held,
    prizes: rewards.map((r) => rewardName(r, data)).join(', '),
    sub,
  })
  const every = ticketRules(wheel).everyMs
  const row = rewards.map((r, i) => (
    <span key={i} className="grid h-full w-[48px] place-items-center">
      <RewardIcon reward={r} data={data} size={36} />
    </span>
  ))
  return (
    <HomeCard
      tone={ready ? 'gold' : undefined}
      picture={
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
      }
      name={name}
      tag={
        <Chip tone={ready ? 'gold' : 'plain'}>
          <PixelIcon name="ticket" size={14} />
          {tickets.known ? tickets.tickets : '…'}
        </Chip>
      }
      status={sub}
      // The gauge fills toward the next free ticket; full while the stack is.
      meter={
        tickets.known && <Meter value={tickets.msLeft == null ? every : every - tickets.msLeft} max={every} />
      }
      label={label}
      onClick={() => navigate('/events/wheel')}
    />
  )
}

/** The Raid Battles: today's raid Pokémon on its area, LIVE or CAUGHT, and the day's time left. */
function RaidCard() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const { raid, msLeft } = useTodayRaid()
  const name = t('ui.events.raid.name')
  const mon = raid
    ? raid.shiny
      ? t('ui.events.raid.shinyName', { name: data.species[raid.dex]?.name ?? '' })
      : (data.species[raid.dex]?.name ?? '')
    : ''
  const time =
    raid && msLeft != null
      ? t(raid.caught ? 'ui.events.raid.newIn' : 'ui.events.raid.endsIn', { time: countdown(msLeft) })
      : '…'
  const sub = raid
    ? `${time} · ${tPlural('ui.events.raid.tries', raid.tries, { n: raid.tries })}`
    : t('ui.events.raid.loading')
  return (
    <HomeCard
      picture={
        raid && (
          <>
            <AreaStrip
              area={{ id: raid.areaId }}
              h={CARD_STRIP_H}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <MiniSprite dex={raid.dex} size={36} className={raid.caught ? 'grayscale-[0.5]' : undefined} />
              {raid.shiny && (
                <PixelIcon name="star" size={16} title={t('ui.mon.shiny')} className="-ml-1 mb-5 shrink-0" />
              )}
            </span>
          </>
        )
      }
      name={mon || name}
      tag={
        raid && (
          <Chip tone={raid.caught ? 'done' : 'gold'} className="tracking-[0.04em]">
            {t(raid.caught ? 'ui.events.raid.caught' : 'ui.events.raid.live')}
          </Chip>
        )
      }
      // The event's name leads the line: the card's name is the day's Pokémon.
      status={raid ? `${name} · ${time}` : sub}
      meter={raid && msLeft != null && <Meter value={DAY - msLeft} max={DAY} />}
      label={t('ui.events.raid.label', { name, mon, sub })}
      onClick={() => navigate('/events/raid')}
    />
  )
}

/** The next trainer standing in the hall, as tall as the picture. */
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

/** The Elite Rebattle: the next trainer to beat in the League's hall, the tier's medal and where the gauntlet stands. */
function RebattleCard() {
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
  const sub =
    next?.kind === 'gym' ? t('ui.events.rebattle.fightOf', { n: next.index, total: next.total }) : ''
  const foe = next?.kind === 'gym' ? next.name : ''
  return (
    <HomeCard
      picture={
        <span className="absolute inset-0">
          <EventPicture id="rebattle" data={data} className="h-full w-full">
            <TrainerFit src={next?.kind === 'gym' ? next.spriteUrl : null} />
          </EventPicture>
        </span>
      }
      name={name}
      tag={<Medal tier={tier} size="sm" />}
      status={[foe, tierLabel, sub].filter(Boolean).join(' · ')}
      meter={next?.kind === 'gym' && <Meter value={next.index - 1} max={next.total} />}
      label={t('ui.events.rebattle.label', { name, tier: tierLabel, foe, sub })}
      onClick={() => navigate('/events/rebattle')}
    />
  )
}

/** An event still being built: its icon and name. */
function EventCard({ id }: { id: EventId }) {
  const { t } = useT()
  const navigate = useNavigate()
  const name = t(`ui.events.${id}.name`)
  return (
    <HomeCard
      picture={
        <span className="absolute inset-0 grid place-items-center bg-well">
          <PixelIcon name={EVENT_ICON[id]} size={32} />
        </span>
      }
      name={name}
      status={t('ui.events.building', { name })}
      label={t('ui.events.open', { name })}
      onClick={() => navigate(`/events/${id}`)}
    />
  )
}

/**
 * A live event: its picture with what floats over it, its tag, what it gives (the Underground: the kits held) and its
 * time left draining, red in its last hours. A tap opens the shop for a Special Shop, the Underground, else its pop-up.
 */
function LiveCard({ live, now }: { live: LiveEvent; now: number }) {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const ug = useGame((s) => s.save?.underground)
  const left = liveLeft(live, now)
  const name = liveName(live)
  const shop = live.type === 'shop'
  const dig = live.type === 'underground'
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
    <HomeCard
      testId="live-square"
      picture={
        <LivePicture e={live} className="absolute inset-0">
          <LiveFx e={live} data={data} />
        </LivePicture>
      }
      name={name}
      tag={<LiveTag e={live} />}
      status={<span className={hot ? 'text-danger' : undefined}>{`${sub} · ${time}`}</span>}
      meter={<LiveGauge share={left.share} hot={hot} className="lv-gauge-light" />}
      label={t(shop ? 'ui.live.labelShop' : dig ? 'ui.live.labelUnderground' : 'ui.live.label', {
        name,
        sub,
        time,
      })}
      onClick={() => (shop ? navigate('/shop') : dig ? navigate('/underground') : openLivePopup(live.id))}
    />
  )
}

/** One card per live event running for this player, the earliest started first. */
function LiveCards() {
  const { lives, now } = useLive(1000)
  if (now == null) return null
  return lives.map((e) => <LiveCard key={e.id} live={e} now={now} />)
}

/** The small world open to this player: its picture and mythical, how far in, its time left. A tap goes in. */
function WorldCard({ world, now }: { world: SmallWorld; now: number }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const prog = worldProgress(save, data, world)
  const held = heldWorld(save)
  const partner = held?.id === world.id ? (data.species[held.partner]?.name ?? null) : null
  const prize = worldPrize(data, world)
  const caught = !!prize && worldPrizeCaught(save, world, prize)
  const left = worldLeft(world, now)
  const name = worldName(world, data)
  const areas = t('ui.world.areas', { cleared: prog.cleared, total: prog.total })
  const sub = partner ? t('ui.world.with', { name: partner }) : t('ui.world.fresh')
  const time = t('ui.live.endsIn', { time: liveTime(left.ms) })
  const hot = left.ms < DAY
  return (
    <HomeCard
      picture={
        <span className="absolute inset-0 grid place-items-center bg-night" style={worldVars(world)}>
          {world.banner && (
            <img
              src={bannerUrl(world.banner)}
              alt=""
              className="pixelated absolute inset-0 h-full w-full object-cover"
            />
          )}
          {prize && (
            <span className="relative">
              <MythicalArt dex={prize.dex} caught={caught} size={40} />
            </span>
          )}
        </span>
      }
      name={name}
      tag={prize ? <ShinyTag dex={prize.dex} data={data} className="max-w-[45%] truncate" /> : <WorldTag />}
      status={<span className={hot ? 'text-danger' : undefined}>{`${areas} · ${time}`}</span>}
      meter={<LiveGauge share={left.share} hot={hot} className="lv-gauge-light" />}
      label={t('ui.world.label', { name, areas, sub, time })}
      onClick={() => {
        if (goIntoWorld(world)) navigate('/home')
      }}
    />
  )
}

/** The next world in its preview window, greyed: when it starts, its gauge filling. A tap says when it starts. */
function WorldPreviewCard({ world, now }: { world: SmallWorld; now: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { left, fill, phase } = previewState(world, now)
  const name = worldName(world, data)
  const date = dayTime(Date.parse(world.start))
  const hot = phase !== 'normal'
  return (
    <HomeCard
      picture={
        <span className="absolute inset-0 block bg-night" style={worldVars(world)}>
          {world.banner && (
            <img
              src={bannerUrl(world.banner)}
              alt=""
              className="pixelated absolute inset-0 h-full w-full object-cover grayscale"
            />
          )}
          <span className="absolute inset-0 bg-night/40" />
        </span>
      }
      name={name}
      tag={
        <Chip tone={hot ? 'red' : 'dark'} className="uppercase tracking-[0.04em]">
          {t('ui.world.preview.tag')}
        </Chip>
      }
      status={
        // The clock ticking down to the start (the label says it in words).
        <span className={hot ? 'text-danger' : undefined}>
          {t('ui.world.preview.startsIn')} <span className="tabular-nums">{clockTo(left)}</span>
        </span>
      }
      phase={phase}
      meter={<PreviewGauge fill={fill} phase={phase} />}
      label={t('ui.world.preview.label', { name, time: timeLeft(left), date })}
      onClick={() => pushToast(t('ui.world.preview.toast', { name, time: timeLeft(left) }))}
    />
  )
}

/** The world slot, first among the events: the world that's open, and the next one in its preview window. */
function WorldCards() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { world, now } = useWorld(1000)
  if (!save || now == null) return null
  const preview = worldPreviewFor(save, data, now)
  return (
    <>
      {world && !inWorld(save, data) && <WorldCard world={world} now={now} />}
      {preview && preview.id !== world?.id && <WorldPreviewCard world={preview} now={now} />}
    </>
  )
}

export function EventWidgets() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const open = activeEvents(save, data)
  // The rebattle only shows while the region being played has tiers left to fight.
  const onHome = open.filter((id) => id !== 'rebattle' || rebattleOnHome(save, data))
  // A small world (docs/21, priority 1) comes first (or its preview before it starts, §9), then the live events (docs/20,
  // priority 2), whatever else is open.
  return [
    <WorldCards key="world" />,
    <LiveCards key="live" />,
    ...onHome.map((id) =>
      id === 'wheel' ? (
        <WheelCard key={id} />
      ) : id === 'rebattle' ? (
        <RebattleCard key={id} />
      ) : id === 'raid' ? (
        <RaidCard key={id} />
      ) : (
        <EventCard key={id} id={id} />
      ),
    ),
  ]
}
