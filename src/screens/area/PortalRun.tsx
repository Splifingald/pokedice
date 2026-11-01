// The portal run on the game's screens (docs/28): the guard that keeps the player in the area while a run is under way
// (and brings them back to it after a reload), the screen's distortion, the rules pop-up once, and the area's own steps
// (the way in, a distortion's boons, the victory). The engine (engine/portal.ts) decides everything; these only show it.
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  markPortalRulesSeen,
  monName,
  portalDiceCount,
  portalLock,
  portalModeOf,
  portalRulesDue,
  portalSkin,
  portalStateOf,
  teamOf,
  type Area,
  type PortalRunMode,
  type PortalSkin,
} from '@/engine'
import { useT } from '@/i18n/react'
import {
  describeOffer,
  DistortionChoiceView,
  DistortionFx,
  playPortalClose,
  PortalCloseFx,
  PortalEntry,
  PortalRulesModal,
  PortalVictoryView,
  RunBonuses,
} from '@/components/Portal'
import { useMyTurn, useOnScreen } from '@/components/popupTurn'
import { InfoButton } from '@/components/RulesModal'
import { prizeOf, PortalSkinProvider, skinKey } from '@/components/portalSkin'
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

/** Its look's rules pop-up seen (each look its own: the Stairway of Plates' is new to a Distortion World veteran). */
const markSeen = (skin: PortalSkin) =>
  mutateSave((s) => {
    const next = markPortalRulesSeen(s, skin)
    return next === s ? null : next
  })

/**
 * While a portal run is under way, every page but the area's sends back to it (a link, the menus, a reload), the run
 * is picked up where it was, and the screen wears the distortion.
 */
export function PortalGuard() {
  const lock = useGame((s) => portalLock(s.save, s.data))
  const data = useGame((s) => s.data)
  const runArea = useGame((s) => s.run.areaId)
  const { pathname } = useLocation()
  useEffect(() => {
    if (lock && runArea !== lock.id) enterArea(lock.id)
  }, [lock, runArea])
  if (!lock) return null
  return (
    <PortalSkinProvider value={portalSkin(portalModeOf(lock, data))}>
      {pathname !== '/area' && <Navigate to="/area" replace />}
      <DistortionFx />
      <PortalCloseFx />
    </PortalSkinProvider>
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
  const skin = portalSkin(mode)
  return (
    <PortalSkinProvider value={skin}>
      <PortalRulesModal
        open={open}
        onClose={() => markSeen(skin)}
        onGo={() => {
          markSeen(skin)
          if (travelTo(area)) navigate('/home')
        }}
        mode={mode}
        data={data}
        prize={prizeOf(area, skin)}
      />
    </PortalSkinProvider>
  )
}

/** INFO at the bottom of the area's page: the run's rules again. */
export function PortalInfo({ mode, area }: { mode: PortalRunMode; area?: Area }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState(false)
  const skin = portalSkin(mode)
  return (
    <PortalSkinProvider value={skin}>
      <InfoButton name={t(skinKey(skin, 'ui.portal.title'))} onClick={() => setOpen(true)} />
      <PortalRulesModal
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        data={data}
        prize={prizeOf(area, skin)}
      />
    </PortalSkinProvider>
  )
}

/**
 * The area's own step when it has one, in place of the usual between-encounters page: the victory's moment once due,
 * the way in while no run is under way (and it isn't won), a distortion's boons while one is open. Null otherwise (the
 * usual page, with the run's bonuses on it).
 */
export function PortalStep({ area }: { area: Area }) {
  const data = useGame((s) => s.data)
  const mode = portalModeOf(area, data)
  if (!mode) return null
  // Every piece of the step wears the area's look (Distortion World, or the Stairway of Plates).
  return (
    <PortalSkinProvider value={portalSkin(mode)}>
      <PortalStepIn area={area} mode={mode} />
    </PortalSkinProvider>
  )
}

function PortalStepIn({ area, mode }: { area: Area; mode: PortalRunMode }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const skin = portalSkin(mode)
  const prize = prizeOf(area, skin)
  const p = portalStateOf(save, area.id)
  if (p.won && !p.wonSeen)
    return (
      <PortalVictoryView
        name={data.species[prize]?.name ?? ''}
        dex={prize}
        portals={mode.portals}
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
      describeOffer(o, mode, data, team, (inst) => portalDiceCount(inst, data, p), t, skin),
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
  const skin = portalSkin(mode)
  useEffect(() => arriveAtPortalIntro(area.id), [area.id])
  return (
    <PortalEntry
      mode={mode}
      data={data}
      prize={prizeOf(area, skin)}
      picture={pictureOf(area.id)?.url ?? null}
      popup={popup}
      onPopup={markPortalPopup}
      onTeam={() => navigate('/team')}
      onReady={() => {
        markSeen(skin)
        enterPortal(area.id)
      }}
      onNotNow={() => {
        markSeen(skin)
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
  return (
    <PortalSkinProvider value={portalSkin(portalModeOf(area, data))}>
      <RunBonuses boosts={p.boosts ?? {}} dice={dice} />
    </PortalSkinProvider>
  )
}
