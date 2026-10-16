// The nightmare on the game's screens (docs/30): the guard that keeps the run in its area while it holds the player,
// its INFO, and the area's own steps (the way in: the intro full screen, then
// its pop-up; Darkrai's strike after a round; the waking). The engine (engine/nightmare.ts) decides everything; these only show it.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  nightmareLock,
  nightmareModeOf,
  nightmareStateOf,
  teamOf,
  type Area,
  type NightmareMode,
} from '@/engine'
import { useT } from '@/i18n/react'
import {
  DARKRAI,
  NightmareEntry,
  NightmareRulesModal,
  NightmareStrikeView,
  NightmareVictoryView,
} from '@/components/Nightmare'
import { InfoButton } from '@/components/RulesModal'
import { pictureOf } from '@/fx/areaArt'
import { mutateSave, useGame } from '@/store/game'
import {
  arriveAtNightmareWayIn,
  beginNightmare,
  enterArea,
  finishNightmareVictory,
  healAndStartNightmareRaid,
  leaveArea,
  markNightmarePopup,
  nextNightmareRound,
  strikeNightmare,
} from '@/store/run'
import { progressRaidPath } from '@/screens/events/progressRaids'
import { AreaTeam } from './AreaIdle'

const markSeen = () => mutateSave((s) => (s.nightmareRulesSeen ? null : { ...s, nightmareRulesSeen: true }))

/**
 * While the nightmare holds the player, the run stays in its area (a reload picks it up there). Every page stays open
 * (the Mart, the Team, Home): only travel is shut (engine/nightmare.ts). No screen effect meanwhile (the user,
 * 2026-10-16: "side screen effects make the screen VERY hard to read"): its foes wear the shadow instead.
 */
export function NightmareGuard() {
  const lock = useGame((s) => nightmareLock(s.save, s.data))
  const runArea = useGame((s) => s.run.areaId)
  useEffect(() => {
    if (lock && runArea && runArea !== lock.id) enterArea(lock.id)
  }, [lock, runArea])
  return null
}

/** INFO at the bottom of the area's page: the nightmare's rules again. */
export function NightmareInfo({ mode }: { mode: NightmareMode }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState(false)
  return (
    <>
      <InfoButton name={t('ui.nightmare.title')} onClick={() => setOpen(true)} />
      <NightmareRulesModal open={open} onClose={() => setOpen(false)} mode={mode} data={data} />
    </>
  )
}

/** The area's own step is due now (in place of the usual page between encounters). */
export function nightmareStepDue(
  area: Area,
  s: { save: Parameters<typeof nightmareStateOf>[0]; data: Parameters<typeof nightmareModeOf>[1] },
  run: { nightmareStruck?: boolean },
): boolean {
  if (!nightmareModeOf(area, s.data)) return false
  const n = nightmareStateOf(s.save, area.id)
  return (
    (!!n.won && !n.wonSeen) || (!n.active && !n.won) || (n.active && (!!n.strike || !!run.nightmareStruck))
  )
}

/**
 * The area's own step: the waking once due, the way in while it hasn't begun (and isn't over), Darkrai's strike after
 * a round. Null otherwise (the usual page).
 */
export function NightmareStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const mode = nightmareModeOf(area, data)
  if (!mode) return null
  const n = nightmareStateOf(save, area.id)
  if (n.won && !n.wonSeen)
    return (
      <NightmareVictoryView
        name={data.species[DARKRAI]?.name ?? 'Darkrai'}
        level={mode.raid.level}
        onDone={() => {
          finishNightmareVictory()
          navigate('/home')
        }}
        onRaid={() => {
          const raid = healAndStartNightmareRaid()
          navigate(raid ? progressRaidPath(raid) : '/home')
        }}
      />
    )
  if (!n.active && !n.won) return <WayIn area={area} mode={mode} />
  if (n.active && (n.strike || run.nightmareStruck)) {
    const team = teamOf(save).filter((p) => data.species[p.dex])
    return (
      <NightmareStrikeView
        // A new moment per round won.
        key={n.round}
        team={team.map((p) => ({ uid: p.id, dex: p.dex, shiny: p.shiny }))}
        round={n.round}
        total={mode.foes.length}
        percent={mode.strikePercent}
        hit={!n.strike}
        onStrike={() => strikeNightmare()}
        onContinue={nextNightmareRound}
      >
        <AreaTeam />
      </NightmareStrikeView>
    )
  }
  return null
}

/**
 * The way in (docs/30), as the Distortion World's: arriving heals the team and the Box as a Pokémon Center does (the
 * engine's arriveAtNightmare); the intro plays full screen and waits for a tap, then its pop-up: TEAM goes to the Team
 * screen, where the team can change until BEGIN (teamSwapsOpen), and coming back shows the pop-up at once; NOT NOW goes
 * Home; BEGIN THE NIGHTMARE starts it, round 1's foe next.
 */
function WayIn({ area, mode }: { area: Area; mode: NightmareMode }) {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const popup = useGame((s) => !!s.run.nightmarePopup)
  useEffect(() => arriveAtNightmareWayIn(area.id), [area.id])
  return (
    <NightmareEntry
      mode={mode}
      data={data}
      picture={pictureOf(area.id)?.url ?? null}
      popup={popup}
      onPopup={markNightmarePopup}
      onTeam={() => navigate('/team')}
      onBegin={() => {
        markSeen()
        beginNightmare(area.id)
      }}
      onNotNow={() => {
        markSeen()
        leaveArea()
        navigate('/home')
      }}
    />
  )
}
