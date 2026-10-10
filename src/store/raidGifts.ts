// Gifts from raiding friends (docs/18 §3 "Helper rewards"): when a friend catches a raid Pokémon with your raid team
// beside them, you get an item. They're claimed when the game opens, when you sign in and when you come back to the
// tab (at most every few minutes), go straight into the bag of the region being played, and wait in a pop-up.
import { create } from 'zustand'
import { addRaidGifts } from '@/engine'
import { claimRaidGifts, type RaidGift } from '@/lib/raid'
import { mutateSave, useGame } from './game'

export const useRaidGifts = create<{ gifts: RaidGift[] }>(() => ({ gifts: [] }))

/** No more often than this when the tab comes back into view. */
const EVERY_MS = 5 * 60_000
let last = 0
let busy = false

/** Claims any gifts waiting (signed in, raids switched on): into the bag, and onto the pop-up. */
export async function collectRaidGifts(force = false): Promise<void> {
  const { auth, save, data } = useGame.getState()
  if (busy || auth.status !== 'signed_in' || !save || !data.config.events.raid.enabled) return
  if (!force && Date.now() - last < EVERY_MS) return
  busy = true
  last = Date.now()
  try {
    const gifts = await claimRaidGifts()
    if (!gifts.length) return
    mutateSave((s) => addRaidGifts(s, useGame.getState().data, gifts.map((g) => g.itemKey)))
    useRaidGifts.setState((st) => ({ gifts: [...st.gifts, ...gifts] }))
  } finally {
    busy = false
  }
}

/** The pop-up was closed: the gifts are already in the bag. */
export const dismissRaidGifts = () => useRaidGifts.setState({ gifts: [] })
