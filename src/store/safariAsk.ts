// The Safari's round asked before it begins (docs/61 §4): its price, or that it's free, in a pop-up with HOME beside
// it (a player's report, 2026-11-03: rounds paid without seeing it). rollNext raises it; the pop-up's own button goes on.
import { create } from 'zustand'

export interface SafariAsk {
  areaId: string
  /** 0: a free round. */
  price: number
  /** What every round after the free ones costs (said on the free round's pop-up). */
  next: number
}

export const useSafariAsk = create<{ ask: SafariAsk | null }>(() => ({ ask: null }))

export const askSafari = (ask: SafariAsk) => {
  const now = useSafariAsk.getState().ask
  // The autopilot may ask again while it's up: the same question stays.
  if (now && now.areaId === ask.areaId && now.price === ask.price && now.next === ask.next) return
  useSafariAsk.setState({ ask })
}

export const closeSafariAsk = () => useSafariAsk.setState({ ask: null })
