import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  nightmareModeOf,
  portalModeOf,
  portalStateOf,
  progressOf,
  scaledLevelSpan,
  teamAverageLevel,
  type Area,
  type AreaProgress,
} from '@/engine'
import { AreaTypes } from '@/components/AreaTypes'
import { AutoModeToggle } from '@/components/AutoModeToggle'
import { preloadSprites } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { BattleView } from './battle/BattleView'
import { CasinoView } from './area/CasinoView'
import { TrickView } from './area/TrickView'
import { AreaIdle } from './area/AreaIdle'
import { CenterView } from './area/CenterView'
import { EncounterPreview } from './area/EncounterPreview'
import { RoundGauge } from './area/RoundGauge'
import { AreaDetails } from './home/AreaDetails'
import { RebattleHeader } from './events/RebattlePage'
import { AreaStrip } from '@/components/AreaStrip'
import { WipeView } from './battle/VictoryView'
import { PortalBonuses, PortalInfo, PortalStep } from './area/PortalRun'
import { NightmareInfo, NightmareStep, nightmareStepDue } from './area/NightmareRun'

/**
 * Encounter types, a slim banner, then the name with its round (or a checkmark) and levels, the round gauge and, in a
 * cleared area, the auto-mode switch.
 */
function AreaHeader({ area, progress, teamAvg }: { area: Area; progress: AreaProgress; teamAvg: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const span = area.scalesToTeam ? scaledLevelSpan(area, teamAvg, data) : { min: area.minLevel, max: area.maxLevel }
  const notes = [
    area.scalesToTeam && t('ui.area.foesScale'),
    progress.cleared && t('ui.area.clearedNote', { multiplier: area.backtrackMultiplier }),
  ].filter(Boolean)
  // "Round 2/3" while rounds are still needed; a checkmark once they're all done (secret areas: nothing).
  // 0 rounds: a league of fights only (docs/26), nothing to count.
  // A portal run (docs/28) has no rounds: its gauge counts the portals closed; the nightmare's (docs/30), its rounds.
  const portal = !!portalModeOf(area, data) || !!nightmareModeOf(area, data)
  const need = portal ? null : area.roundsToClear || null
  const done = progress.roundsDone ?? 0
  const [details, setDetails] = useState(false)
  return (
    <section className="pixel-panel overflow-hidden p-0" aria-labelledby="area-title">
      <AreaDetails area={details ? area : null} onClose={() => setDetails(false)} />
      {/* The encounter types sit on the banner's top right corner. */}
      <div className="relative">
        <AreaStrip area={area} h={40} className="block h-auto w-full" />
        <AreaTypes area={area} className="absolute left-2 right-2 top-2" />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            {/* The title opens the area's details, as its plate does on Home. */}
            <h1 id="area-title" className="m-0 min-w-0 text-[32px] font-normal leading-none">
              <button
                type="button"
                onClick={() => setDetails(true)}
                aria-haspopup="dialog"
                className="min-h-[44px] text-left underline decoration-dotted decoration-2 underline-offset-4 md:min-h-0"
              >
                {area.name}
              </button>
            </h1>
            {need != null &&
              (done >= need ? (
                <span
                  className="self-center bg-hp-green px-1.5 text-xl leading-tight text-ink shadow-ring"
                  style={{ borderRadius: 2 }}
                  title={t(`ui.area.allRoundsDone.${need === 1 ? 'one' : 'other'}`, { n: need })}
                  aria-label={t(`ui.area.allRoundsDone.${need === 1 ? 'one' : 'other'}`, { n: need })}
                >
                  ✓
                </span>
              ) : (
                <span className="shrink-0 text-2xl leading-none text-muted">
                  {t('ui.area.roundOf', { n: Math.min(done + 1, need), total: need })}
                </span>
              ))}
          </div>
          <span className="shrink-0 text-2xl leading-none">
            {span.min === span.max
              ? t('ui.area.levelOne', { n: span.min })
              : t('ui.map.levelRange', { min: span.min, max: span.max })}
          </span>
        </div>
        {notes.length > 0 && <div className="text-lg leading-tight text-muted">{notes.join(' · ')}</div>}
        <RoundGauge area={area} progress={progress} />
        {/* A cleared area can play itself: switched here, between its encounters, without a trip Home. */}
        {progress.cleared && (
          <div className="flex justify-end">
            <AutoModeToggle />
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * The encounter route: the preview of what CONTINUE rolled on Home, the Pokémon Center, the Game Corner and the battle.
 * Between encounters the player stays here (AreaIdle: the team, HOME or the next encounter); only a full K.O. (which
 * ends the run) or the HOME buttons go back Home.
 */
export function AreaScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const battle = useGame((s) => s.battle)

  const area = data.areas.find((a) => a.id === (run.areaId ?? save?.currentAreaId))
  useEffect(() => {
    if (area) preloadSprites(area.wildPool.map((w) => w.dex))
  }, [area])

  if (!save) return <Navigate to="/" replace />
  if (battle) return <BattleView key={battle.id} battle={battle} />
  // Trick or Treat takes the whole screen as a battle does (docs/15 §28).
  if (run.phase === 'trick' && run.trick && run.areaId) return <TrickView key={run.trick.id} />
  // An Elite Rebattle run ends on its own page.
  if (!area || !run.areaId || (run.phase === 'idle' && run.rebattle))
    return <Navigate to={run.rebattle ? '/events/rebattle' : '/home'} replace />

  const progress = progressOf(save, area.id)
  // A portal area (docs/28): its way in, a distortion's boons or its victory, in place of the page between encounters.
  const mode = run.rebattle ? null : portalModeOf(area, data)
  const step = mode && run.phase === 'idle' ? <PortalStep area={area} /> : null
  const p = portalStateOf(save, area.id)
  const own = !!mode && ((p.won && !p.wonSeen) || (!p.active && !p.won) || (p.active && !!p.offers?.length))
  // The nightmare's area (docs/30): its way in, its intro, Darkrai's strike after a round, the waking.
  const nm = run.rebattle ? null : nightmareModeOf(area, data)
  const dream = !!nm && run.phase === 'idle' && nightmareStepDue(area, { save, data }, run)
  return (
    <div className="flex flex-col gap-4">
      {run.rebattle ? <RebattleHeader /> : <AreaHeader area={area} progress={progress} teamAvg={teamAverageLevel(save)} />}
      {run.phase === 'preview' && run.encounter && <EncounterPreview enc={run.encounter} />}
      {run.phase === 'center' && <CenterView />}
      {run.phase === 'casino' && <CasinoView />}
      {/* A run that ended outside a fight (nobody left standing): its wipe card. */}
      {run.phase === 'wipe' && <WipeView />}
      {run.phase === 'idle' && own && step}
      {dream && <NightmareStep area={area} />}
      {run.phase === 'idle' && !own && !dream && (
        <>
          {mode && <PortalBonuses area={area} />}
          <AreaIdle area={area} />
        </>
      )}
      {mode && run.phase === 'idle' && <PortalInfo mode={mode} />}
      {nm && run.phase === 'idle' && <NightmareInfo mode={nm} />}
    </div>
  )
}
