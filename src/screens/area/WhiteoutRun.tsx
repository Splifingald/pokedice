// The whiteout on the game's screens (docs/64 §4.3, docs/15 §47): the guard that keeps the run in Crown Shrine while it
// holds the player, its INFO, and the area's own steps (the way in: the intro full screen, then its pop-up; the bonfire
// after each wave; the end). The engine (engine/whiteout.ts) decides everything; these only show it.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  lastBonfire,
  teamOf,
  whiteoutBoss,
  whiteoutLock,
  whiteoutModeOf,
  whiteoutStateOf,
  type Area,
  type GameData,
  type SaveData,
  type WhiteoutMode,
} from '@/engine'
import { useT } from '@/i18n/react'
import {
  ABOMASNOW,
  BonfireView,
  WhiteoutEntry,
  WhiteoutRulesModal,
  WhiteoutVictoryView,
} from '@/components/Whiteout'
import { InfoButton } from '@/components/RulesModal'
import { pictureOf } from '@/fx/areaArt'
import { mutateSave, useGame } from '@/store/game'
import {
  arriveAtWhiteoutWayIn,
  beginWhiteout,
  enterArea,
  finishWhiteoutVictory,
  leaveArea,
  markWhiteoutPopup,
  moveOnFromBonfire,
  warmBonfire,
} from '@/store/run'
import { AreaTeam } from './AreaIdle'

const markSeen = () => mutateSave((s) => (s.whiteoutRulesSeen ? null : { ...s, whiteoutRulesSeen: true }))

/** The boss the area's whiteout ends on (shiny Abomasnow), as a dex. */
const bossDexOf = (area: Area, data: GameData) => whiteoutBoss(area, data)?.dex ?? ABOMASNOW

/**
 * While the whiteout holds the player, the run stays in its area (a reload picks it up there). Every page stays open
 * (the Mart, the Team, Home): only travel is shut (engine/whiteout.ts), as the nightmare's.
 */
export function WhiteoutGuard() {
  const lock = useGame((s) => whiteoutLock(s.save, s.data))
  const runArea = useGame((s) => s.run.areaId)
  useEffect(() => {
    if (lock && runArea && runArea !== lock.id) enterArea(lock.id)
  }, [lock, runArea])
  return null
}

/** INFO at the bottom of the area's page: the whiteout's rules again. */
export function WhiteoutInfo({ area, mode }: { area: Area; mode: WhiteoutMode }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState(false)
  return (
    <>
      <InfoButton name={t('ui.whiteout.title')} onClick={() => setOpen(true)} />
      <WhiteoutRulesModal
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        data={data}
        bossDex={bossDexOf(area, data)}
      />
    </>
  )
}

/** The area's own step is due now (in place of the usual page between encounters). */
export function whiteoutStepDue(area: Area, s: { save: SaveData; data: GameData }): boolean {
  if (!whiteoutModeOf(area, s.data)) return false
  const w = whiteoutStateOf(s.save, area.id)
  return (!!w.won && !w.wonSeen) || (!w.active && !w.won) || (w.active && !!w.bonfire)
}

/**
 * The area's own step: the end once due, the way in while it hasn't begun (and isn't over), the bonfire after a wave.
 * Null otherwise (the usual page: CONTINUE brings the next foe).
 */
export function WhiteoutStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const mode = whiteoutModeOf(area, data)
  if (!mode) return null
  const w = whiteoutStateOf(save, area.id)
  const bossDex = bossDexOf(area, data)
  if (w.won && !w.wonSeen)
    return (
      <WhiteoutVictoryView
        name={data.species[bossDex]?.name ?? 'Abomasnow'}
        area={area.name}
        dex={bossDex}
        onDone={() => {
          finishWhiteoutVictory()
          navigate('/home')
        }}
      />
    )
  if (!w.active && !w.won) return <WayIn area={area} mode={mode} bossDex={bossDex} />
  if (w.active && w.bonfire) {
    const team = teamOf(save).filter((p) => data.species[p.dex])
    return (
      <BonfireView
        // A new moment per bonfire.
        key={w.wave}
        team={team.map((p) => ({ uid: p.id, dex: p.dex, shiny: p.shiny }))}
        wave={w.wave}
        waves={mode.waves.length}
        last={lastBonfire(save, data, area.id)}
        percent={mode.bonfirePercent}
        warmed={!!w.warmed}
        onWarm={() => warmBonfire()}
        onTeam={() => navigate('/team')}
        onMoveOn={moveOnFromBonfire}
      >
        <AreaTeam />
      </BonfireView>
    )
  }
  return null
}

/**
 * The way in, as the nightmare's: arriving heals the team and the Box as a Pokémon Center does (the engine's
 * arriveAtWhiteout); the intro plays full screen and waits for a tap, then its pop-up: TEAM goes to the Team screen,
 * where the team can change until it begins (teamSwapsOpen), and coming back shows the pop-up at once; NOT NOW goes
 * Home; BRAVE THE BLIZZARD starts it, wave 1's first foe next.
 */
function WayIn({ area, mode, bossDex }: { area: Area; mode: WhiteoutMode; bossDex: number }) {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const popup = useGame((s) => !!s.run.whiteoutPopup)
  useEffect(() => arriveAtWhiteoutWayIn(area.id), [area.id])
  return (
    <WhiteoutEntry
      mode={mode}
      data={data}
      bossDex={bossDex}
      picture={pictureOf(area.id)?.url ?? null}
      popup={popup}
      onPopup={markWhiteoutPopup}
      onTeam={() => navigate('/team')}
      onBegin={() => {
        markSeen()
        beginWhiteout(area.id)
      }}
      onNotNow={() => {
        markSeen()
        leaveArea()
        navigate('/home')
      }}
    />
  )
}
