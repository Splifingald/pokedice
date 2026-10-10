// The Day Care's clocks, run by the store (the engine takes the time and the dice): at app start, when the tab comes
// back, when the Day Care page opens, and from one timer set to the next check (docs/15). And friends' Pokémon: their
// Day Cares read from the cards, the visitors invited, refreshed and sent back.
import {
  createRng,
  dayCareOf,
  friendMonLevel,
  guestKey,
  inviteGuest,
  isDayCareOpen,
  matesOf,
  nextCheckAt,
  processDayCare,
  randomSeed,
  refreshGuests,
  removeGuest,
  type DayCareGuest,
  type EggParent,
} from '@/engine'
import { joinList, t } from '@/i18n'
import { loadFriendDayCares, useFriendCares, type FriendCareMonRow, type FriendDayCareRow } from '@/lib/friends'
import { commitSave, pushToast, useGame } from './game'

let timer: ReturnType<typeof setTimeout> | undefined

/** "Eevee", or "Ditto (Noor)" for a friend's. */
export function parentName(p: EggParent): string {
  const name = useGame.getState().data.species[p.dex]?.name ?? t('ui.common.pokemon')
  return p.owner ? t('ui.dayCare.parentGuest', { name, owner: p.owner }) : name
}

/** Runs the checks that are due. True when one left an Egg. */
export function tickDayCare(now = Date.now()): boolean {
  const { save, data } = useGame.getState()
  if (!save) return false
  const res = processDayCare(save, data, now, createRng(randomSeed()))
  if (res.save !== save) commitSave(res.save)
  const parents = res.laid ? dayCareOf(res.save).egg?.parents : undefined
  if (parents)
    pushToast(t('ui.dayCare.eggLaidToast', { a: parentName(parents[0]), b: parentName(parents[1]) }), 'good', 4500)
  armDayCareTimer()
  return !!res.laid
}

/**
 * One timer, to the next check that could leave an Egg. None while an Egg waits (no check can leave another) or the
 * Day Care is closed: hatching and opening call `tickDayCare`, which sets it again.
 */
export function armDayCareTimer() {
  clearTimeout(timer)
  const { save, data } = useGame.getState()
  if (!save || !isDayCareOpen(save, data) || dayCareOf(save).egg) return
  const now = Date.now()
  // setTimeout keeps 32 bits: a far check is re-armed on the way (the visibility and minute checks run it too).
  const ms = Math.min(2 ** 31 - 1, Math.max(1000, nextCheckAt(save, data, now) - now + 500))
  timer = setTimeout(() => tickDayCare(), ms)
}

// ---------------------------------------------------------------- friends' Pokémon

/**
 * Reads the friends' Day Cares (at most once a minute) and brings the visitors up to date: the ones no longer there
 * go home, with one toast ("Jolteon went home to Lea"); the others' levels follow. Offline nothing changes.
 */
export async function syncFriendDayCares(force = false): Promise<void> {
  const fresh = await loadFriendDayCares(force)
  if (!fresh) return
  const { save, data } = useGame.getState()
  if (!save) return
  const live = useFriendCares.getState().rows.map((r) => ({ owner: r.owner, mons: r.mons }))
  const { save: next, left } = refreshGuests(save, live, Date.now(), data)
  if (next === save) return
  commitSave(next)
  if (left.length)
    pushToast(
      joinList(
        left.map((g) =>
          t('ui.dayCare.wentHome', { name: data.species[g.dex]?.name ?? t('ui.common.pokemon'), owner: g.ownerName }),
        ),
      ),
      'info',
      4500,
    )
}

/** Invite one Pokémon from a friend's Day Care. It visits; nothing changes for the friend. */
export function inviteFriendMon(friend: FriendDayCareRow, mon: FriendCareMonRow): boolean {
  const { save, data } = useGame.getState()
  if (!save) return false
  const guest: DayCareGuest = {
    owner: friend.owner,
    ownerName: friend.name,
    ownerAvatar: friend.avatar,
    inst: mon.inst,
    dex: mon.dex,
    level: friendMonLevel(mon, Date.now(), data),
    ...(mon.shiny && { shiny: true }),
    addedAt: Date.now(),
  }
  const res = inviteGuest(save, guest, data)
  if ('refused' in res) {
    if (res.refused === 'full')
      pushToast(t('ui.dayCare.friendsFull', { n: data.config.dayCare.friendSlots }), 'bad')
    return false
  }
  commitSave(res.save)
  const name = data.species[mon.dex]?.name ?? t('ui.common.pokemon')
  const mates = matesOf(res.save, data, guestKey(guest))
    .filter((m) => m.mine != null)
    .map((m) => data.species[m.dex]?.name ?? '')
  pushToast(
    mates.length
      ? t('ui.dayCare.visitingPairs', { name, owner: friend.name, names: joinList(mates) })
      : t('ui.dayCare.visitingToast', { name, owner: friend.name }),
    'good',
    4500,
  )
  return true
}

/** Send a visitor back to its friend's Day Care. */
export function sendGuestBack(g: DayCareGuest) {
  const { save, data } = useGame.getState()
  if (!save) return
  const next = removeGuest(save, g.owner, g.inst)
  if (next === save) return
  commitSave(next)
  pushToast(t('ui.dayCare.wentBackToast', { name: data.species[g.dex]?.name ?? t('ui.common.pokemon'), owner: g.ownerName }))
}
