// The autopilot's clock on the area's page (docs/36): every step is the engine's (store/autopilot → engine/autopilot);
// this only waits long enough for each moment to be seen, and holds while a pop-up has the player's attention.
import { useEffect, useState } from 'react'
import { autoStepNow, runAutoStep, useAutoLevel } from '@/store/autopilot'
import { useGame, type RunPhase } from '@/store/game'

/** How long each moment stays on screen before the next step (ms). A fight, a catch and Trick or Treat are re-checked. */
const PACE: Record<RunPhase, number> = {
  idle: 900,
  preview: 250,
  center: 700,
  casino: 300,
  stalemate: 1200,
  wipe: 1400,
  victory: 1000,
  battle: 1000,
  catch: 1000,
  trick: 1000,
}

/** A pop-up is open (a feature's rules, a sheet the player opened): the autopilot waits for it to close. */
const heldByPopup = () =>
  typeof document !== 'undefined' && !!document.querySelector('[aria-modal="true"],[role="dialog"]')

/** Runs the autopilot while this page is up and the run plays itself; true while it does. */
export function useAutopilot(): boolean {
  const full = useAutoLevel() === 'full'
  const phase = useGame((s) => s.run.phase)
  const areaId = useGame((s) => s.run.areaId)
  const encounter = useGame((s) => s.run.encounter)
  // Re-checked after every step, so a wait (a pop-up, a rest) picks up again by itself.
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    if (!full) return
    const timer = setTimeout(() => {
      const step = autoStepNow(heldByPopup())
      if (step) runAutoStep(step)
      setBeat((n) => n + 1)
    }, PACE[phase])
    return () => clearTimeout(timer)
  }, [full, phase, areaId, encounter, beat])
  return full
}
