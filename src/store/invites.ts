// Friend invite rewards (docs/15 §24): the tiers the invite gauge has reached are claimed from the server (each comes
// once), put in the save by the engine's rules (engine/invites.ts, which places them as the developer's gifts are),
// pushed to the cloud, and their opening plays full screen with the gifts' own moment (GiftMoment).
import { create } from 'zustand'
import {
  applyInviteReward,
  badgesHeld,
  invitesOf,
  invitesWait,
  markInviteRulesSeen,
  type GiftLanded,
  type SaveData,
} from '@/engine'
import { t } from '@/i18n'
import { claimInviteRewards, loadInviteStatus, recordInvite } from '@/lib/friends'
import { mutateSave, pushToast, useGame } from './game'
import { useGiftMoment } from './gifts'
import { newId } from './run'
import { pushSaveNow, syncSettled } from './sync'

interface InvitesState {
  /** Asking the server: the button waits. */
  busy: boolean
  /** "Later" on the reward's pop-up: it doesn't come back until the next page load. */
  putOff: boolean
}

export const useInviteRewards = create<InvitesState>(() => ({ busy: false, putOff: false }))

/** The rules seen: a save that has seen them already isn't written again. */
const rulesSeen = (s: SaveData) => (invitesOf(s).rulesSeen ? null : markInviteRulesSeen(s))

/**
 * Rewards can be opened here and now: signed in, the main game outside a small world, the switch on, and the save
 * settled with the cloud copy (so the cloud one can't replace what the gifts went into).
 */
export function canOpenInviteRewards(): boolean {
  const { save, data, auth } = useGame.getState()
  return !!save && auth.status === 'signed_in' && !invitesWait(save, data) && syncSettled()
}

/** Opens every tier reached: claimed, into the save, then the gifts' opening plays. Offline, they wait for later. */
export async function openInviteRewards(): Promise<void> {
  if (useInviteRewards.getState().busy || !canOpenInviteRewards()) return
  useInviteRewards.setState({ busy: true })
  try {
    const rows = await claimInviteRewards()
    const landed: GiftLanded[] = []
    // Opening them is seeing what they are: the rules pop-up has nothing left to announce.
    mutateSave(rulesSeen)
    for (const row of rows)
      mutateSave((s) => {
        const res = applyInviteReward(s, useGame.getState().data, row.friends, row.gifts, Date.now(), newId)
        if (!res) return null
        landed.push(...res.landed)
        return res.save
      })
    if (landed.length) {
      useGiftMoment.setState({ opening: landed, source: 'invite' })
      void pushSaveNow().catch(() => {})
    } else void loadInviteStatus(true)
  } catch (err) {
    console.warn('[invites] not opened:', err instanceof Error ? err.message : err)
    pushToast(t('ui.invite.failed'), 'bad')
  } finally {
    useInviteRewards.setState({ busy: false })
  }
}

export const putOffInviteRewards = () => useInviteRewards.setState({ putOff: true })

export const seeInviteRules = () => mutateSave(rulesSeen)

/**
 * The invite link just made the player friends with its owner: tell the server, which counts them for the owner if
 * they're a new player. True when it counted. Asked only while the switch is on for anyone; a database without 0049
 * (or any failure) just doesn't count.
 */
export async function countInvite(code: string): Promise<boolean> {
  const { save, data } = useGame.getState()
  if (!save || (data.config.inviteRewards?.access ?? 'off') === 'off') return false
  try {
    return (await recordInvite(code, badgesHeld(save, data))) === 'counted'
  } catch (err) {
    console.warn('[invites] not counted:', err instanceof Error ? err.message : err)
    return false
  }
}
