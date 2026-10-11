// Extreme mode's clocks (docs/22): K.O. rests that end on the real time, and healing for the time spent out of the
// game. The rules and numbers are the engine's (engine/extreme); this keeps the save in step with the clock.
import { create } from 'zustand'
import { addAwayWindow, awayHeal, isExtreme, settleKo, type AwayHeal, type SaveData, type SaveMode } from '@/engine'
import { activeSlot, readSave } from '@/save/storage'
import { commitSave, mutateSave, useGame } from './game'
import { trustedNow } from './clock'
import { syncServerTime, useServerTime } from './serverTime'

export interface AwayReport {
  minutes: number
  changes: AwayHeal[]
}

/** "While you were away": what the last absence healed, until the player closes the card. */
export const useAwayReport = create<{ report: AwayReport | null }>(() => ({ report: null }))
export const closeAwayReport = () => useAwayReport.setState({ report: null })

/** The save this page isn't playing, as stored on the device (read once: it can't change while this page plays). */
const other = new Map<SaveMode, SaveData | null>()
export function otherSave(): SaveData | null {
  const which: SaveMode = activeSlot() === 'extreme' ? 'main' : 'extreme'
  if (!other.has(which)) other.set(which, readSave(which).save)
  return other.get(which) ?? null
}

/** Extreme mode's rules pop-up has been shown (the main save remembers it). */
export function markExtremeRulesSeen(): void {
  mutateSave((s) => (s.extremeRulesSeen ? null : { ...s, extremeRulesSeen: true }))
}

const inFight = () => {
  const phase = useGame.getState().run.phase
  return phase === 'battle' || phase === 'catch' || phase === 'victory'
}

/**
 * K.O. clocks are settled with every save that enters the store (game.ts `settle`); between saves, time alone ends a
 * rest, so once a minute this asks for a settle when it would change something.
 */
export function settleExtreme() {
  const { save, data } = useGame.getState()
  if (!save || !isExtreme(save)) return
  if (settleKo(save, data, trustedNow()).save !== save) commitSave(save)
}

/** The page is hidden or leaving (or the other save is about to be played): the absence has started. */
let away = false
/** A return seen before the real time was known: when, on the page's own clock (performance.now). */
let returnedAt: number | null = null
let returning = false

/** The absence starts now, on the real time (unknown: this one won't heal). */
export function markAway() {
  away = true
  const { save } = useGame.getState()
  const now = trustedNow()
  if (!save || !isExtreme(save) || save.extreme?.awayFrom != null || now == null) return
  commitSave({ ...save, extreme: { ...save.extreme, awayFrom: now } })
}

/**
 * Back in the game (or loaded, or a save arrived that was left on another device): the absence ends now and waits to
 * heal. The real time is read again first, and the moment of the return is kept on the page's monotonic clock, so a
 * return seen before the time is known still ends the absence then, not later.
 */
export async function comeBack() {
  away = false
  const first = useGame.getState().save
  if (returning || !first || !isExtreme(first) || (first.extreme?.awayFrom == null && !first.extreme?.pending?.length)) return
  returning = true
  // A return already seen and still waiting for the time keeps its moment: this one can't stretch the absence.
  returnedAt ??= performance.now()
  try {
    await syncServerTime()
    finishReturn()
  } finally {
    returning = false
  }
}

/** The return, once the real time is known: the absence closes at the moment the player came back. */
function finishReturn() {
  const now = trustedNow()
  if (returnedAt == null || now == null) return
  const at = now - (performance.now() - returnedAt)
  returnedAt = null
  const save = useGame.getState().save
  if (!save || !isExtreme(save)) return
  const from = save.extreme?.awayFrom
  if (from != null) commitSave(addAwayWindow(save, from, Math.max(from, at)))
  healPending()
}

/** Absences waiting heal now, unless a fight is on: then once it's over. */
export function healPending() {
  const { save, data } = useGame.getState()
  if (!save || !isExtreme(save) || !save.extreme?.pending?.length || inFight()) return
  const res = awayHeal(save, data, save.extreme.pending)
  // Rests that end after the absence end in settle(), now that nothing waits.
  commitSave({ ...res.save, extreme: { ...res.save.extreme, pending: undefined } })
  if (res.changes.some((c) => c.to !== c.from || c.back)) useAwayReport.setState({ report: { minutes: res.minutes, changes: res.changes } })
}

let started = false
/**
 * Once, at start: the heal waiting for a fight to end; a save that arrives with an absence still open (pulled from the
 * cloud, left on another device) while the player is here; a return that waits for the real time.
 */
export function startExtremeClocks() {
  if (started) return
  started = true
  useGame.subscribe((s, prev) => {
    if (s.run.phase !== prev.run.phase) healPending()
    if (s.save !== prev.save && !away && s.save?.extreme?.awayFrom != null && document.visibilityState === 'visible')
      void comeBack()
  })
  useServerTime.subscribe(() => finishReturn())
  void comeBack()
}
