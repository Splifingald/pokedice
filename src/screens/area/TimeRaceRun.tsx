// The race of time and space on the game's screens (docs/61 §4.4, docs/15 §48): the guard that keeps a try in its area
// (every page sends back to it, a reload picks it up there) and ends it when the clock reaches 0:00 wherever the player
// is; the clock; its INFO; and the area's own steps (the way in: the intro full screen, then its pop-up; a fork's gates;
// the win). The engine (engine/timeRace.ts) decides everything; these only show it.
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  canStartTimeRace,
  timeRaceLeft,
  timeRaceLock,
  timeRaceModeOf,
  timeRacePlan,
  timeRaceStateOf,
  timeRaceVictoryDue,
  type Area,
  type GameData,
  type PokeType,
  type SaveData,
  type TimeRaceMode,
} from '@/engine'
import { useT } from '@/i18n/react'
import {
  ForkView,
  RaceClock,
  TimeRaceEntry,
  TimeRaceRulesModal,
  TimeRaceVictoryView,
  useRaceTicks,
} from '@/components/TimeRace'
import { InfoButton } from '@/components/RulesModal'
import { pictureOf } from '@/fx/areaArt'
import { useGame } from '@/store/game'
import {
  arriveAtTimeRaceWayIn,
  beginTimeRace,
  enterArea,
  finishTimeRaceVictory,
  healAndStartTimeRaceRaid,
  leaveArea,
  markTimeRacePopup,
  pickRaceGate,
  timeRaceExpired,
} from '@/store/run'
import { useServerNow } from '@/store/serverTime'
import { progressRaidPath } from '@/screens/events/progressRaids'

/** The clock's milliseconds left in the try under way here, on the server's time (the device's until it's read). */
function useRaceLeft(areaId: string | null | undefined): number | null {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const server = useServerNow(250)
  const [device, setDevice] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setDevice(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  if (!save || !areaId) return null
  return timeRaceLeft(save, data, areaId, server ?? device)
}

/**
 * While a try is under way, every page but the area's sends back to it (a link, the menus, a reload) and the try is
 * picked up where it was. The clock runs on: at 0:00 the try ends wherever the player is, in a fight too (its card says
 * so). The last 10 seconds tick.
 */
export function TimeRaceGuard() {
  const lock = useGame((s) => timeRaceLock(s.save, s.data))
  const runArea = useGame((s) => s.run.areaId)
  const { pathname } = useLocation()
  const left = useRaceLeft(lock?.id)
  useRaceTicks(left)
  useEffect(() => {
    if (lock && runArea !== lock.id) enterArea(lock.id)
  }, [lock, runArea])
  useEffect(() => {
    if (lock && left === 0) timeRaceExpired()
  }, [lock, left])
  if (!lock) return null
  return pathname !== '/area' ? <Navigate to="/area" replace /> : null
}

/** The clock of the try under way here (the area's page, a fight's corner); nothing outside a try. */
export function TimeRaceClockHere({
  areaId,
  size = 'big',
  className,
}: {
  areaId: string | null | undefined
  size?: 'big' | 'small'
  className?: string
}) {
  const left = useRaceLeft(areaId)
  return left == null ? null : <RaceClock left={left} size={size} className={className} />
}

/** INFO at the bottom of the area's page: the race's rules again (the try under way's, or the next one's). */
export function TimeRaceInfo({ area, mode }: { area: Area; mode: TimeRaceMode }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const [open, setOpen] = useState(false)
  if (!save) return null
  return (
    <>
      <InfoButton name={t('ui.timeRace.title')} onClick={() => setOpen(true)} />
      <TimeRaceRulesModal
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        plan={timeRacePlan(save, mode, area.id)}
        data={data}
      />
    </>
  )
}

/** The area's own step is due now (in place of the usual page between fights): the win, the way in, or a fork. */
export function timeRaceStepDue(area: Area, s: { save: SaveData; data: GameData }): boolean {
  if (!timeRaceModeOf(area, s.data)) return false
  const r = timeRaceStateOf(s.save, area.id)
  return (
    timeRaceVictoryDue(s.save, s.data, area.id) ||
    canStartTimeRace(s.save, s.data, area.id) ||
    (r.active && !!r.gates?.length)
  )
}

/** The area's own step: the win once due, the way in before a try, a fork's gates in one. Null otherwise. */
export function TimeRaceStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const mode = timeRaceModeOf(area, data)
  if (!mode) return null
  const r = timeRaceStateOf(save, area.id)
  const won = r.won?.at(-1)
  if (won != null && timeRaceVictoryDue(save, data, area.id))
    return (
      <TimeRaceVictoryView
        dex={won}
        name={data.species[won]?.name ?? `#${won}`}
        level={mode.raid.level}
        left={r.left ?? null}
        onDone={() => {
          finishTimeRaceVictory()
          navigate('/home')
        }}
        onRaid={() => {
          const raid = healAndStartTimeRaceRaid()
          navigate(raid ? progressRaidPath(raid) : '/home')
        }}
      />
    )
  if (canStartTimeRace(save, data, area.id)) return <WayIn area={area} mode={mode} />
  if (r.active && r.gates?.length) {
    const plan = timeRacePlan(save, mode, area.id)
    const last = r.path.length + 1 >= plan.forks.length
    const legends: Partial<Record<PokeType, string>> = {}
    if (last) for (const l of mode.legends) legends[l.type] = data.species[l.dex]?.name ?? `#${l.dex}`
    return (
      <ForkView
        gates={r.gates}
        fork={r.path.length + 1}
        forks={plan.forks.length}
        perFork={mode.perFork}
        legends={last ? legends : undefined}
        data={data}
        onPick={pickRaceGate}
      />
    )
  }
  return null
}

/**
 * The way in (as the Distortion World's): arriving heals the team and the Box as a Pokémon Center does (the engine's
 * arriveAtTimeRace); the intro plays full screen and waits for a tap, then its pop-up: TEAM goes to the Team screen,
 * where the team can change until READY! (teamSwapsOpen), and coming back shows the pop-up at once; NOT NOW goes Home;
 * READY! starts the clock, the first fork next.
 */
function WayIn({ area, mode }: { area: Area; mode: TimeRaceMode }) {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const popup = useGame((s) => !!s.run.racePopup)
  useEffect(() => arriveAtTimeRaceWayIn(area.id), [area.id])
  return (
    <TimeRaceEntry
      mode={mode}
      plan={timeRacePlan(save, mode, area.id)}
      data={data}
      picture={pictureOf(area.id)?.url ?? null}
      popup={popup}
      onPopup={markTimeRacePopup}
      onTeam={() => navigate('/team')}
      onReady={() => beginTimeRace(area.id)}
      onNotNow={() => {
        leaveArea()
        navigate('/home')
      }}
    />
  )
}
