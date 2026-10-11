// Extreme mode's clocks (docs/20): K.O. rests that end on the real time, and healing for the time spent out of the
// game. The rules and numbers are the engine's (engine/extreme); this keeps the save in step with the clock.
import { create } from 'zustand'
import { addAwayWindow, awayHeal, isExtreme, settleKo, type AwayHeal, type SaveData, type SaveMode } from '@/engine'
import { t } from '@/i18n'
import { activeSlot, readSave } from '@/save/storage'
import { commitSave, mutateSave, pushToast, useGame } from './game'
import { serverNow, syncServerTime } from './serverTime'

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
 * Every K.O. clock right, as of now: a Pokémon that just went down starts resting, a revived one stops, and one whose
 * rest is over comes back. Rests only end on the real time (the device's clock alone can't cut one short).
 */
export function settleExtreme() {
  const { save, data } = useGame.getState()
  if (!save || !isExtreme(save)) return
  const real = serverNow()
  const r = settleKo(save, data, real ?? Date.now(), real != null)
  if (r.save === save) return
  commitSave(r.save)
  for (const id of r.back) {
    const inst = r.save.box.find((p) => p.id === id)
    if (inst) pushToast(t('ui.extreme.backToast', { name: data.species[inst.dex]?.name ?? '' }), 'good', 4000)
  }
}

/** The page is going hidden or away: the absence starts now (on the real time; unknown → this one won't heal). */
export function markAway() {
  const { save } = useGame.getState()
  const now = serverNow()
  if (!save || !isExtreme(save) || save.extreme?.awayFrom != null || now == null) return
  commitSave({ ...save, extreme: { ...save.extreme, awayFrom: now } })
}

/**
 * Back in the game (or loaded): the absence ends and waits to heal. The real time is read again first — the device's
 * clock may have moved while away. Unknown (offline): it keeps waiting.
 */
export async function comeBack() {
  const first = useGame.getState().save
  if (!first || !isExtreme(first) || (first.extreme?.awayFrom == null && !first.extreme?.pending?.length)) return
  await syncServerTime()
  const now = serverNow()
  const save = useGame.getState().save
  if (now == null || !save || !isExtreme(save)) return
  const from = save.extreme?.awayFrom
  if (from != null) commitSave(addAwayWindow(save, from, Math.max(from, now)))
  healPending()
}

/** Absences waiting heal now, unless a fight is on: then once it's over. */
export function healPending() {
  const { save, data } = useGame.getState()
  if (!save || !isExtreme(save) || !save.extreme?.pending?.length || inFight()) return
  const res = awayHeal(save, data, save.extreme.pending)
  commitSave({ ...res.save, extreme: { ...res.save.extreme, pending: undefined } })
  if (res.changes.some((c) => c.to !== c.from || c.back)) useAwayReport.setState({ report: { minutes: res.minutes, changes: res.changes } })
}

let started = false
/** K.O. clocks after every save change, and the heal waiting for a fight to end. Once, at start. */
export function startExtremeClocks() {
  if (started) return
  started = true
  useGame.subscribe((s, prev) => {
    if (s.save !== prev.save) settleExtreme()
    if (s.run.phase !== prev.run.phase) healPending()
  })
  settleExtreme()
  void comeBack()
}
