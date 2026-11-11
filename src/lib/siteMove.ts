// The new address (docs/72), on each side. On the old address, with the switch on for the player: at a calm moment
// (no fight under way) the page stops writing, packs the device's game data, leaves it with the server
// (site_move_drop) and goes to the new address with the code in the link's fragment, which no server sees. The new
// address takes it before the game starts there (src/move.ts, site_move_take). Nothing is sent when the save is the one
// already handed over: the player goes straight on.
import { create } from 'zustand'
import { siteMoveOn } from '@/engine'
import { fingerprint } from '@/save/cloud'
import {
  ARRIVED_KEY,
  encodeMove,
  MOVE_PAGE,
  NEW_ORIGIN,
  OLD_HOST,
  packDevice,
  SENT_KEY,
  STAY_HASH,
} from '@/save/move'
import { flushWrite, freezeWrites, saveKeyOf, thawWrites, writeSave } from '@/save/storage'
import { useGame } from '@/store/game'
import { getSupabase } from './supabase'

interface SiteMoveState {
  /** On the old address: packing and sending, the screen covered meanwhile (SiteMoveCover). */
  leaving: boolean
  /** On the new address: the save just came over; the pop-up says so, once (MovedPopup). */
  arrived: boolean
}

const readArrived = () => {
  try {
    return localStorage.getItem(ARRIVED_KEY) === '1'
  } catch {
    return false
  }
}

export const useSiteMove = create<SiteMoveState>(() => ({ leaving: false, arrived: readArrived() }))

/** The pop-up seen: it never comes back on this device. */
export function arrivalSeen() {
  try {
    localStorage.removeItem(ARRIVED_KEY)
  } catch {
    /* it shows again next load: harmless */
  }
  useSiteMove.setState({ arrived: false })
}

/** Where the player goes: the same page on the new address. */
const target = (code: string | null) =>
  code
    ? `${NEW_ORIGIN}${MOVE_PAGE}?to=${encodeURIComponent(location.pathname + location.search)}#${code}`
    : `${NEW_ORIGIN}${location.pathname}${location.search}`

/**
 * Not this load: the new address sent the player back (its take failed: `#stay`, the next load tries again), or a
 * sign-in is coming back to this page (its tokens or code in the address; supabase-js reads them first).
 */
function stayThisLoad(): boolean {
  if (location.hash === STAY_HASH) {
    history.replaceState(null, '', location.pathname + location.search)
    try {
      localStorage.removeItem(SENT_KEY)
    } catch {
      /* sent again anyway */
    }
    return true
  }
  return (
    /access_token|error_description/.test(location.hash) || new URLSearchParams(location.search).has('code')
  )
}

let tried = false

async function leave() {
  useSiteMove.setState({ leaving: true })
  // What the page still had to write goes first; then nothing more is written, so what is packed is all there is.
  flushWrite()
  freezeWrites()
  const data = packDevice()
  // The saves alone decide whether there is anything new to send: the play-time counters change every second.
  const key = fingerprint(JSON.stringify((['main', 'extreme'] as const).map((w) => data[saveKeyOf(w)] ?? null)))
  let sent: string | null = null
  try {
    sent = localStorage.getItem(SENT_KEY)
  } catch {
    /* sent again */
  }
  if (sent === key) {
    location.replace(target(null))
    return
  }
  try {
    const client = await getSupabase()
    if (!client) throw new Error('offline')
    const { data: code, error } = await client.rpc('site_move_drop', { p_payload: await encodeMove(data) })
    if (error || typeof code !== 'string') throw error ?? new Error('no_code')
    try {
      localStorage.setItem(SENT_KEY, key)
    } catch {
      /* sent again next visit */
    }
    location.replace(target(code))
  } catch (err) {
    // The save stays here and the player plays on (the save written again, in case a write was held back); the next
    // load tries again.
    console.warn('[move] could not hand the save over', err)
    thawWrites()
    writeSave(useGame.getState().save)
    useSiteMove.setState({ leaving: false })
  }
}

/**
 * On the old address only: once the switch is known for the player (signed in or not), at a calm moment (`calm`: no
 * fight, encounter or catch under way, sync.ts's safeToReload), the player goes. Tried once per page load.
 */
export function startSiteMove(calm: () => boolean) {
  if (location.hostname !== OLD_HOST || stayThisLoad()) return
  const check = () => {
    const s = useGame.getState()
    if (tried || s.auth.status === 'unknown' || !siteMoveOn(s.data) || !calm()) return
    tried = true
    unsubscribe()
    clearInterval(timer)
    void leave()
  }
  const unsubscribe = useGame.subscribe(check)
  // What else holds the moment (a Versus fight outside the run) lets go without the store changing.
  const timer = setInterval(check, 5000)
  check()
}
