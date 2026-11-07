// The Friends page (docs/16), Social's third view (docs/43 §5.8), as the user drew it (2026-11-07): the Friendship gauge
// on top (scrolling with the page) with the Friend Market, then your friends — new ones first, then the last played —
// each opening their card (BATTLE in it, docs/65), and INFO at the foot. ADD FRIENDS, the page's one red action, opens
// everything about making friends (the invite rewards, your ID, adding one, SHARE INVITE LINK): pinned at the foot on a
// phone, beside the Social views on PC. PC: the list on the left, the friend picked docked beside it (the first one at
// first), so cards are read side by side with the list.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountButton } from '@/components/AccountButton'
import { NewTag } from '@/components/Chip'
import { AddFriendsButton, AddFriendsSheet } from '@/components/friends/AddFriendsSheet'
import { FriendProfileSheet } from '@/components/friends/FriendProfileSheet'
import { useFriendLine } from '@/components/friends/FriendBits'
import { useInviteGauge } from '@/components/friends/InviteRewards'
import { FriendsInfoModal } from '@/components/friends/FriendsInfo'
import { PixelIcon } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { SocialDock } from '@/components/SocialTabs'
import { SplitView } from '@/components/SplitView'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { InfoButton } from '@/components/RulesModal'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerLook } from '@/components/TrainerLook'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { useOnline } from '@/lib/online'
import {
  loadFriendList,
  loadInviteStatus,
  loadMyCode,
  markFriendsSeen,
  useFriends,
  type FriendRow,
} from '@/lib/friends'
import { useSeenOnOpen } from '@/lib/useSeenOnOpen'
import { isSupabaseConfigured } from '@/lib/supabase'
import { friendshipRulesDue, friendshipWaits, streakState, utcDay, type FriendStreak } from '@/engine'
import { inviteRulesDue } from '@/engine'
import { useGame } from '@/store/game'
import { loadFriendRequests, useAreaVersus } from '@/store/areaVersus'
import { FriendRequests } from '@/components/AreaVersus'
import { seeInviteRules } from '@/store/invites'
import { cx } from '@/theme/util'
import { TrainerName } from '@/components/TrainerName'
import { FriendshipGauge, StreakBadge } from '@/components/friends/Friendship'
import { loadFriendship, seeFriendshipRules, useFriendship } from '@/store/friendship'
import { friendBattlesFor } from '@/engine'
import { ChallengeSheet, type ChallengeTarget } from '@/components/pvp/ChallengeSheet'
import { loadHome, loadOnline, usePvp } from '@/store/pvp'
import { headToHead } from '@/screens/Battles'

/** Off the boards after 72 hours without playing: shown, but quieter. */
const AWAY_MS = 72 * 3_600_000

export function FriendsScreen() {
  const { t } = useT()
  const auth = useGame((s) => s.auth)
  const max = useGame((s) => s.data.config.maxFriends)
  const count = useFriends((s) => (s.list ? s.list.length : null))
  const wide = useMediaQuery('(min-width: 1024px)')
  const [adding, setAdding] = useState(false)
  const signedIn = auth.status === 'signed_in'

  return (
    <div className="flex flex-col gap-3">
      <PageHead icon="navFriends" title={t('ui.friends.title')} social="friends">
        {/* PC: ADD FRIENDS beside the Social views (a phone pins it at the foot). */}
        {isSupabaseConfigured && signedIn && wide && (
          <AddFriendsButton size="sm" onClick={() => setAdding(true)} />
        )}
      </PageHead>
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
        <FriendsBody
          counter={signedIn && count != null ? `${count}/${max}` : undefined}
          adding={adding}
          setAdding={setAdding}
        />
      )}
    </div>
  )
}

function FriendsBody({
  counter,
  adding,
  setAdding,
}: {
  counter?: string
  adding: boolean
  setAdding: (open: boolean) => void
}) {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const wide = useMediaQuery('(min-width: 1024px)')
  const online = useOnline()
  const list = useFriends((s) => s.list)
  const listState = useFriends((s) => s.listState)
  const listError = useFriends((s) => s.listError)
  const [open, setOpen] = useState<FriendRow | null>(null)
  const [rules, setRules] = useState(false)
  // Invite rewards (docs/15 §25) live in ADD FRIENDS' pop-up, their rules behind INFO: reaching the page is enough for
  // Home's notice that sends the player here.
  const gaugeOn = !!useInviteGauge()
  const inviteDue = useGame((s) => !!s.save && inviteRulesDue(s.save, s.data))
  useSeenOnOpen(gaugeOn && inviteDue, seeInviteRules)
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
  // Friendship streaks (docs/60): the gauge on top, each friend's badge on their row, the rules behind INFO.
  const fship = useFriendshipView()
  useSeenOnOpen(fship.on && fship.rulesDue, seeFriendshipRules)
  // Friend Battles (docs/65): BATTLE in the card of a friend in the game now, then the challenge sheet.
  const pvpOn = useGame((s) => s.auth.status === 'signed_in' && friendBattlesFor(s.save, s.data))
  const onlineIds = usePvp((s) => s.online)
  const records = usePvp((s) => s.home?.records)
  const [target, setTarget] = useState<ChallengeTarget | null>(null)
  useEffect(() => {
    if (!pvpOn) return
    void loadOnline(true)
    void loadHome()
    const id = setInterval(() => void loadOnline(true), 20_000)
    return () => clearInterval(id)
  }, [pvpOn])
  const recordWith = (id: string, name: string) => {
    const r = records?.find((x) => x.id === id)
    return r ? headToHead(t, r.wins, r.losses, name) : null
  }
  const battleWith = (f: FriendRow) =>
    pvpOn && f.inRealm
      ? {
          online: onlineIds.includes(f.userId),
          record: recordWith(f.userId, f.name),
          onBattle: () => {
            setTarget({ id: f.userId, name: f.name, avatar: f.avatar, record: recordWith(f.userId, f.name) })
            // A phone shows one sheet at a time: the card steps aside for the challenge.
            if (!wide) setOpen(null)
          },
        }
      : undefined

  const main = (
    <>
      <FriendRequests requests={requests} />
      {fship.on && (
        <FriendshipGauge
          balance={fship.status?.balance ?? 0}
          earned={fship.status?.earned ?? 0}
          streaks={fship.status?.streaks ?? []}
          today={fship.today}
          state={fship.status ? 'ready' : fship.state === 'error' ? 'error' : 'loading'}
          onMarket={() => navigate('/market')}
        />
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
                online={pvpOn && f.inRealm && onlineIds.includes(f.userId)}
                onOpen={() => setOpen(f)}
              />
            ))}
          </ul>
        )}
      </section>

      <InfoButton name={t('ui.friends.infoName')} onClick={() => setRules(true)} />
    </>
  )

  return (
    <>
      <SplitView
        main={main}
        detail={
          shown ? (
            <FriendProfileSheet
              userId={shown.userId}
              name={shown.name}
              onClose={() => setOpen(null)}
              battle={battleWith(shown)}
            />
          ) : undefined
        }
        empty={
          <p className="m-0 grid flex-1 place-content-center justify-items-center gap-3 p-6 text-center text-[20px] text-muted">
            <PixelIcon name="navFriends" size={48} />
            {t('ui.friends.empty')}
          </p>
        }
      />
      {!wide && (
        <SocialDock>
          <AddFriendsButton className="w-full" onClick={() => setAdding(true)} />
        </SocialDock>
      )}

      <AddFriendsSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(f) => {
          const row = useFriends.getState().list?.find((r) => r.userId === f.id)
          if (row) setOpen(row)
        }}
      />
      <FriendsInfoModal open={rules} onClose={() => setRules(false)} invites={gaugeOn} friendship={fship.on} />
      {pvpOn && <ChallengeSheet target={target} onClose={() => setTarget(null)} />}
    </>
  )
}

/**
 * One friend: their look, name (NEW while new), team, where they are (or "Online now" with Friend Battles on) and
 * their streak. The whole row opens their card; BATTLE is in the card.
 */
function FriendListRow({
  friend: f,
  onOpen,
  picked,
  streak,
  today,
  online,
}: {
  friend: FriendRow
  onOpen: () => void
  picked?: boolean
  streak?: FriendStreak
  today: string
  /** In the game now (Friend Battles' presence, docs/65): a green dot and "Online now". */
  online?: boolean
}) {
  const { t } = useT()
  const line = useFriendLine()
  const now = Date.now()
  // Extreme mode (docs/22): a friend without an Extreme save is listed, greyed, and has no card to open here.
  const elsewhere = !f.inRealm
  const away = elsewhere || !f.updatedAt || now - f.updatedAt > AWAY_MS
  const summary = elsewhere ? t('ui.extreme.notIn') : online ? t('ui.pvp.onlineNow') : line(f, now)
  return (
    <li className="flex items-stretch">
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
              online ? 'text-good' : away ? 'text-ink' : 'text-muted',
            )}
          >
            {online && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3fbf6a] shadow-ring-thin" />}
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
    </li>
  )
}

/** Friendship (docs/60) as the page needs it: on for this player in the main game, the status, the server's day. */
export function useFriendshipView() {
  // Not in Extreme mode (a race of its own); inside a small world the gauge shows, and the market says it waits.
  const on = useGame((s) => !!s.save && [null, 'world'].includes(friendshipWaits(s.save, s.data)))
  const rulesDue = useGame((s) => !!s.save && friendshipRulesDue(s.save, s.data))
  const status = useFriendship((s) => s.status)
  const state = useFriendship((s) => s.state)
  return { on, rulesDue, status, state, today: status?.day || utcDay(Date.now()) }
}
