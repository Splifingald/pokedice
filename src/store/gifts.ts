// Gifts from the developer (docs/15 §23): when the player closes a message that carries one, its gifts are claimed
// from the server (each comes once), put in the save by the engine's rules (engine/gifts.ts), pushed to the cloud for a
// signed-in player, and their opening plays full screen (GiftMoment) with what arrived and where it went.
import { create } from 'zustand'
import { applyGifts, giftsWait, type GiftLanded } from '@/engine'
import { t } from '@/i18n'
import { claimGifts, useInbox } from '@/lib/feedback'
import { mutateSave, pushToast, useGame } from './game'
import { newId } from './run'
import { pushSaveNow, syncSettled } from './sync'

interface GiftsState {
  /** The opening on screen: everything that arrived, in order; null when none plays. */
  opening: GiftLanded[] | null
  /**
   * Whose gift it is: the developer's (a message), or invite rewards (docs/15 §25) and a gift calendar's door
   * (docs/55), which reuse the same opening.
   */
  source: GiftSource
  /** A calendar's door: its day, for the opening's first line. */
  day?: number
  /** Asking the server: the button waits. */
  busy: boolean
}

export type GiftSource = 'message' | 'invite' | 'calendar' | 'market'

export const useGiftMoment = create<GiftsState>(() => ({ opening: null, source: 'message', busy: false }))

/**
 * Gifts can be opened here and now: the save is in the main game outside a small world, the switch is on, and a
 * signed-in player's save has settled with the cloud copy (or the cloud one could replace what the gifts went into).
 */
export function canOpenGifts(): boolean {
  const { save, data, auth } = useGame.getState()
  if (!save || giftsWait(save, data)) return false
  return auth.status !== 'signed_in' || syncSettled()
}

/** Opens these messages' gifts: claimed, into the save, then the opening plays. Offline, they wait for later. */
export async function openGifts(ids: number[]): Promise<void> {
  if (!ids.length || useGiftMoment.getState().busy || !canOpenGifts()) return
  useGiftMoment.setState({ busy: true })
  try {
    const rows = await claimGifts(ids)
    const landed: GiftLanded[] = []
    for (const row of rows)
      mutateSave((s) => {
        const res = applyGifts(s, useGame.getState().data, row.id, row.gifts, Date.now(), newId)
        if (!res) return null
        landed.push(...res.landed)
        return res.save
      })
    // Opened here or elsewhere (another tab got there first): nothing waits on these now.
    useInbox.getState().markOpened(ids)
    if (landed.length) {
      useGiftMoment.setState({ opening: landed, source: 'message' })
      void pushSaveNow().catch(() => {})
    }
  } catch (err) {
    console.warn('[gifts] not opened:', err instanceof Error ? err.message : err)
    useInbox.getState().putOff(ids)
    pushToast(t('ui.gift.failed'), 'bad')
  } finally {
    useGiftMoment.setState({ busy: false })
  }
}

/** The player asked for these gifts (closed their message, or OPEN IT in My messages): they open straight away. */
export function requestGifts(ids: number[]): void {
  if (!ids.length || !useGame.getState().save || !canOpenGifts()) return
  void openGifts(ids)
}

export const closeGiftMoment = () => useGiftMoment.setState({ opening: null })
