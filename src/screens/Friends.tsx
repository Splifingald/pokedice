// The Friends page (docs/16), Social's third view (docs/43 §5.8): your friends — new ones first, then the last played —
// each opening their trainer card; your friend ID with COPY; adding a friend in the page (the field and ADD); and
// SHARE INVITE LINK, the page's one red action, pinned at the foot on a phone. PC: the list on the left, the friend
// picked docked beside it (the first one at first), so cards are read side by side with the list.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountButton } from '@/components/AccountButton'
import { NewTag } from '@/components/Chip'
import { AddFriendForm, useAddText } from '@/components/friends/AddFriendModal'
import { FriendProfileSheet } from '@/components/friends/FriendProfileSheet'
import { useFriendLine } from '@/components/friends/FriendBits'
import { InviteRewardsCard, useInviteGauge } from '@/components/friends/InviteRewards'
import { FriendsInfoModal } from '@/components/friends/FriendsInfo'
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
import { friendshipRulesDue, friendshipWaits, streakState, utcDay, type FriendStreak } from '@/engine'
import { inviteRulesDue } from '@/engine'
import { pushToast, useGame } from '@/store/game'
import { loadFriendRequests, useAreaVersus } from '@/store/areaVersus'
import { FriendRequests } from '@/components/AreaVersus'
import { openInviteRewards, seeInviteRules, useInviteRewards } from '@/store/invites'
import { cx } from '@/theme/util'
import { TrainerName } from '@/components/TrainerName'
import { FriendshipCard, FriendshipRulesModal, StreakBadge } from '@/components/friends/Friendship'
import { loadFriendship, useFriendship } from '@/store/friendship'
import { friendBattlesFor, friendBattlesRulesDue } from '@/engine'
import { ChallengeSheet, type ChallengeTarget } from '@/components/pvp/ChallengeSheet'
import { TicketCount } from '@/components/pvp/FriendBattleBits'
import { loadHome, loadOnline, usePvp } from '@/store/pvp'
import { headToHead } from '@/screens/Battles'

/** Off the boards after 72 hours without playing: shown, but quieter. */
const AWAY_MS = 72 * 3_600_000

export function FriendsScreen() {
  const { t } = useT()
  const auth = useGame((s) => s.auth)
  const max = useGame((s) => s.data.config.maxFriends)
  const count = useFriends((s) => (s.list ? s.list.length : null))
  const signedIn = auth.status === 'signed_in'

  return (
    <div className="flex flex-col gap-3">
      <PageHead icon="navFriends" title={t('ui.friends.title')} social="friends" />
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
  // The rewards' rules are behind INFO, never on the page (the user's call, 2026-11-01): reaching it is enough for Home's
  // notice that sends the player here.
  const rulesDue = useGame((s) => !!s.save && inviteRulesDue(s.save, s.data))
  useEffect(() => {
    if (gaugeOn && rulesDue) seeInviteRules()
  }, [gaugeOn, rulesDue])
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
    void loadFriendship(true)
  }, [])
  // Friend requests from players whose team you met (docs/54): at the top, while there are some.
  const requests = useAreaVersus((s) => s.requests)
  // Friendship streaks (docs/60): their card under the invite rewards; their rules behind INFO.
  const navigate = useNavigate()
  const fship = useFriendshipView()
  const [fshipInfo, setFshipInfo] = useState(false)
  // Friend Battles (docs/65): their card, a BATTLE button on each friend in the game now, the challenge sheet.
  const pvpOn = useGame((s) => s.auth.status === 'signed_in' && friendBattlesFor(s.save, s.data))
  const pvpNew = useGame((s) => !!s.save && friendBattlesRulesDue(s.save, s.data))
  const onlineIds = usePvp((s) => s.online)
  const records = usePvp((s) => s.home?.records)
  const pvpTickets = usePvp((s) => s.home?.tickets)
  const [target, setTarget] = useState<ChallengeTarget | null>(null)
  useEffect(() => {
    if (!pvpOn) return
    void loadOnline(true)
    void loadHome()
    const id = setInterval(() => void loadOnline(true), 20_000)
    return () => clearInterval(id)
  }, [pvpOn])
  const firstOnline = list?.find((f) => f.inRealm && onlineIds.includes(f.userId))?.userId
  const recordWith = (id: string, name: string) => {
    const r = records?.find((x) => x.id === id)
    return r ? headToHead(t, r.wins, r.losses, name) : null
  }
  const pvpTotals = records?.reduce((acc, r) => ({ w: acc.w + r.wins, l: acc.l + r.losses }), { w: 0, l: 0 })

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
      {gauge && <InviteRewardsCard gauge={gauge} busy={rewardsBusy} onOpen={() => void openInviteRewards()} />}
      <FriendRequests requests={requests} />
      {fship.on && (
        <FriendshipCard
          balance={fship.status?.balance ?? 0}
          earned={fship.status?.earned ?? 0}
          streaks={fship.status?.streaks ?? []}
          friends={list ?? []}
          today={fship.today}
          state={fship.status ? 'ready' : fship.state === 'error' ? 'error' : 'loading'}
          onMarket={() => navigate('/market')}
          onInfo={() => setFshipInfo(true)}
        />
      )}
      {pvpOn && (
        <button
          type="button"
          onClick={() => navigate('/battles')}
          className="flex items-center gap-2.5 bg-sky p-2.5 pb-3 text-left shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-sky-line))]"
        >
          <PixelIcon name="vs" size={36} className="shrink-0" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <b className="text-[22px] font-normal leading-none">{t('ui.pvp.title')}</b>
            <small className="font-pixel-sm text-[16px] leading-tight text-muted">
              {pvpTotals && pvpTotals.w + pvpTotals.l > 0
                ? t('ui.pvp.cardRecord', { w: pvpTotals.w, l: pvpTotals.l })
                : t('ui.pvp.cardLine')}
            </small>
          </span>
          {pvpNew && <NewTag className="shrink-0" />}
          {pvpTickets && <TicketCount n={pvpTickets.balance} size="sm" />}
          <span aria-hidden className="block h-[14px] w-[10px] shrink-0 bg-shadow [clip-path:polygon(0_0,100%_50%,0_100%,0_70%,50%_50%,0_30%)]" />
        </button>
      )}

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
                streak={fship.on ? fship.status?.streaks.find((x) => x.friend === f.userId) : undefined}
                today={fship.today}
                picked={wide && shown?.userId === f.userId}
                onOpen={() => setOpen(f)}
                battle={
                  pvpOn && f.inRealm
                    ? {
                        online: onlineIds.includes(f.userId),
                        first: firstOnline === f.userId,
                        onBattle: () =>
                          setTarget({ id: f.userId, name: f.name, avatar: f.avatar, record: recordWith(f.userId, f.name) }),
                      }
                    : undefined
                }
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
      <InfoButton name={t('ui.friends.infoName')} onClick={() => setRules(true)} />
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

      <FriendsInfoModal open={rules} onClose={() => setRules(false)} invites={gaugeOn} friendship={fship.on} />
      <FriendshipRulesModal open={fshipInfo} onClose={() => setFshipInfo(false)} />
      {pvpOn && <ChallengeSheet target={target} onClose={() => setTarget(null)} />}
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
function FriendListRow({
  friend: f,
  onOpen,
  picked,
  streak,
  today,
  battle,
}: {
  friend: FriendRow
  onOpen: () => void
  picked?: boolean
  streak?: FriendStreak
  today: string
  /** Friend Battles (docs/65): BATTLE beside the row, for a friend in the game now (red on the first one). */
  battle?: { online: boolean; first: boolean; onBattle: () => void }
}) {
  const { t } = useT()
  const line = useFriendLine()
  const now = Date.now()
  // Extreme mode (docs/22): a friend without an Extreme save is listed, greyed, and has no card to open here.
  const elsewhere = !f.inRealm
  const away = elsewhere || !f.updatedAt || now - f.updatedAt > AWAY_MS
  const summary = elsewhere ? t('ui.extreme.notIn') : battle?.online ? t('ui.pvp.onlineNow') : line(f, now)
  return (
    <li className="flex items-stretch gap-1.5">
      <button
        type="button"
        onClick={elsewhere ? undefined : onOpen}
        aria-disabled={elsewhere || undefined}
        aria-label={`${f.name}, ${summary}`}
        aria-current={picked || undefined}
        className={cx(
          'flex min-h-[60px] w-full min-w-0 flex-1 items-center gap-2 pb-1.5 pl-1.5 pr-2.5 pt-1 text-left',
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
          <small
            className={cx(
              'flex items-center gap-1 truncate font-pixel-sm text-[16px] leading-tight',
              battle?.online ? 'text-good' : away ? 'text-ink' : 'text-muted',
            )}
          >
            {battle?.online && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3fbf6a] shadow-ring-thin" />}
            {summary}
          </small>
        </span>
        {streak && <StreakBadge streak={streak.streak} state={streakState(streak, today)} />}
        {elsewhere ? (
          <PixelIcon name="skull" size={14} className="shrink-0 opacity-60" />
        ) : (
          <span aria-hidden className="block h-[14px] w-[10px] shrink-0 bg-shadow [clip-path:polygon(0_0,100%_50%,0_100%,0_70%,50%_50%,0_30%)]" />
        )}
      </button>
      {battle && (
        <PixelButton
          size="sm"
          variant={battle.online ? (battle.first ? 'primary' : 'dark') : 'secondary'}
          className="shrink-0 self-center"
          disabled={!battle.online}
          aria-label={battle.online ? t('ui.pvp.battleWith', { name: f.name }) : t('ui.pvp.offlineWith', { name: f.name })}
          onClick={battle.onBattle}
        >
          {battle.online ? t('ui.pvp.battle') : t('ui.pvp.offline')}
        </PixelButton>
      )}
    </li>
  )
}

/** Friendship (docs/60) as the page needs it: on for this player in the main game, the status, the server's day. */
export function useFriendshipView() {
  // Not in Extreme mode (a race of its own); inside a small world the card shows, and the market says it waits.
  const on = useGame((s) => !!s.save && [null, 'world'].includes(friendshipWaits(s.save, s.data)))
  const rulesDue = useGame((s) => !!s.save && friendshipRulesDue(s.save, s.data))
  const status = useFriendship((s) => s.status)
  const state = useFriendship((s) => s.state)
  return { on, rulesDue, status, state, today: status?.day || utcDay(Date.now()) }
}
