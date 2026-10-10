// The friend list's background work (docs/16), mounted with the game shell:
// - friend_status() once sign-in settles; on return to the tab it runs from store/sync (at most every 5 minutes);
// - a toast for each new friend, once per device, never in the middle of a fight;
// - an invite link that was opened (/f/<code>): signed in, the two players become friends at once and a pop-up says
//   so; signed out, a pop-up asks to connect first, and the add happens on the way back.
import { useEffect, useRef, useState } from 'react'
import { dayCareTutorialDue, leaderboardTutorialDue } from '@/engine'
import { useT } from '@/i18n/react'
import { clearInvite, readInvite } from '@/lib/friendInvite'
import { addFriend, friendError, loadFriendStatus, lookupCode, takeUntold, useFriends, type FriendNotice } from '@/lib/friends'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { useConnect } from '../AccountButton'
import { Modal } from '../Modal'
import { PixelButton } from '../PixelButton'
import { useAddText } from './AddFriendModal'
import { FriendPreview } from './FriendBits'
import { FriendProfileSheet } from './FriendProfileSheet'

/** Sent by the /f/<code> route when the game is already open. */
export const INVITE_EVENT = 'pokedice:friend-invite'

export function FriendsService() {
  const { t } = useT()
  const status = useGame((s) => s.auth.status)
  const userId = useGame((s) => s.auth.userId)
  const idle = useGame((s) => s.run.phase === 'idle')
  const unseen = useFriends((s) => s.unseen)

  useEffect(() => {
    if (isSupabaseConfigured && status === 'signed_in') void loadFriendStatus(true)
  }, [status, userId])

  // New friends, said once on this device, between fights.
  useEffect(() => {
    if (!idle || !userId || !unseen.length) return
    const fresh = takeUntold(userId, unseen)
    if (fresh.length === 1) pushToast(t('ui.friends.newFriend', { name: fresh[0]!.name }), 'good')
    else if (fresh.length > 1) pushToast(t('ui.friends.newMany', { n: fresh.length }), 'good')
  }, [idle, userId, unseen, t])

  return isSupabaseConfigured ? <InviteHandler /> : null
}

type Who = FriendNotice & { region: string | null; maxLevel: number }

function InviteHandler() {
  const { t } = useT()
  const addText = useAddText()
  const status = useGame((s) => s.auth.status)
  const ready = useGame(
    (s) => s.run.phase === 'idle' && !!s.save && !dayCareTutorialDue(s.save, s.data) && !leaderboardTutorialDue(s.save, s.data),
  )
  const [code, setCode] = useState(() => readInvite())
  const [who, setWho] = useState<Who | null>(null)
  const [added, setAdded] = useState<FriendNotice | null>(null)
  const [profile, setProfile] = useState<FriendNotice | null>(null)
  const busy = useRef(false)
  const { connect, chooser } = useConnect()

  // A link opened while the game was already running.
  useEffect(() => {
    const onInvite = () => setCode(readInvite())
    window.addEventListener(INVITE_EVENT, onInvite)
    return () => window.removeEventListener(INVITE_EVENT, onInvite)
  }, [])

  // Without the online service there is nobody to befriend.
  useEffect(() => {
    if (code && status === 'unavailable') {
      clearInvite()
      setCode(null)
    }
  }, [code, status])

  // Signed out: who sent it, for the pop-up.
  useEffect(() => {
    if (!code || status !== 'signed_out') return
    let live = true
    lookupCode(code)
      .then((w) => live && setWho(w))
      .catch(() => live && setWho(null))
    return () => {
      live = false
    }
  }, [code, status])

  // Signed in, between fights: friends at once.
  useEffect(() => {
    if (!code || status !== 'signed_in' || !ready || busy.current) return
    busy.current = true
    clearInvite()
    setCode(null)
    addFriend(code)
      .then(({ status: result, friend }) => {
        if (result === 'added' && friend) setAdded(friend)
        else pushToast(addText(result, friend?.name), result === 'already' ? 'info' : 'bad')
      })
      .catch((err) => pushToast(addText(friendError(err)), 'bad'))
      .finally(() => {
        busy.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, status, ready])

  const dismiss = () => {
    clearInvite()
    setCode(null)
  }

  return (
    <>
      <Modal open={!!code && status === 'signed_out' && ready} onClose={dismiss} title={t('ui.friends.inviteTitle')}>
        <div className="flex flex-col gap-3">
          {who && <FriendPreview {...who} />}
          <p className="copy m-0">{t('ui.friends.inviteBody', { name: who?.name ?? t('ui.friends.someone') })}</p>
          <div className="flex justify-end gap-2">
            <PixelButton onClick={dismiss}>{t('ui.friends.notNow')}</PixelButton>
            <PixelButton variant="primary" onClick={connect}>
              {t('ui.account.connect')}
            </PixelButton>
          </div>
        </div>
      </Modal>

      <Modal open={!!added} onClose={() => setAdded(null)} title={t('ui.friends.newFriendTitle')}>
        {added && (
          <div className="flex flex-col gap-3">
            <FriendPreview name={added.name} avatar={added.avatar} region={null} maxLevel={0} />
            <p className="copy m-0">{t('ui.friends.added', { name: added.name })}</p>
            <div className="flex justify-end gap-2">
              <PixelButton
                onClick={() => {
                  setProfile(added)
                  setAdded(null)
                }}
              >
                {t('ui.friends.seeProfile')}
              </PixelButton>
              <PixelButton variant="primary" onClick={() => setAdded(null)}>
                {t('ui.common.ok')}
              </PixelButton>
            </div>
          </div>
        )}
      </Modal>

      <FriendProfileSheet userId={profile?.id ?? null} name={profile?.name} onClose={() => setProfile(null)} />
      {chooser}
    </>
  )
}
