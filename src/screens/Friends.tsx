// The Friends page (docs/16), Social's third view (docs/43 §5.8): your friends — new ones first, then the last played —
// each opening their trainer card; your friend ID with COPY; adding a friend in the page (the field and ADD); and
// SHARE INVITE LINK, the page's one red action, pinned at the foot on a phone. PC: the list on the left, the friend
// picked docked beside it (the first one at first), so cards are read side by side with the list.
import { useEffect, useState } from 'react'
import { AccountButton } from '@/components/AccountButton'
import { NewTag } from '@/components/Chip'
import { AddFriendForm, useAddText } from '@/components/friends/AddFriendModal'
import { FriendProfileSheet } from '@/components/friends/FriendProfileSheet'
import { useFriendLine } from '@/components/friends/FriendBits'
import { InviteRewardsCard, InviteRulesModal, useInviteGauge, useInviteRules } from '@/components/friends/InviteRewards'
import { RulesCard } from '@/components/RulesCard'
import { PixelIcon } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { PageHead } from '@/components/PageHead'
import { SocialDock } from '@/components/SocialTabs'
import { SplitView } from '@/components/SplitView'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerLook } from '@/components/TrainerLook'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { useOnline } from '@/lib/online'
import {
  formatCode,
  friendError,
  inviteUrl,
  loadFriendList,
  loadInviteStatus,
  loadMyCode,
  markFriendsSeen,
  resetMyCode,
  useFriends,
  type FriendRow,
} from '@/lib/friends'
import { copyText, shareOrCopy } from '@/lib/share'
import { isSupabaseConfigured } from '@/lib/supabase'
import { inviteRulesDue } from '@/engine'
import { pushToast, useGame } from '@/store/game'
import { loadFriendRequests, useAreaVersus } from '@/store/areaVersus'
import { FriendRequests } from '@/components/AreaVersus'
import { openInviteRewards, seeInviteRules, useInviteRewards } from '@/store/invites'
import { cx } from '@/theme/util'
import { TrainerName } from '@/components/TrainerName'
import { ShareNotice, useShareSeen } from '@/components/ShareTutorial'

/** Off the boards after 72 hours without playing: shown, but quieter. */
const AWAY_MS = 72 * 3_600_000

export function FriendsScreen() {
  const { t } = useT()
  const auth = useGame((s) => s.auth)
  const max = useGame((s) => s.data.config.maxFriends)
  const count = useFriends((s) => (s.list ? s.list.length : null))
  const signedIn = auth.status === 'signed_in'
  // Prof. Oak's invite lives here, where friends are made, until ✕ or a share (the user's call, 2026-10-27: not Home).
  const shareSeen = useShareSeen()

  return (
    <div className="flex flex-col gap-3">
      <PageHead icon="navFriends" title={t('ui.friends.title')} social="friends" />
      {!shareSeen && (
        <div className="mx-auto w-full max-w-xl">
          <ShareNotice />
        </div>
      )}
      {!isSupabaseConfigured || auth.status === 'unavailable' ? (
        <p className="m-0 mx-auto w-full max-w-xl bg-paper px-3.5 py-4 text-center text-[20px] leading-[1.15] shadow-card">
          {t('ui.friends.offline')}
        </p>
      ) : auth.status === 'signed_out' ? (
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 bg-gold-pale px-3.5 py-4 text-center shadow-card-gold">
          <PixelIcon name="navFriends" size={48} />
          <p className="m-0 text-[20px] leading-[1.15]">{t('ui.friends.signedOut')}</p>
          <AccountButton />
        </div>
      ) : auth.status === 'unknown' ? (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
      ) : (
        <FriendsBody counter={signedIn && count != null ? `${count}/${max}` : undefined} />
      )}
    </div>
  )
}

function FriendsBody({ counter }: { counter?: string }) {
  const { t, tPlural } = useT()
  const wide = useMediaQuery('(min-width: 1024px)')
  const errorText = useAddText()
  const online = useOnline()
  const code = useFriends((s) => s.code)
  const list = useFriends((s) => s.list)
  const listState = useFriends((s) => s.listState)
  const listError = useFriends((s) => s.listError)
  const [resetting, setResetting] = useState(false)
  const [open, setOpen] = useState<FriendRow | null>(null)
  const [rules, setRules] = useState(false)
  // Invite rewards (docs/15 §25): the gauge on top, while they're on for this player.
  const gauge = useInviteGauge()
  const rewardsBusy = useInviteRewards((s) => s.busy)
  const gaugeOn = !!gauge
  const rulesDue = useGame((s) => !!s.save && inviteRulesDue(s.save, s.data))
  // PC: the pane beside the list is never empty while there is a friend to show (the first one, as the Team opens on
  // its lead). A phone opens a card only on a tap.
  const firstFriend = list?.find((f) => f.inRealm) ?? null
  const shown = open ?? (wide ? firstFriend : null)

  useEffect(() => {
    void loadMyCode().catch((err) => console.warn('[friends] no friend ID:', err instanceof Error ? err.message : err))
    // The list, then nobody is new any more (their NEW tags stay until the page closes).
    void loadFriendList(true).then(() => markFriendsSeen())
    void loadInviteStatus()
    void loadFriendRequests()
  }, [])
  // Friend requests from players whose team you met (docs/53): at the top, while there are some.
  const requests = useAreaVersus((s) => s.requests)
  // The rewards' rules sit at the top of this page, and nowhere else, while the gauge shows and until GOT IT (docs/43
  // §7: rules where they apply); INFO keeps them.
  const inviteRules = useInviteRules()

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

  const shareButton = (
    <PixelButton variant="primary" className="w-full" disabled={!code} onClick={share}>
      {t('ui.friends.share')}
    </PixelButton>
  )

  const main = (
    <>
      {gaugeOn && rulesDue && (
        <RulesCard title={t('ui.invite.infoName')} icon="gift" rules={inviteRules} onDone={seeInviteRules} />
      )}
      {gauge && <InviteRewardsCard gauge={gauge} busy={rewardsBusy} onOpen={() => void openInviteRewards()} />}
      <FriendRequests requests={requests} />

      <section className="flex flex-col gap-1.5" aria-labelledby="friends-list-title">
        <h2 id="friends-list-title" className="m-0 flex items-baseline gap-2 text-[24px] font-normal leading-none">
          {list ? tPlural('ui.friends.count', list.length) : t('ui.friends.title')}
          {counter && <span className="font-pixel-sm text-[18px] text-muted">{counter}</span>}
        </h2>
        {listState === 'loading' && !list && <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>}
        {listState === 'error' && !list && (
          <p className="m-0 p-4 text-center text-[20px] text-danger">
            {listError === 'not_set_up' ? t('ui.friends.notSetUp') : t(online ? 'ui.friends.failed' : 'ui.common.offline')}
          </p>
        )}
        {list && list.length === 0 && (
          <p className="m-0 bg-paper px-3.5 py-4 text-center text-[18px] leading-[1.2] text-muted shadow-ring-line">
            {t('ui.friends.empty')}
          </p>
        )}
        {list && list.length > 0 && (
          <ul className="m-0 grid list-none gap-1.5 p-0 xl:grid-cols-2">
            {list.map((f) => (
              <FriendListRow
                key={f.userId}
                friend={f}
                picked={wide && shown?.userId === f.userId}
                onOpen={() => setOpen(f)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Your ID (to read out or paste) and adding someone's: side by side on a wide screen. */}
      <div className="grid gap-2.5 md:grid-cols-2 md:items-start">
        <section
          aria-label={t('ui.friends.yourId')}
          className="grid gap-2 bg-[linear-gradient(rgb(var(--c-sky)),rgb(var(--c-paper))_70%)] p-2.5 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_5px_#5b8def,inset_0_0_0_7px_rgb(var(--c-edge))]"
        >
          <span className="px-1 pt-1 font-pixel-sm text-[16px] uppercase tracking-[0.06em] text-[#2f5fb8] dark:text-[#8fb4ff]">
            {t('ui.friends.yourId')}
          </span>
          <div className="flex items-center gap-2 px-1 pb-1">
            <b className="min-w-0 flex-1 font-normal tabular-nums text-[30px] leading-none tracking-[0.08em]" data-testid="friend-code">
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
          {/* PC: the invite link with the ID (phones pin it at the foot). */}
          {wide && shareButton}
        </section>
        <AddFriendForm
          onAdded={(f) => {
            const row = useFriends.getState().list?.find((r) => r.userId === f.id)
            if (row) setOpen(row)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Rare, and it breaks every link already shared: quiet, at the end. */}
        <PixelButton size="sm" variant="ghost" disabled={!code} onClick={() => setResetting(true)}>
          {t('ui.friends.reset')}
        </PixelButton>
      </div>
      {gauge && <InfoButton name={t('ui.invite.infoName')} onClick={() => setRules(true)} />}
    </>
  )

  return (
    <>
      <SplitView
        main={main}
        detail={
          shown ? (
            <FriendProfileSheet userId={shown.userId} name={shown.name} onClose={() => setOpen(null)} />
          ) : undefined
        }
        empty={
          <p className="m-0 grid flex-1 place-content-center justify-items-center gap-3 p-6 text-center text-[20px] text-muted">
            <PixelIcon name="navFriends" size={48} />
            {t('ui.friends.empty')}
          </p>
        }
      />
      {!wide && <SocialDock>{shareButton}</SocialDock>}

      <InviteRulesModal open={rules} onClose={() => setRules(false)} />
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
function FriendListRow({ friend: f, onOpen, picked }: { friend: FriendRow; onOpen: () => void; picked?: boolean }) {
  const { t } = useT()
  const line = useFriendLine()
  const now = Date.now()
  // Extreme mode (docs/22): a friend without an Extreme save is listed, greyed, and has no card to open here.
  const elsewhere = !f.inRealm
  const away = elsewhere || !f.updatedAt || now - f.updatedAt > AWAY_MS
  const summary = elsewhere ? t('ui.extreme.notIn') : line(f, now)
  return (
    <li>
      <button
        type="button"
        onClick={elsewhere ? undefined : onOpen}
        aria-disabled={elsewhere || undefined}
        aria-label={`${f.name}, ${summary}`}
        aria-current={picked || undefined}
        className={cx(
          'flex min-h-[60px] w-full items-center gap-2 pb-1.5 pl-1.5 pr-2.5 pt-1 text-left',
          picked ? 'bg-gold-pale shadow-card-gold' : away ? 'bg-well shadow-ring-line' : 'bg-paper shadow-ring-line',
        )}
      >
        <TrainerLook src={avatarOf(f.avatar).src} w={44} h={48} className={cx(away && 'opacity-75 grayscale-[0.7]')} />
        <span className="grid min-w-0 flex-1 gap-px">
          <b className="flex min-w-0 items-center gap-1.5 text-[20px] font-normal leading-none">
            <TrainerName name={f.name} rich={f.rich} className="truncate" />
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
          <small className={cx('truncate font-pixel-sm text-[16px] leading-tight', away ? 'text-ink' : 'text-muted')}>{summary}</small>
        </span>
        {elsewhere ? (
          <PixelIcon name="skull" size={14} className="shrink-0 opacity-60" />
        ) : (
          <span aria-hidden className="block h-[14px] w-[10px] shrink-0 bg-shadow [clip-path:polygon(0_0,100%_50%,0_100%,0_70%,50%_50%,0_30%)]" />
        )}
      </button>
    </li>
  )
}
