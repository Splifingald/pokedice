// The autopilot's glue (docs/36): the engine decides each step (engine/autopilot), this carries it out through the run
// store's own actions, as the player's taps would.
import {
  autoLevel,
  autopilotStep,
  isDoubleEncounter,
  playStyleOf,
  settingsForStyle,
  teamOf,
  withDetour,
  type AutoLevel,
  type AutopilotStep,
  type AutoView,
  type PlayStyle,
} from '@/engine'
import { t } from '@/i18n'
import { commitSave, mutateSave, pushToast, setSettings, useGame, type CatchThrow } from './game'
import {
  afterStalemate,
  afterWipe,
  continueExploring,
  engage,
  enterArea,
  finishCenter,
  leaveCasino,
  outOfEnergy,
} from './run'
import { serverNow } from './serverTime'

/** How much of the current run plays itself (engine/autopilot's autoLevel), as a hook. */
export function useAutoLevel(): AutoLevel {
  return useGame((s) => (s.save ? autoLevel(s.save, s.data, s.settings, s.run) : 'off'))
}

/** The autopilot's next step as things stand, or null when it isn't running. `held`: a pop-up is open. */
export function autoStepNow(held = false): AutopilotStep | null {
  const { save, data, settings, run } = useGame.getState()
  if (!save || !run.areaId || autoLevel(save, data, settings, run) !== 'full') return null
  return autopilotStep(
    save,
    data,
    playStyleOf(settings),
    {
      phase: run.phase,
      areaId: run.areaId,
      encounter: run.encounter?.kind ?? null,
      pendingCatch: !!run.pendingCatchId,
      held,
      noEnergy: run.phase === 'idle' && outOfEnergy(),
      catch: run.catch
        ? { dex: run.catch.dex, shiny: !!run.catch.shiny, throw: throwOf(run.catch.result) }
        : undefined,
    },
    serverNow(),
  )
}

/** Where the catch panel's throw stands, as the engine reads it. */
function throwOf(r: CatchThrow | null): NonNullable<AutoView['catch']>['throw'] {
  if (!r) return 'none'
  if (r.baitOffer) return 'bait'
  return r.stays ? 'stays' : 'done'
}

const areaName = (id: string) => useGame.getState().data.areas.find((a) => a.id === id)?.name ?? ''

/** Into another area, the save's detour set or cleared first (enterArea starts the run afresh there). */
function moveTo(areaId: string, detour: Extract<AutopilotStep, { do: 'travel' }>['detour']) {
  const save = useGame.getState().save
  if (save) {
    const next = withDetour(save, detour)
    if (next !== save) commitSave(next)
  }
  return enterArea(areaId)
}

/**
 * Carries one step out. 'wait' and 'close' (the result card closes itself) do nothing here, nor do Idle's catch steps:
 * the battle screen plays them, so the throw is seen on the stage (BattleView).
 */
export function runAutoStep(step: AutopilotStep) {
  const { save, run } = useGame.getState()
  if (!save) return
  switch (step.do) {
    case 'continue':
      continueExploring()
      return
    case 'engage': {
      // The lead the preview would have picked: the first able to fight (two for a double battle, docs/33).
      const able = teamOf(save)
        .filter((p) => p.currentHp > 0)
        .map((p) => p.id)
      const enc = run.encounter
      engage(enc && isDoubleEncounter(enc) ? able.slice(0, 2) : able[0])
      return
    }
    case 'leave':
      if (run.phase === 'center') {
        finishCenter()
        pushToast(t('ui.idle.healed'), 'good')
      } else if (run.phase === 'casino') leaveCasino()
      else if (run.phase === 'stalemate') afterStalemate()
      return
    case 'travel': {
      const back = save.idle?.detour
      if (!moveTo(step.areaId, step.detour)) return
      pushToast(
        back && back.from === step.areaId
          ? t('ui.idle.back', { area: areaName(step.areaId) })
          : t('ui.home.nowExploring', { area: areaName(step.areaId) }),
        'good',
      )
      return
    }
    case 'retreat': {
      const lost = run.areaId
      afterWipe()
      // Straight on: the wipe card's TRY AGAIN, into the area the engine picked (the run store resets the run there).
      if (!moveTo(step.areaId, step.detour)) return
      if (step.detour && lost)
        pushToast(t('ui.idle.retreat', { area: areaName(step.areaId), lost: areaName(lost) }), 'info', 4500)
      return
    }
    case 'forget':
      mutateSave((s) => withDetour(s, null))
      return
  }
}

/** The player picks a play style (Settings, or a new game's question): its settings, nothing else. */
export function choosePlayStyle(style: PlayStyle) {
  setSettings(settingsForStyle(style))
}
