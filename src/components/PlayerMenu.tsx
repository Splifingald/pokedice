import { lazy, Suspense, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  badgeCase,
  discordUrl,
  extremeOn,
  extremeOpen,
  inWorldRegion,
  isExtreme,
  leaderboardUnlocked,
  tradeCfg,
  tradeClosed,
  tradesOf,
  tradesToWatch,
  tradesOn,
} from '@/engine'
import { otherSave } from '@/store/extreme'
import { useNewLooks } from '@/store/looks'
import { useT } from '@/i18n/react'
import { useFriends } from '@/lib/friends'
import { useInviteGauge } from './friends/InviteRewards'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { useIsAdmin, useLockReason } from '@/store/hooks'
import { cx } from '@/theme/util'
import { CloudSyncButton } from './CloudSyncButton'
import { ExtremeMark, SwitchSaveModal } from './Extreme'
import { ContactModal } from './ContactModal'
import { ConnectMarks, useConnect } from './AccountButton'
import { PixelIcon, type IconName } from './icons'
import { Modal } from './Modal'
import { TrainerLook } from './TrainerLook'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { SidePanel } from './SidePanel'
import { TrainerCard } from './TrainerCard'
import { LooksDot } from './TrainerLooks'
import { playerOf } from './TrainerArt'

const HelpContent = lazy(() => import('@/screens/Help').then((m) => ({ default: m.HelpContent })))
const TypesContent = lazy(() => import('@/screens/Types').then((m) => ({ default: m.TypesContent })))

/**
 * One row of the menu: an icon in a tile, a label, a one-line description, and either a route or an action — or
 * `href`, a link out of the game opened in a new tab. `hint`: a short tag at the far end. The label alone names the
 * row; the description is read after it. `shut`: why it can't be used right now (a fight under way): it stays listed,
 * greyed with a lock, the reason as its description, and a tap says it again.
 */
function MenuRow({ shut, ...row }: MenuRowProps & { shut?: string | null }) {
  // Shut: the same row, greyed, with a lock and the reason in place of what it does; a tap says it again.
  return shut ? (
    <MenuRowView label={row.label} icon="lock" desc={shut} onClick={() => pushToast(shut, 'info')} shut />
  ) : (
    <MenuRowView {...row} />
  )
}

interface MenuRowProps {
  icon?: IconName
  mark?: boolean
  label: string
  desc?: string
  hint?: string
  /** A gold dot with a number: something new to look at (it is also in the label). */
  dot?: number
  href?: string
  onClick?: () => void
}

function MenuRowView({ icon, mark, label, desc, hint, dot, href, onClick, shut }: MenuRowProps & { shut?: boolean }) {
  const descId = useId()
  const className = cx(
    'flex min-h-[56px] w-full items-center gap-2.5 bg-paper pb-2 pl-2 pr-3 pt-1.5 text-left text-ink shadow-card',
    shut && 'opacity-60',
  )
  const body = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center bg-sky shadow-ring">
        {mark ? <ConnectMarks size={14} /> : icon && <PixelIcon name={icon} size={18} />}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="truncate text-[20px] font-normal leading-none">{label}</b>
        {desc && (
          <small id={descId} className="font-pixel-sm text-[14px] leading-[1.1] text-muted">
            {desc}
          </small>
        )}
      </span>
      {!!dot && (
        <em aria-hidden className="grid h-6 min-w-6 shrink-0 place-items-center bg-gold px-1 font-pixel-sm text-[15px] not-italic text-ink shadow-ring">
          {dot > 9 ? '9+' : dot}
        </em>
      )}
      {hint && <em className="light-scope shrink-0 bg-night px-2 pb-[3px] pt-0.5 text-[15px] not-italic text-gold-light">{hint}</em>}
    </>
  )
  const a11y = {
    'aria-label': dot ? `${label} (${dot})` : label,
    'aria-describedby': desc ? descId : undefined,
    'aria-disabled': shut || undefined,
  }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className} {...a11y}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className} {...a11y}>
      {body}
    </button>
  )
}

/**
 * The header's avatar button and everything behind it: the player's profile, the settings screen,
 * the rules, the type chart, the admin (admins only), the Google connection and, pinned at the bottom, the community
 * Discord (once the admin has set its link) and Contact the developer. Mid-fight it opens as ever; the rows that would
 * leave the fight (another page, the other save, signing in) are shut and say why.
 */
export function PlayerMenu() {
  const { t } = useT()
  const navigate = useNavigate()
  // Mid-fight (or in a portal run) the menu still opens: what stays on this page works, what would leave it says why.
  const shut = useLockReason()
  const isAdmin = useIsAdmin()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth)
  const discord = useGame((s) => discordUrl(s.data))
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState(false)
  const [types, setTypes] = useState(false)
  const [contact, setContact] = useState(false)
  const [switching, setSwitching] = useState(false)
  const { connect, chooser } = useConnect()
  const newFriends = useFriends((s) => (s.userId && s.userId === auth.userId ? s.unseen.length : 0))
  // Invite rewards ready to open (docs/15 §25) wait on the Friends page: its dot counts them too.
  const rewardsReady = useInviteGauge()?.ready.length ?? 0
  const friendCount = useFriends((s) => s.ids.size)
  // Trades (docs/23): a trade of yours went through while you were away and you haven't looked yet, or a traded
  // Pokémon waits for you to pick its Box.
  const tradesUnseen = save && !isExtreme(save) ? tradesToWatch(save).length : 0
  const tradesOut = save ? tradesOf(save).out.length : 0
  // The row is there once the admin's switch is on for this player (and while something is listed, so it can come back).
  // Not inside a small world: no trade reaches one (docs/21).
  const tradesRow =
    isSupabaseConfigured && !!save && !isExtreme(save) && !inWorldRegion(save, data) && (tradesOn(data) || tradesOut > 0)
  const news = newFriends + rewardsReady + tradesUnseen
  // Trainer looks unlocked since the menu was last opened (docs/31): their own red dot, under the gold one.
  const looksNew = useNewLooks()

  const name = playerOf(save).name
  const badges = save ? badgeCase(save, data) : []
  const earned = badges.filter((b) => b.earned).length
  const boardOpen = !!save && leaderboardUnlocked(save, data)
  // The Connect row only makes sense when cloud backup exists on this deployment and nobody is signed in.
  const canConnect = isSupabaseConfigured && auth.status === 'signed_out'
  // Extreme mode (docs/22): from the main save once it's open (or an Extreme save exists); back from Extreme always.
  const extreme = isExtreme(save)
  const canSwitch = extreme || (extremeOn(data) && (extremeOpen(save, data) || !!otherSave()))

  const go = (to: string) => () => {
    setOpen(false)
    navigate(to)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={news + looksNew ? t('ui.profile.menuLabelNew', { n: news + looksNew }) : t('ui.profile.menuLabel')}
        title={t('ui.profile.menuLabel')}
        className="flex min-h-[44px] min-w-0 shrink flex-row-reverse items-center gap-2 text-right"
      >
        <span className="relative shrink-0">
          <span className="grid h-[38px] w-[38px] place-items-center overflow-hidden rounded-full bg-[#7fb4ff] shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_#4f86d8]">
            <TrainerLook src={avatarOf(playerAvatarId(save?.player)).src} w={30} h={30} />
          </span>
          {extreme && <ExtremeMark className="absolute -bottom-1 -left-1" />}
          {news > 0 && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center bg-gold px-0.5 font-pixel-sm text-[13px] leading-none text-ink shadow-ring"
            >
              {news > 9 ? '9+' : news}
            </span>
          )}
          {!news && looksNew > 0 && <LooksDot n={looksNew} className="absolute -right-1 -top-1" />}
        </span>
        <span className="grid min-w-0 leading-none">
          <b className="truncate text-[20px] font-normal">{name || t('ui.profile.title')}</b>
          <small className="flex items-center justify-end gap-[3px] font-pixel-sm text-[15px] text-muted">
            <PixelIcon name="badge" size={8} />
            {earned}/{badges.length}
          </small>
        </span>
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={t('ui.profile.title')}
        footer={
          <div className="flex flex-col gap-2">
            {(!isSupabaseConfigured || auth.status === 'unavailable') && (
              <p className="copy text-sm text-muted">{t('ui.nav.saveInBrowser')}</p>
            )}
            {discord && <MenuRow icon="discord" label={t('ui.nav.discord')} href={discord} onClick={() => setOpen(false)} />}
            {/* Messages go to Supabase, so a deployment without it has no one to send them to. */}
            {isSupabaseConfigured && (
              <MenuRow
                icon="mail"
                label={t('ui.contact.button')}
                onClick={() => {
                  setOpen(false)
                  setContact(true)
                }}
              />
            )}
          </div>
        }
      >
        <TrainerCard />
        <nav aria-label={t('ui.profile.menuLabel')} className="mt-3 flex flex-col gap-1.5">
          <MenuRow
            icon={boardOpen ? 'trophy' : 'lock'}
            label={t('ui.board.title')}
            desc={boardOpen ? t('ui.menu.board') : t('ui.nav.boardLocked')}
            onClick={go('/leaderboard')}
            shut={shut}
          />
          {isSupabaseConfigured && (
            <MenuRow
              icon="friends"
              label={t('ui.friends.title')}
              desc={t('ui.menu.friends')}
              dot={newFriends + rewardsReady}
              hint={!newFriends && !rewardsReady && friendCount ? String(friendCount) : undefined}
              onClick={go('/friends')}
              shut={shut}
            />
          )}
          {tradesRow && (
            <MenuRow
              icon="trade"
              label={t('ui.trades.title')}
              desc={
                auth.status !== 'signed_in'
                  ? t('ui.menu.tradesConnect')
                  : save && tradeClosed(save, data) === 'badges'
                    ? t('ui.trades.locked', { n: tradeCfg(data).minBadges })
                    : t('ui.menu.trades')
              }
              dot={tradesUnseen}
              hint={!tradesUnseen && tradesOut ? `${tradesOut}/${tradeCfg(data).maxListings}` : undefined}
              onClick={go('/trades')}
              shut={shut}
            />
          )}
          {canSwitch && (
            <MenuRow
              icon={extreme ? 'play' : 'skull'}
              label={t(extreme ? 'ui.extreme.menu.toMain' : 'ui.extreme.menu.toExtreme')}
              desc={t(extreme ? 'ui.extreme.menu.toMainDesc' : 'ui.extreme.menu.toExtremeDesc')}
              onClick={() => {
                setOpen(false)
                setSwitching(true)
              }}
              shut={shut}
            />
          )}
          <MenuRow icon="gear" label={t('ui.nav.settings')} desc={t('ui.menu.settings')} onClick={go('/settings')} shut={shut} />
          <MenuRow
            icon="book"
            label={t('ui.profile.guide')}
            desc={t('ui.menu.guide')}
            onClick={() => {
              setOpen(false)
              setGuide(true)
            }}
          />
          <MenuRow
            icon="vs"
            label={t('ui.help.navTypes')}
            desc={t('ui.menu.types')}
            onClick={() => {
              setOpen(false)
              setTypes(true)
            }}
          />
          {isAdmin && <MenuRow icon="wrench" label={t('ui.nav.admin')} desc={t('ui.menu.admin')} onClick={go('/admin')} shut={shut} />}
          <CloudSyncButton />
          {canConnect && (
            <MenuRow
              mark
              label={t('ui.account.connect')}
              desc={t('ui.menu.connect')}
              onClick={() => {
                setOpen(false)
                connect()
              }}
              // Signing in may load the cloud's save over this one, which would end the fight (as SYNC ONLINE).
              shut={shut}
            />
          )}
        </nav>
      </SidePanel>

      <ContactModal open={contact} onClose={() => setContact(false)} />
      <SwitchSaveModal to={extreme ? 'main' : 'extreme'} open={switching} onClose={() => setSwitching(false)} />

      {chooser}

      <Modal open={guide} onClose={() => setGuide(false)} title={t('ui.settings.howToPlay')} className="max-w-3xl">
        <Suspense fallback={<p className="text-xl">{t('ui.common.loading')}</p>}>
          <HelpContent />
        </Suspense>
      </Modal>

      <Modal open={types} onClose={() => setTypes(false)} title={t('ui.help.navTypes')} className="max-w-3xl">
        <Suspense fallback={<p className="text-xl">{t('ui.common.loading')}</p>}>
          <TypesContent />
        </Suspense>
      </Modal>
    </>
  )
}
