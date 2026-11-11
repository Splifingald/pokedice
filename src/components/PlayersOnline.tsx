// Players online (docs/70): a line at the foot of the side menu, above SYNC ONLINE, for everyone (no switch), and VIEW
// beside it: a pop-up listing them, up to 30, the closest to this player in badges when there are more. The count and
// the list are the server's (store/online.ts); the line is hidden until it has a count.
import { useEffect, useState } from 'react'
import { t as translate, tPlural } from '@/i18n'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { offlineOr } from '@/lib/online'
import {
  loadOnlinePlayers,
  ONLINE_LIST_MAX,
  ONLINE_MENU_MS,
  pingOnline,
  useOnlineCount,
  type OnlinePlayer,
} from '@/store/online'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { TrainerLook } from './TrainerLook'

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

/** The pop-up's list: each player's look, name and badges, most badges first; this player marked, as on the board. */
export function OnlinePlayersList({ players }: { players: OnlinePlayer[] }) {
  const { t } = useT()
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {players.map((p, i) => (
        <li
          key={i}
          aria-current={p.me || undefined}
          className={
            p.me
              ? 'flex items-center gap-2 bg-gold-pale pb-1 pl-1.5 pr-2.5 pt-1 shadow-card-gold'
              : 'flex items-center gap-2 bg-paper pb-1 pl-1.5 pr-2.5 pt-1 shadow-ring-line'
          }
        >
          <TrainerLook src={avatarOf(p.look).src} w={36} h={40} />
          <b className="flex min-w-0 flex-1 items-center gap-1 text-[20px] font-normal leading-none">
            <span className="truncate">{p.name}</span>
            {p.me && (
              <span className="shrink-0 bg-gold px-[5px] pb-px font-pixel-sm text-[16px] leading-tight text-ink">
                {t('ui.board.youTag')}
              </span>
            )}
          </b>
          <span
            className="flex shrink-0 items-center gap-1 text-[20px] leading-none"
            aria-label={tPlural('ui.online.badges', p.badges)}
          >
            <PixelIcon name="badge" size={14} />
            <span aria-hidden>{p.badges}</span>
          </span>
        </li>
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
