// One page per special event (docs/18): /events/wheel, /events/raid, /events/rebattle, reached from its Home square.
// No tabs between events. The page opens on the event's banner: its picture, the back arrow, the title, the live status.
import type { ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { EVENT_IDS, eventUnlocked, type EventId } from '@/engine'
import { BackButton } from '@/components/PageHead'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { useGame } from '@/store/game'
import { currentTier, rebattleComplete, rebattleEncounter, regionOf } from '@/engine'
import { RebattlePage, tierName } from './RebattlePage'
import { EventPicture, useWheelDay } from './shared'
import { WheelPage } from './WheelPage'

const isEventId = (id: string | undefined): id is EventId => !!id && (EVENT_IDS as readonly string[]).includes(id)

/** The banner: the event's picture with a plate on it, like the Day Care's yard. */
export function EventBanner({ id, status }: { id: EventId; status?: ReactNode }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  return (
    <EventPicture id={id} data={data} className="-mx-3 -mt-4 min-h-[132px] shadow-[0_2px_0_rgb(var(--c-edge))]">
      <div className="pixel-plate absolute left-2 top-2 z-[1] flex max-w-[calc(100%-16px)] items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
        <BackButton onClick={() => navigate('/home')} />
        <span className="grid min-w-0 gap-0.5">
          <h1 className="m-0 text-[24px] font-normal leading-none">{t(`ui.events.${id}.name`)}</h1>
          {status && <small className="truncate font-pixel-sm text-[14px] leading-none text-muted">{status}</small>}
        </span>
      </div>
    </EventPicture>
  )
}

/** The banner's live line: the wheel's free spin or its countdown. */
function useEventStatus(id: EventId): string | undefined {
  const { t } = useT()
  const wheel = useWheelDay()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (id === 'wheel' && wheel.known)
    return wheel.ready ? t('ui.events.wheel.daily') : t('ui.events.wheel.nextSpin', { time: countdown(wheel.msLeft) })
  if (id === 'rebattle' && save) {
    const region = regionOf(save)
    if (rebattleComplete(save, data, region)) return t('ui.events.rebattle.medalTitle', { tier: tierName(t, data, 2) })
    const next = rebattleEncounter(save, data, region)
    if (next?.kind === 'gym')
      return `${tierName(t, data, currentTier(save, data, region))} · ${t('ui.events.rebattle.fightOf', { n: next.index, total: next.total })}`
  }
  return undefined
}

/** Each event's page (docs/19 builds them one by one). */
function EventBody({ id }: { id: EventId }) {
  const { t } = useT()
  if (id === 'wheel') return <WheelPage />
  if (id === 'rebattle') return <RebattlePage />
  return <p className="m-0 font-pixel-sm text-[16px] text-muted">{t('ui.events.building', { name: t(`ui.events.${id}.name`) })}</p>
}

export function EventsScreen() {
  const { id } = useParams()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  // A closed or unknown event goes back Home (a stale link, an event switched off in Admin).
  if (!isEventId(id) || !save || !eventUnlocked(id, save, data)) return <Navigate to="/home" replace />
  return <EventPage id={id} />
}

function EventPage({ id }: { id: EventId }) {
  const status = useEventStatus(id)
  return (
    <div className="flex flex-col gap-3">
      <EventBanner id={id} status={status} />
      <EventBody id={id} />
    </div>
  )
}
