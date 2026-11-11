// Players online (docs/70): a line at the foot of the side menu, above SYNC ONLINE, for everyone (no switch), and VIEW
// beside it: a pop-up listing them, up to 30, the closest to this player in badges when there are more, each with
// their team, and INVITE to ask one to be friends (a friend request, answered on their Friends page). The count, the
// list and who can be asked are the server's (store/online.ts); the line is hidden until it has a count.
import { useEffect, useState } from 'react'
import { t as translate, tPlural } from '@/i18n'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { loadFriendStatus } from '@/lib/friends'
import { offlineOr } from '@/lib/online'
import { pushToast, useGame } from '@/store/game'
import {
  inviteOnline,
  loadOnlinePlayers,
  ONLINE_LIST_MAX,
  ONLINE_MENU_MS,
  pingOnline,
  useOnlineCount,
  type OnlinePlayer,
} from '@/store/online'
import { BoardRow } from './BoardRow'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

/** The line itself: a green dot (as a friend online, docs/65) and "12 players online"; VIEW at its end when given. */
export function PlayersOnlineView({ count, onView }: { count: number; onView?: () => void }) {
  const { t } = useT()
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-2 pl-1">
      <p className="flex min-w-0 items-center gap-1.5 font-pixel-sm text-[16px] leading-tight text-good">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3fbf6a] shadow-ring-thin" />
        {tPlural('ui.menu.playersOnline', count)}
      </p>
      {onView && (
        <PixelButton size="sm" onClick={onView} aria-label={t('ui.online.viewLabel')} className="shrink-0">
          <PixelIcon name="eye" size={18} />
          {t('ui.online.view')}
        </PixelButton>
      )}
    </div>
  )
}

/** INVITE, or what became of it: "Sent" once asked (here or before), nothing for a friend or when it can't be. */
function InviteButton({ p, onFriend }: { p: OnlinePlayer; onFriend: () => void }) {
  const { t } = useT()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'gone'>(p.invite === 'sent' ? 'sent' : 'idle')
  const maxFriends = useGame((s) => s.data.config.maxFriends ?? 100)
  if (!p.id || state === 'gone') return null
  if (state === 'sent')
    return (
      <span className="flex shrink-0 items-center gap-1 font-pixel-sm text-[16px] leading-none text-muted">
        <PixelIcon name="check" size={14} />
        {t('ui.online.sent')}
      </span>
    )
  const send = (id: string) => {
    setState('sending')
    inviteOnline(id)
      .then((status) => {
        if (status === 'sent' || status === 'pending') {
          setState('sent')
          if (status === 'sent') pushToast(t('ui.areaVersus.requestSent', { name: p.name }), 'good')
        } else if (status === 'added' || status === 'already') {
          setState('gone')
          onFriend()
          if (status === 'added') {
            pushToast(t('ui.friends.newFriend', { name: p.name }), 'good')
            void loadFriendStatus(true)
          }
        } else {
          setState('gone')
          if (status === 'full') pushToast(t('ui.friends.full', { max: maxFriends }), 'bad')
          else if (status === 'friend_full') pushToast(t('ui.friends.friendFull', { name: p.name }), 'bad')
          else if (status === 'offline') pushToast(t('ui.online.gone', { name: p.name }), 'info')
        }
      })
      .catch(() => {
        setState('idle')
        pushToast(offlineOr(t('ui.areaVersus.requestFailed')), 'bad')
      })
  }
  return (
    <PixelButton
      size="sm"
      disabled={state === 'sending'}
      onClick={() => p.id && send(p.id)}
      aria-label={t('ui.online.inviteLabel', { name: p.name })}
      className="relative z-[2] shrink-0"
    >
      <PixelIcon name="friends" size={16} />
      {t('ui.online.invite')}
    </PixelButton>
  )
}

/** One player: look, name and team as on the board; you gold, a friend blue; INVITE at the right when it can be. */
function OnlinePlayerRow({ p }: { p: OnlinePlayer }) {
  const [friend, setFriend] = useState(p.friend)
  return (
    <BoardRow look={avatarOf(p.look).src} name={p.name} team={p.team} isMe={p.me} isFriend={friend} compact>
      {!friend && <InviteButton p={p} onFriend={() => setFriend(true)} />}
    </BoardRow>
  )
}

/** The pop-up's list, most badges first (the badges themselves aren't shown). */
export function OnlinePlayersList({ players }: { players: OnlinePlayer[] }) {
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {players.map((p, i) => (
        <OnlinePlayerRow key={`${i}-${p.name}`} p={p} />
      ))}
    </ul>
  )
}

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; players: OnlinePlayer[] }

/** What the pop-up shows in each state: loading, a failure in words, the list (and what it is when cut to 30). */
export function OnlinePlayersBody({ state, count }: { state: ListState; count: number | null }) {
  const { t } = useT()
  if (state.status === 'loading') return <p className="m-0 text-[20px] text-muted">{t('ui.common.loading')}</p>
  if (state.status === 'error') return <p className="m-0 text-[20px]">{state.message}</p>
  if (!state.players.length) return <p className="m-0 text-[20px] text-muted">{t('ui.online.empty')}</p>
  return (
    <div className="grid gap-2">
      {count != null && count > ONLINE_LIST_MAX && (
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.online.closest', { n: ONLINE_LIST_MAX })}
        </p>
      )}
      <OnlinePlayersList players={state.players} />
    </div>
  )
}

/** VIEW's pop-up: asks the server each time it opens. */
export function OnlinePlayersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const count = useOnlineCount((s) => s.count)
  const [state, setState] = useState<ListState>({ status: 'loading' })
  useEffect(() => {
    if (!open) return
    let live = true
    setState({ status: 'loading' })
    loadOnlinePlayers()
      .then((players) => live && setState({ status: 'ready', players }))
      .catch(() => live && setState({ status: 'error', message: offlineOr(translate('ui.online.error')) }))
    return () => {
      live = false
    }
  }, [open])
  return (
    <Modal open={open} onClose={onClose} title={t('ui.online.title')}>
      <div className="max-h-[60vh] overflow-y-auto">
        <OnlinePlayersBody state={state} count={count} />
      </div>
    </Modal>
  )
}

/** In the menu: asks again on opening when the last count is over a minute old. */
export function PlayersOnline() {
  const count = useOnlineCount((s) => s.count)
  const [viewing, setViewing] = useState(false)
  useEffect(() => {
    void pingOnline(ONLINE_MENU_MS)
  }, [])
  if (count == null) return null
  return (
    <>
      <PlayersOnlineView count={count} onView={() => setViewing(true)} />
      <OnlinePlayersModal open={viewing} onClose={() => setViewing(false)} />
    </>
  )
}
