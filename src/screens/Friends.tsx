// The Friends page (docs/16), from the trainer menu: your friend ID with COPY and SHARE INVITE LINK, ADD BY FRIEND ID,
// and your friends — new ones first, then the last played — each opening their trainer card.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountButton } from '@/components/AccountButton'
import { NewTag } from '@/components/Chip'
import { AddFriendModal, useAddText } from '@/components/friends/AddFriendModal'
import { FriendProfileSheet } from '@/components/friends/FriendProfileSheet'
import { useFriendLine } from '@/components/friends/FriendBits'
import { PixelIcon } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerLook } from '@/components/TrainerLook'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import {
  formatCode,
  friendError,
  inviteUrl,
  loadFriendList,
  loadMyCode,
  markFriendsSeen,
  resetMyCode,
  useFriends,
  type FriendRow,
} from '@/lib/friends'
import { copyText, shareOrCopy } from '@/lib/share'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** Off the boards after 72 hours without playing: shown, but quieter. */
const AWAY_MS = 72 * 3_600_000

export function FriendsScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const auth = useGame((s) => s.auth)
  const max = useGame((s) => s.data.config.maxFriends)
  const count = useFriends((s) => (s.list ? s.list.length : null))
  const signedIn = auth.status === 'signed_in'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHead
        icon="navFriends"
        title={t('ui.friends.title')}
        count={signedIn && count != null ? `${count}/${max}` : undefined}
        onBack={() => navigate('/home')}
      />
      {!isSupabaseConfigured || auth.status === 'unavailable' ? (
        <p className="m-0 bg-paper px-3.5 py-4 text-center text-[20px] leading-[1.15] shadow-card">{t('ui.friends.offline')}</p>
      ) : auth.status === 'signed_out' ? (
        <div className="flex flex-col items-center gap-3 bg-gold-pale px-3.5 py-4 text-center shadow-card-gold">
          <PixelIcon name="navFriends" size={48} />
          <p className="m-0 text-[20px] leading-[1.15]">{t('ui.friends.signedOut')}</p>
          <AccountButton />
        </div>
      ) : auth.status === 'unknown' ? (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
      ) : (
        <FriendsBody />
      )}
    </div>
  )
}

function FriendsBody() {
  const { t, tPlural } = useT()
  const errorText = useAddText()
  const code = useFriends((s) => s.code)
  const list = useFriends((s) => s.list)
  const listState = useFriends((s) => s.listState)
  const listError = useFriends((s) => s.listError)
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [open, setOpen] = useState<FriendRow | null>(null)

  useEffect(() => {
    void loadMyCode().catch((err) => console.warn('[friends] no friend ID:', err instanceof Error ? err.message : err))
    // The list, then nobody is new any more (their NEW tags stay until the page closes).
    void loadFriendList(true).then(() => markFriendsSeen())
  }, [])

  const share = () => {
    if (!code) return
    void shareOrCopy(
      { title: 'Pokédice', text: t('ui.friends.shareText', { code: formatCode(code) }), url: inviteUrl(code) },
      t('ui.friends.linkCopied'),
    )
  }

  const reset = async () => {
    try {
      const fresh = await resetMyCode()
      pushToast(t('ui.friends.resetDone', { code: formatCode(fresh) }), 'good')
      setResetting(false)
    } catch (err) {
      const why = friendError(err)
      pushToast(why === 'reset_too_soon' ? t('ui.friends.resetTooSoon') : errorText(why), 'bad')
    }
  }

  return (
    <>
      <section
        aria-label={t('ui.friends.yourId')}
        className="grid gap-2.5 bg-[linear-gradient(rgb(var(--c-sky)),rgb(var(--c-paper))_70%)] px-3 pb-3 pt-2 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_5px_#5b8def,inset_0_0_0_7px_rgb(var(--c-edge)),inset_0_-10px_0_rgb(var(--c-sky-line))]"
      >
        <span className="px-1 pt-1 font-pixel-sm text-[14px] uppercase tracking-[0.06em] text-[#2f5fb8] dark:text-[#8fb4ff]">
          {t('ui.friends.yourId')}
        </span>
        <div className="flex items-center gap-2 px-1">
          <b className="min-w-0 flex-1 font-normal tabular-nums text-[34px] leading-none tracking-[0.08em]" data-testid="friend-code">
            {code ? formatCode(code) : '····-····'}
          </b>
          <PixelButton
            size="sm"
            disabled={!code}
            aria-label={t('ui.friends.copyLabel')}
            onClick={() => code && void copyText(formatCode(code), t('ui.friends.copied'), t('ui.friends.copyFailed'))}
          >
            {t('ui.friends.copy')}
          </PixelButton>
        </div>
        <PixelButton variant="primary" className="w-full" disabled={!code} onClick={share}>
          {t('ui.friends.share')}
        </PixelButton>
      </section>

      <PixelButton className="w-full" onClick={() => setAdding(true)}>
        <PixelIcon name="friends" size={18} />
        {t('ui.friends.add')}
      </PixelButton>

      <section className="flex flex-col gap-1.5" aria-labelledby="friends-list-title">
        <h2 id="friends-list-title" className="m-0 text-[24px] font-normal leading-none">
          {list ? tPlural('ui.friends.count', list.length) : t('ui.friends.title')}
        </h2>
        {listState === 'loading' && !list && <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>}
        {listState === 'error' && !list && (
          <p className="m-0 p-4 text-center text-[20px] text-danger">
            {listError === 'not_set_up' ? t('ui.friends.notSetUp') : t('ui.friends.failed')}
          </p>
        )}
        {list && list.length === 0 && (
          <p className="m-0 bg-paper px-3.5 py-4 text-center font-pixel-sm text-[17px] leading-[1.2] text-muted shadow-ring-line">
            {t('ui.friends.empty')}
          </p>
        )}
        {list && list.length > 0 && (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {list.map((f) => (
              <FriendListRow key={f.userId} friend={f} onOpen={() => setOpen(f)} />
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-center">
        <PixelButton size="sm" variant="ghost" disabled={!code} onClick={() => setResetting(true)}>
          {t('ui.friends.reset')}
        </PixelButton>
      </div>

      <AddFriendModal open={adding} onClose={() => setAdding(false)} />
      <FriendProfileSheet userId={open?.userId ?? null} name={open?.name} onClose={() => setOpen(null)} />
      <Modal open={resetting} onClose={() => setResetting(false)} title={t('ui.friends.resetTitle')}>
        <p className="copy mb-4 text-lg">{t('ui.friends.resetBody')}</p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setResetting(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton variant="danger" onClick={() => void reset()}>
            {t('ui.friends.reset')}
          </PixelButton>
        </div>
      </Modal>
    </>
  )
}

/** One friend: their look, name (NEW while new), team, and where they are. The whole row opens their card. */
function FriendListRow({ friend: f, onOpen }: { friend: FriendRow; onOpen: () => void }) {
  const line = useFriendLine()
  const now = Date.now()
  const away = !f.updatedAt || now - f.updatedAt > AWAY_MS
  const summary = line(f, now)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${f.name}, ${summary}`}
        className={cx(
          'flex min-h-[60px] w-full items-center gap-2 pb-1.5 pl-1.5 pr-2.5 pt-1 text-left',
          away ? 'bg-well shadow-ring-line' : 'bg-paper shadow-ring-line',
        )}
      >
        <TrainerLook src={avatarOf(f.avatar).src} w={44} h={48} className={cx(away && 'opacity-75 grayscale-[0.7]')} />
        <span className="grid min-w-0 flex-1 gap-px">
          <b className="flex min-w-0 items-center gap-1.5 text-[20px] font-normal leading-none">
            <span className="truncate">{f.name}</span>
            {f.isNew && <NewTag className="shrink-0" />}
          </b>
          {f.team.length > 0 && (
            <span className="flex items-center" aria-hidden>
              {f.team.map((m, i) => (
                <span key={i} className="-mx-[3px] first:ml-[-6px]">
                  <MiniSprite dex={m.dex} size={28} alt="" />
                </span>
              ))}
            </span>
          )}
          <small className={cx('truncate font-pixel-sm text-[14px] leading-tight', away ? 'text-ink' : 'text-muted')}>{summary}</small>
        </span>
        <span aria-hidden className="block h-[14px] w-[10px] shrink-0 bg-shadow [clip-path:polygon(0_0,100%_50%,0_100%,0_70%,50%_50%,0_30%)]" />
      </button>
    </li>
  )
}
