// The Elite Rebattle's gauntlet (docs/19 §5.3): each fight is a League battle on the region's League area, through
// the usual battle screens (/area). store/run.ts hands its K.O.s and losses to the rebattle rules when `run.rebattle`
// is set; these start a fight, move on to the next one and leave.
import { create } from 'zustand'
import {
  applyRebattleLoss,
  currentTier,
  hasAbleTeam,
  leagueArea,
  rebattleEncounter,
  regionOf,
} from '@/engine'
import { commitSave, initialRun, useGame } from './game'

/** A tier just cleared: its medal card waits on the rebattle page. */
export const useRebattleMedal = create<{ medal: { regionId: string; tier: number; gold: number } | null }>(() => ({ medal: null }))

/**
 * The live region's next gauntlet fight: its trainer's card, ready to engage. A team with nobody left standing (a fight
 * lost outside the gauntlet's own rules) starts the tier over, healed. False when there is nothing to fight.
 */
export function startRebattle(): boolean {
  const { data } = useGame.getState()
  let save = useGame.getState().save
  if (!save) return false
  const regionId = regionOf(save)
  if (!hasAbleTeam(save)) {
    save = applyRebattleLoss(save, data, regionId)
    commitSave(save)
  }
  const encounter = rebattleEncounter(save, data, regionId)
  const league = leagueArea(data, regionId)
  if (!encounter || !league) return false
  useGame.setState({
    battle: null,
    run: { ...initialRun(), areaId: league.id, phase: 'preview', encounter, rebattle: { regionId, tier: currentTier(save, data, regionId) } },
  })
  return true
}

/** Back to the rebattle page: the gauntlet keeps its place (the next fight waits there). */
export function leaveRebattle(): void {
  const rebattle = useGame.getState().run.rebattle
  useGame.setState({ battle: null, run: { ...initialRun(), rebattle } })
}

/** The page is open again: whatever run brought the player here is over. */
export function clearRebattleRun(): void {
  const { run } = useGame.getState()
  if (run.rebattle && run.phase === 'idle') useGame.setState({ run: initialRun() })
}
