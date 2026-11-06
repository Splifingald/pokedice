// Whose turn it is among the one-time pop-ups (engine/popups.ts). GameLayout's PopupQueue works it out once for the
// whole game; each pop-up opens only on its own turn, so they queue rather than stack. Apart from PopupQueue.tsx, which
// imports every pop-up, so the pop-ups can read their turn without importing each other.
import { createContext, useContext, useEffect } from 'react'
import { create } from 'zustand'
import type { OneTimePopup } from '@/engine'

export const PopupTurnContext = createContext<OneTimePopup | null>(null)

/** The one-time pop-up due now; null when none is, or mid-fight, or over a full-screen moment. */
export const usePopupTurn = (): OneTimePopup | null => useContext(PopupTurnContext)

/** This pop-up's turn has come. */
export const useMyTurn = (id: OneTimePopup): boolean => usePopupTurn() === id

/** The pop-up actually on screen: it keeps its turn while it's due, so one that comes in later can't snatch the screen. */
export const usePopupOnScreen = create<{ id: OneTimePopup | null }>(() => ({ id: null }))

/**
 * After a one-time pop-up closes, the next one waits this long (docs/42): two of them never chain on arrival (the Day
 * Care's rules, then the invite), each comes on its own visit. In memory: a fresh page load starts with no wait.
 */
export const POPUP_GAP_MS = 60_000

/** A queued pop-up says when it's open (its turn may come before it can open: a sync still under way). */
export function useOnScreen(id: OneTimePopup, open: boolean) {
  useEffect(() => {
    if (!open) return
    usePopupOnScreen.setState({ id })
    return () => {
      if (usePopupOnScreen.getState().id === id) usePopupOnScreen.setState({ id: null })
    }
  }, [id, open])
}

/**
 * CONTINUE pressed at a Pokémon Center while the dice tutorial waits for its heal to play (docs/46 §5): the tutorial
 * opens at once rather than the Center being left without it (a tap on the result card's CONTINUE landing on the
 * Center's own, in the same spot, skipped it). Back to false as the Center closes.
 */
export const useCenterRush = create<{ on: boolean }>(() => ({ on: false }))
