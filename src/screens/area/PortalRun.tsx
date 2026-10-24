// The portal run on the game's screens (docs/28): the guard that keeps the player in the area while a run is under way
// (and brings them back to it after a reload), the screen's distortion, the rules pop-up once, and the area's own steps
// (the way in, a distortion's boons, the victory). The engine (engine/portal.ts) decides everything; these only show it.
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  monName,
  portalDiceCount,
  portalLock,
  portalModeOf,
  portalRulesDue,
  portalStateOf,
  teamOf,
  type Area,
  type PortalRunMode,
} from '@/engine'
import { useT } from '@/i18n/react'
import {
  describeOffer,
  DistortionChoiceView,
  DistortionFx,
  GIRATINA,
  playPortalClose,
  PortalCloseFx,
  PortalEntry,
  PortalRulesModal,
  PortalVictoryView,
  RunBonuses,
} from '@/components/Portal'
import { useMyTurn, useOnScreen } from '@/components/popupTurn'
import { InfoButton } from '@/components/RulesModal'
import { pictureOf } from '@/fx/areaArt'
import { mutateSave, useGame } from '@/store/game'
import {
  arriveAtPortalIntro,
  enterArea,
  enterPortal,
  finishPortalVictory,
  healAndStartPortalRaid,
  leaveArea,
  markPortalPopup,
  pickDistortionOffer,
} from '@/store/run'
import { travelTo } from '@/store/travel'
import { progressRaidPath } from '@/screens/events/progressRaids'
import { AreaTeam } from './AreaIdle'

const markSeen = () => mutateSave((s) => (s.portalRulesSeen ? null : { ...s, portalRulesSeen: true }))

/**
 * While a portal run is under way, every page but the area's sends back to it (a link, the menus, a reload), the run
 * is picked up where it was, and the screen wears the distortion.
 */
export function PortalGuard() {
  const lock = useGame((s) => portalLock(s.save, s.data))
  const runArea = useGame((s) => s.run.areaId)
  const { pathname } = useLocation()
  useEffect(() => {
    if (lock && runArea !== lock.id) enterArea(lock.id)
  }, [lock, runArea])
  if (!lock) return null
  return (
    <>
      {pathname !== '/area' && <Navigate to="/area" replace />}
      <DistortionFx />
      <PortalCloseFx />
    </>
  )
}

/**
 * The rules pop-up, once (docs/15 §20): when the region being played has a portal area open, between fights, on its turn
 * in the one-time pop-ups' queue (engine/popups.ts), never over an area's page. Let's go! travels there.
 */
export function PortalUnlockPopup() {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const area = useGame((s) => (s.save ? portalRulesDue(s.save, s.data) : null))
  const mode = portalModeOf(area, data)
  const open = useMyTurn('portal') && !!area && !!mode
  useOnScreen('portal', open)
  if (!area || !mode) return null
  return (
    <PortalRulesModal
      open={open}
      onClose={markSeen}
      onGo={() => {
        markSeen()
        if (travelTo(area)) navigate('/home')
      }}
      mode={mode}
      data={data}
    />
  )
}

/** INFO at the bottom of the area's page: the run's rules again. */
export function PortalInfo({ mode }: { mode: PortalRunMode }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState(false)
  return (
    <>
      <InfoButton name={t('ui.portal.title')} onClick={() => setOpen(true)} />
      <PortalRulesModal open={open} onClose={() => setOpen(false)} mode={mode} data={data} />
    </>
  )
}

/**
 * The area's own step when it has one, in place of the usual between-encounters page: the victory's moment once due,
 * the way in while no run is under way (and it isn't won), a distortion's boons while one is open. Null otherwise (the
 * usual page, with the run's bonuses on it).
 */
export function PortalStep({ area }: { area: Area }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const mode = portalModeOf(area, data)
  if (!mode) return null
  const p = portalStateOf(save, area.id)
  if (p.won && !p.wonSeen)
    return (
      <PortalVictoryView
        name={data.species[GIRATINA]?.name ?? 'Giratina'}
        level={mode.raid.level}
        onDone={() => {
          finishPortalVictory()
          navigate('/home')
        }}
        onRaid={() => {
          const raid = healAndStartPortalRaid()
          navigate(raid ? progressRaidPath(raid) : '/home')
        }}
      />
    )
  if (!p.active && !p.won) return <PortalWayIn area={area} mode={mode} />
  if (p.active && p.offers?.length) {
    const team = teamOf(save)
    const views = p.offers.map((o) =>
      describeOffer(o, mode, data, team, (inst) => portalDiceCount(inst, data, p), t),
    )
    return (
      <div className="flex flex-col gap-4">
        <DistortionChoiceView
          views={views}
          index={p.closed + 1}
          total={mode.portals}
          onPick={(i) => {
            playPortalClose()
            pickDistortionOffer(i)
          }}
        />
        {/* The team under the boons, over the run's bonuses: who is K.O., how much HP is left (the user, 2026-10-15). */}
        <AreaTeam />
        <PortalBonuses area={area} />
      </div>
    )
  }
  return null
}

/**
 * The way in (docs/28): arriving heals the team and the Box as a Pokémon Center does (the engine's arriveAtPortal);
 * the breach waits for a tap, then its pop-up: TEAM goes to the Team screen, where the team can change until READY!
 * (teamSwapsOpen), and coming back shows the pop-up at once; NOT NOW goes Home; READY! starts the run.
 */
function PortalWayIn({ area, mode }: { area: Area; mode: PortalRunMode }) {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const popup = useGame((s) => !!s.run.portalPopup)
  useEffect(() => arriveAtPortalIntro(area.id), [area.id])
  return (
    <PortalEntry
      mode={mode}
      data={data}
      picture={pictureOf(area.id)?.url ?? null}
      popup={popup}
      onPopup={markPortalPopup}
      onTeam={() => navigate('/team')}
      onReady={() => {
        markSeen()
        enterPortal(area.id)
      }}
      onNotNow={() => {
        markSeen()
        leaveArea()
        navigate('/home')
      }}
    />
  )
}

/** The run's bonuses so far, for the area's page while it's under way. */
export function PortalBonuses({ area }: { area: Area }) {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const p = portalStateOf(save, area.id)
  if (!p.active) return null
  const dice = Object.entries(p.dice ?? {}).flatMap(([uid, types]) => {
    const inst = save.box.find((x) => x.id === uid)
    return inst ? [{ name: monName(inst, data), dex: inst.dex, types }] : []
  })
  return <RunBonuses boosts={p.boosts ?? {}} dice={dice} />
}
