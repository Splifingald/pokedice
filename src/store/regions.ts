// Region actions: start the next region, move between the ones you have played, and send a Pokémon on to the next.
import {
  createInstance,
  getRegion,
  newRegionBlock,
  offeredRegion,
  regionOf,
  rescueFromDisabledRegion,
  sendOnTarget as sendOnTargetSave,
  sendPokemonOn as sendPokemonOnSave,
  startRegion as startRegionSave,
  switchRegion as switchRegionSave,
  unlockedRegions,
  type Region,
  type RegionId,
} from '@/engine'
import { t } from '@/i18n'
import { commitSave, initialRun, mutateSave, pushToast, useGame } from './game'
import { newId } from './run'

/** The regions the player can move between right now. One entry = the switcher stays hidden. */
export function availableRegions(): Region[] {
  const { save, data } = useGame.getState()
  return save ? unlockedRegions(save, data) : []
}

/** The region being offered, if a league has just been won and the next one is still untouched. */
export function regionOnOffer(): Region | null {
  const { save, data } = useGame.getState()
  return save ? offeredRegion(save, data) : null
}

/**
 * Move to a region already played. Refused mid-fight — a battle belongs to the region it started in — and the run
 * resets, since the area being explored is not in the region being moved to.
 */
export function switchRegion(to: RegionId): boolean {
  const { save, data, battle } = useGame.getState()
  if (!save || regionOf(save) === to) return false
  if (battle) {
    pushToast('Finish this battle first', 'bad')
    return false
  }
  const region = getRegion(data, to)
  const block = save.parked?.[to]
  if (!region || !block) return false
  // A region with nothing in its Box cannot be played — and a live block with an empty Box does not even parse, so
  // arriving in one would break the save outright. Saves from when a league folded earlier regions forward look
  // exactly like this, which is what made those regions unreachable.
  if (!block.box.length) {
    pushToast(t('ui.region.emptyBox', { region: region.name }), 'bad', 6000)
    return false
  }
  useGame.setState({ run: initialRun() })
  const ok = mutateSave((s) => switchRegionSave(s, to))
  if (ok) pushToast(`Welcome back to ${region.name}`, 'good')
  return ok
}

/**
 * Begin a region on a chosen starter. Everything the player has stays behind in the region they are leaving, parked
 * and whole; this one starts as a new game does.
 */
export function startRegion(regionId: RegionId, starterDex: number): boolean {
  const { save, data, battle } = useGame.getState()
  if (!save || battle) return false
  const region = getRegion(data, regionId)
  if (!region || save.parked?.[regionId] || regionOf(save) === regionId) return false
  useGame.setState({ run: initialRun() })
  const block = newRegionBlock(region, starterDex, data, Date.now(), newId, createInstance)
  const ok = mutateSave((s) => startRegionSave(s, region, block))
  if (ok) pushToast(`${region.name} awaits!`, 'good', 4500)
  return ok
}

/** The region a Pokémon could be sent on to right now, if any — what the sheet's button is named after. */
export function sendOnTarget(): Region | null {
  const { save, data } = useGame.getState()
  return save ? sendOnTargetSave(save, data) : null
}

/** Sends one Pokémon on to the next region's Box, where it waits for the player to travel. */
export function sendPokemonOn(instId: string): boolean {
  const { save, data, battle } = useGame.getState()
  if (!save || battle) return false
  const target = sendOnTargetSave(save, data)
  const name = data.species[save.box.find((p) => p.id === instId)?.dex ?? -1]?.name
  if (!target || !name) return false
  const ok = mutateSave((s) => sendPokemonOnSave(s, data, instId))
  if (ok) pushToast(t('ui.sheet.sentOn', { name, region: target.name }), 'good', 4500)
  return ok
}

/**
 * A region switched off in Admin under a player standing in it: move them somewhere they can still play, keeping
 * their block parked for when it comes back. Runs on boot and after a content swap.
 */
export function rescueIfRegionDisabled(): void {
  const { save, data } = useGame.getState()
  if (!save) return
  const rescued = rescueFromDisabledRegion(save, data)
  if (!rescued) return
  useGame.setState({ run: initialRun() })
  commitSave(rescued.save)
  pushToast(`${rescued.from.name} is closed for now — your progress there is safe`, 'info', 6000)
}
