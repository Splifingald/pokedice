// Extreme mode's runs (docs/48): start, play or restart a region's run from its page, in either save. Each save is
// played on its own page load, so from the main save the choice is noted (`pokedice.extremeIntent`, this tab only), the
// page reloads on the Extreme save, and the choice is carried out there once the cloud's copy is settled (a run
// started before that could be written over by an Extreme save the cloud still holds).
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { beginRun, isExtreme, openRun, type RegionId, type SaveData } from '@/engine'
import { activeSlot } from '@/save/storage'
import { trustedNow } from './clock'
import { otherSave } from './extreme'
import { commitSave, initialRun, useGame } from './game'
import { exploreFirstArea, newId } from './run'
import { switchSave, useCloudSync } from './sync'

const INTENT_KEY = 'pokedice.extremeIntent'

/** What the player chose on the Extreme page: play a region's run, or start it from zero on this starter. */
export interface RunIntent {
  region: RegionId
  starter?: number
}

/** The main save, whichever save this page plays. */
export function mainSaveNow(): SaveData | null {
  const save = useGame.getState().save
  return activeSlot() === 'extreme' ? otherSave() : save
}

/** The Extreme save, whichever save this page plays (null when there is none yet). */
export function extremeSaveNow(): SaveData | null {
  const save = useGame.getState().save
  return activeSlot() === 'extreme' ? save : otherSave()
}

/** The real time, or the device's while it isn't known (a timer can't wait on the network to start). */
const now = () => trustedNow() ?? Date.now()

/** Carries out a choice on the Extreme save in play: true when there is a run to go and play. */
function apply(intent: RunIntent): boolean {
  const { save, data, battle } = useGame.getState()
  if (battle) return false
  const x = save && isExtreme(save) ? save : null
  const next =
    intent.starter != null
      ? beginRun(x, data, intent.region, intent.starter, now(), newId, mainSaveNow()?.player ?? x?.player)
      : x && openRun(x, intent.region)
  if (!next) return false
  useGame.setState({ run: initialRun() })
  if (next !== save) commitSave(next)
  return true
}

/**
 * Play, start or restart a region's run. On the Extreme save it happens at once and the player is taken into the run
 * (true); from the main save the page switches to the Extreme save first, and the choice waits there.
 */
export function goToRun(intent: RunIntent): boolean {
  if (activeSlot() !== 'extreme') {
    try {
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent))
    } catch {
      /* private mode: the player picks it again on the other side */
    }
    void switchSave('extreme')
    return false
  }
  return apply(intent) && exploreFirstArea()
}

function readIntent(): RunIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY)
    const v = raw ? (JSON.parse(raw) as RunIntent) : null
    return v && typeof v.region === 'string' ? v : null
  } catch {
    return null
  }
}

/**
 * On the Extreme save's page, the choice made on the main save's: carried out once the sign-in's sync is over (or
 * there is none), then into the run. Mounted once, at the app's root.
 */
export function useRunIntent() {
  const navigate = useNavigate()
  const auth = useGame((s) => s.auth.status)
  const settled = useCloudSync((s) => s.settled)
  useEffect(() => {
    if (activeSlot() !== 'extreme') return
    const ready = auth === 'signed_out' || auth === 'unavailable' || (auth === 'signed_in' && settled)
    if (!ready) return
    const intent = readIntent()
    if (!intent) return
    try {
      sessionStorage.removeItem(INTENT_KEY)
    } catch {
      /* nothing to clear */
    }
    if (apply(intent) && exploreFirstArea()) navigate('/area')
  }, [auth, settled, navigate])
}
