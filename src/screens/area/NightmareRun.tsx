// The nightmare on the game's screens (docs/30): the guard that keeps the run in its area while it holds the player
// (and the screen's vignette meanwhile), its INFO, and the area's own steps (the way in, the intro and its rules once,
// Darkrai's strike after a round, the waking). The engine (engine/nightmare.ts) decides everything; these only show it.
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
  NightmareFx,
  NightmareIntro,
  NightmareRulesModal,
  NightmareStrikeView,
  NightmareVictoryView,
  NightmareWayInView,
} from '@/components/Nightmare'
import { InfoButton } from '@/components/RulesModal'
import { pictureOf } from '@/fx/areaArt'
import { mutateSave, useGame } from '@/store/game'
import {
  arriveAtNightmareWayIn,
  beginNightmare,
  enterArea,
  finishNightmareIntro,
  finishNightmareVictory,
  healAndStartNightmareRaid,
  leaveArea,
  nextNightmareRound,
  strikeNightmare,
} from '@/store/run'
import { progressRaidPath } from '@/screens/events/progressRaids'
import { AreaTeam } from './AreaIdle'

const markSeen = () => mutateSave((s) => (s.nightmareRulesSeen ? null : { ...s, nightmareRulesSeen: true }))

/**
 * While the nightmare holds the player, the run stays in its area (a reload picks it up there) and the screen wears the
 * dream's vignette. Every page stays open (the Mart, the Team, Home): only travel is shut (engine/nightmare.ts).
 */
export function NightmareGuard() {
  const lock = useGame((s) => nightmareLock(s.save, s.data))
  const runArea = useGame((s) => s.run.areaId)
  useEffect(() => {
    if (lock && runArea && runArea !== lock.id) enterArea(lock.id)
  }, [lock, runArea])
  return lock ? <NightmareFx /> : null
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
  run: { nightmareIntro?: boolean; nightmareStruck?: boolean },
): boolean {
  if (!nightmareModeOf(area, s.data)) return false
  const n = nightmareStateOf(s.save, area.id)
  return (
    (!!n.won && !n.wonSeen) ||
    (!n.active && !n.won) ||
    (n.active && (!!run.nightmareIntro || !!n.strike || !!run.nightmareStruck))
  )
}

/**
 * The area's own step: the waking once due, the intro just after BEGIN (then its rules the first time), the way in
 * while it hasn't begun (and isn't over), Darkrai's strike after a round. Null otherwise (the usual page).
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
  if (n.active && run.nightmareIntro) return <IntroThenRules area={area} mode={mode} />
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

/** The intro, then (the first time) its rules over its held end; then the first round. */
function IntroThenRules({ area, mode }: { area: Area; mode: NightmareMode }) {
  const data = useGame((s) => s.data)
  const seen = useGame((s) => !!s.save?.nightmareRulesSeen)
  const [rules, setRules] = useState(false)
  return (
    <>
      <NightmareIntro
        picture={pictureOf(area.id)?.url ?? null}
        under={rules}
        onContinue={() => (seen ? finishNightmareIntro() : setRules(true))}
      />
      <NightmareRulesModal
        open={rules}
        onClose={() => {
          markSeen()
          setRules(false)
          finishNightmareIntro()
        }}
        mode={mode}
        data={data}
      />
    </>
  )
}

/**
 * The way in (docs/30): arriving heals the team and the Box as a Pokémon Center does (the engine's arriveAtNightmare),
 * and until it begins the team can change in the Team screen (teamSwapsOpen); NOT NOW goes Home; BEGIN THE NIGHTMARE
 * starts it, its intro next.
 */
function WayIn({ area, mode }: { area: Area; mode: NightmareMode }) {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  useEffect(() => arriveAtNightmareWayIn(area.id), [area.id])
  return (
    <NightmareWayInView
      mode={mode}
      data={data}
      onTeam={() => navigate('/team')}
      onBegin={() => beginNightmare(area.id)}
      onNotNow={() => {
        leaveArea()
        navigate('/home')
      }}
    />
  )
}
