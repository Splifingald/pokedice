// Small worlds (docs/21), the store's side: going in and out, the world's Mart, its pop-ups, and the clock that closes
// a world when it ends (or sends the player out of one the admin switched off, keeping their place). That clock only
// acts on the server's time and on content known to be the latest, and never mid-fight: a slow load, a device's clock
// or an admin signing out can never wipe a world.
import {
  buyWorldItem,
  closeWorld,
  enterWorld,
  finishWorld,
  getRegion,
  heldWorld,
  isExtreme,
  leaveWorld,
  markWorldBye,
  markWorldFinishSeen,
  markWorldSeen,
  nightmareLock,
  payWheelPrize,
  regionOf,
  worldById,
  worldFor,
  worldOver,
  worldsOn,
  worldState,
  type GameData,
  type SmallWorld,
} from '@/engine'
import { getLang, t } from '@/i18n'
import { commitSave, initialRun, mutateSave, pushToast, useGame } from './game'
import { trustedNow } from './clock'
import { collectRaidGifts } from './raidGifts'
import { newId } from './run'
import { serverNow, useServerNow, useServerTime } from './serverTime'

/** A world's name: the admin's title in this language (or English), else its region's name, else "Small world". */
export function worldName(w: SmallWorld | null | undefined, data: GameData): string {
  if (!w) return t('ui.world.name')
  return w.title[getLang()]?.trim() || w.title.en?.trim() || getRegion(data, w.regionId)?.name || t('ui.world.name')
}

/** The world open to this player right now (running, switched on for them, their badges), on the server's clock. */
export function currentWorldOpen(): SmallWorld | null {
  const { save, data } = useGame.getState()
  return save ? worldFor(save, data, serverNow()) : null
}

/** The world open to this player and the server time, re-read every `ms`. */
export function useWorld(ms = 1000): { world: SmallWorld | null; now: number | null } {
  const now = useServerNow(ms)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  return { world: save ? worldFor(save, data, now) : null, now }
}

/**
 * Into the world that's open: the first time a fresh start on the partner picked (`starter`), afterwards back where the
 * player left it. Refused mid-fight. The region being left is parked as it is.
 */
export function enterSmallWorld(starter: number | null = null): boolean {
  const { save, data, battle } = useGame.getState()
  if (!save) return false
  if (battle) {
    pushToast(t('ui.region.finishFight'), 'bad')
    return false
  }
  const world = worldFor(save, data, serverNow())
  if (!world) {
    pushToast(t('ui.world.notOpen'), 'bad')
    return false
  }
  const first = heldWorld(save)?.id !== world.id
  const next = enterWorld(save, data, world, starter, Date.now(), newId)
  if (!next || next === save) return false
  useGame.setState({ run: initialRun() })
  commitSave(next)
  pushToast(t(first ? 'ui.world.welcome' : 'ui.world.welcomeBack', { world: worldName(world, data) }), 'good', 4500)
  return true
}

/** Back to the region the player came from; the world keeps their place. Refused mid-fight. */
export function leaveSmallWorld(): boolean {
  const { save, data, battle } = useGame.getState()
  if (!save) return false
  if (battle) {
    pushToast(t('ui.region.finishFight'), 'bad')
    return false
  }
  // Darkrai's nightmare (docs/30) holds the player in its area, so in the world too, until they wake up.
  const held = nightmareLock(save, data)
  if (held) {
    pushToast(t('ui.nightmare.locked', { area: held.name }), 'info')
    return false
  }
  const next = leaveWorld(save, data)
  if (!next) return false
  useGame.setState({ run: initialRun() })
  // What waited outside while the player was in (a wheel prize, friends' raid gifts) comes in now.
  commitSave(payWheelPrize(next, data, Date.now(), newId))
  pushToast(t('ui.world.back', { region: getRegion(data, regionOf(next))?.name ?? '' }), 'good')
  void collectRaidGifts(true)
  return true
}

/**
 * Finishes the world (docs/21 §11): every area done and its Pokédex complete, the player closes it for themselves, as
 * at its end. Back where they came from, its Pokémon gone home; its closing pop-up follows. Refused mid-fight.
 */
export function finishSmallWorld(): boolean {
  const { save, data, battle } = useGame.getState()
  if (!save) return false
  if (battle) {
    pushToast(t('ui.region.finishFight'), 'bad')
    return false
  }
  const held = nightmareLock(save, data)
  if (held) {
    pushToast(t('ui.nightmare.locked', { area: held.name }), 'info')
    return false
  }
  const next = finishWorld(save, data, serverNow())
  if (!next) return false
  useGame.setState({ run: initialRun() })
  // What waited outside while the player was in comes in now, as on the way out.
  commitSave(payWheelPrize(next, data, Date.now(), newId))
  void collectRaidGifts(true)
  return true
}

/** The pop-up offering to finish the world was shown. */
export function markWorldFinishPopupSeen(): void {
  mutateSave((s) => {
    const next = markWorldFinishSeen(s)
    return next === s ? null : next
  })
}

/** Buys from the world's Mart; false (and a toast) when it can't. */
export function buyWorld(key: string, qty = 1): boolean {
  const { data } = useGame.getState()
  const ok = mutateSave((s) => buyWorldItem(s, data, key, qty, Date.now(), newId))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

/** The opening pop-up was shown. */
export function markWorldPopupSeen(world: SmallWorld): void {
  mutateSave((s) => {
    const next = markWorldSeen(s, world)
    return next === s ? null : next
  })
}

/** The closing pop-up was shown. */
export function markWorldByeSeen(id: string): void {
  mutateSave((s) => markWorldBye(s, id))
}

/** Nothing under way that moving the player would cut short: no fight, nothing on screen from an encounter. */
const calm = () => {
  const s = useGame.getState()
  return !s.battle && s.run.phase === 'idle'
}

/**
 * The world's clock. Its end passed (or the admin ended it, or deleted it from the latest content): it closes, with
 * whoever is inside sent back first. Switched off, or not open to this player any more (the admin's "On for admin",
 * once the sign-in is known), or moved to later: the player is sent out and the world keeps their place.
 */
export function settleWorlds(): void {
  // What it does (a new save, the run reset) wakes it again: that inner call has nothing to add, and one acting on the
  // save as it was before this one commits would never end.
  if (settling) return
  settling = true
  try {
    settleOnce()
  } finally {
    settling = false
  }
}
let settling = false

function settleOnce(): void {
  const { save, data, contentChecked, auth } = useGame.getState()
  const held = save && heldWorld(save)
  if (!save || !held) return
  const inside = regionOf(save) === held.regionId
  if (inside && !calm()) return
  const now = serverNow()
  // Closing deletes the world's block, so its end is read on the page's own steady clock since the last reading of the
  // server's (store/clock.ts), never on the device's, which can move between two readings: a world closed a week early
  // on a player's phone (2026-10-25). Sending a player out (below) loses nothing, and keeps the usual clock.
  if (worldOver(save, data, trustedNow(), contentChecked)) {
    const next = closeWorld(save, data)
    if (next === save) return
    commitSave(next, { auto: true })
    if (inside) useGame.setState({ run: initialRun() })
    return
  }
  if (!inside || !contentChecked || now == null) return
  const world = worldById(data, held.id)
  if (!world) return
  const hidden =
    isExtreme(save) ||
    data.config.smallWorlds?.access === 'off' ||
    (auth.status !== 'unknown' && !worldsOn(data)) ||
    worldState(world, now) === 'scheduled'
  if (!hidden) return
  const next = leaveWorld(save, data)
  if (!next) return
  commitSave(next, { auto: true })
  useGame.setState({ run: initialRun() })
  pushToast(t('ui.world.paused', { world: worldName(world, data) }), 'info', 6000)
}

let started = false
/** Runs the world's clock: whenever the save, the content, the sign-in or the server time change, and every 30 s. */
export function startWorldClock(): void {
  if (started) return
  started = true
  settleWorlds()
  useGame.subscribe((s, prev) => {
    if (s.save !== prev.save || s.data !== prev.data || s.contentChecked !== prev.contentChecked || s.auth !== prev.auth || s.run !== prev.run)
      settleWorlds()
  })
  useServerTime.subscribe(() => settleWorlds())
  setInterval(settleWorlds, 30_000)
}
