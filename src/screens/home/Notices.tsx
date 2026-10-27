// Home's notices (docs/43 §7): what used to open over Home as a one-time pop-up but asks nothing there, now a card in
// the page above the sections. A feature with a page of its own opening ("Versus is open!", with the way to its page,
// whose rules card explains it), Prof. Oak's leaderboard tip, Support me, his invite, and a new region on offer once
// its own pop-up has been seen. One at a time, the first due (engine/popups.ts `homeNotices`): Home stays a place to
// play, not a board of messages. A feature's ✕ puts its notice away for this visit only; its page's GOT IT for good.
import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  eventUnlockDue,
  homeNotices,
  regionOfferDue,
  versusLeagueFor,
  type GameData,
  type HomeNotice,
  type SaveData,
} from '@/engine'
import { useT } from '@/i18n/react'
import { PixelIcon, type IconName } from '@/components/icons'
import { LeaderboardNotice } from '@/components/LeaderboardTutorial'
import { NoticeCard } from '@/components/NoticeCard'
import { PixelButton } from '@/components/PixelButton'
import { useShareSeen } from '@/components/ShareTutorial'
import { SupportNotice, useDonationReady } from '@/components/SupportModal'
import { regionPicture } from '@/fx/regionArt'
import { useGame } from '@/store/game'
import { regionOnOffer } from '@/store/regions'
import { useServerNow } from '@/store/serverTime'
import { EVENT_ICON } from '@/screens/events/shared'
import { useInWorld } from '@/screens/events/world'

/** The next region, while it waits: its picture, its name and SEE, which opens the Areas sheet on the regions. */
export function RegionOfferNotice({
  name,
  picture,
  onGo,
  onDismiss,
}: {
  name: string
  picture?: string
  onGo: () => void
  onDismiss: () => void
}) {
  const { t } = useT()
  const titleId = useId()
  // The region's own picture is the card (the user's call, 2026-10-27): its name, and GO or not now. Nothing to read.
  return (
    <section
      aria-labelledby={titleId}
      className="pixel-panel panel-gold relative min-h-[132px] overflow-hidden p-0"
    >
      {picture && (
        <img src={picture} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" draggable={false} />
      )}
      <div className="relative flex min-h-[132px] flex-col justify-end gap-2.5 bg-gradient-to-t from-night/85 via-night/40 to-transparent p-3">
        <h2 id={titleId} className="m-0 text-[26px] font-normal leading-none text-panel [text-shadow:0_2px_0_rgb(0_0_0/0.6)]">
          {t('ui.home.regionAvailable', { region: name })}
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
          <PixelButton size="sm" onClick={onDismiss}>
            {t('ui.friends.notNow')}
          </PixelButton>
          <PixelButton size="sm" variant="gold" onClick={onGo}>
            {t('ui.home.go')}
          </PixelButton>
        </div>
      </div>
    </section>
  )
}

/** A feature with a page of its own: its notice's name, icon and page. */
export interface FeatureNoticeTarget {
  name: string
  icon: IconName
  to: string
}

/** Where each feature's notice leads (its page, where its rules card waits), or null for the notices that aren't a feature's. */
export function featureTarget(
  id: HomeNotice,
  save: SaveData,
  data: GameData,
  t: (key: string, vars?: Record<string, string | number>) => string,
): FeatureNoticeTarget | null {
  switch (id) {
    case 'dayCare':
      return { name: t('ui.home.dayCare'), icon: 'heart', to: '/daycare' }
    case 'event': {
      const ev = eventUnlockDue(save, data)
      return ev ? { name: t(`ui.events.${ev}.name`), icon: EVENT_ICON[ev], to: `/events/${ev}` } : null
    }
    case 'versus':
      // The weekly league (docs/44) is announced under its own name, to players who knew Versus before too.
      return versusLeagueFor(save, data)
        ? { name: t('ui.league.title'), icon: 'trophy', to: '/versus' }
        : { name: t('ui.versus.title'), icon: 'vs', to: '/versus' }
    case 'trades':
      return { name: t('ui.trades.title'), icon: 'trade', to: '/trades' }
    case 'general':
      return { name: t('ui.home.generalName'), icon: 'navUpgrades', to: '/shop?tab=upgrades&up=general' }
    case 'shinyDex':
      return { name: t('ui.dex.shinyTitle'), icon: 'sparkle', to: '/pokedex?view=shiny' }
    case 'unownDex':
      return { name: t('ui.unown.title'), icon: 'dex', to: '/pokedex?view=unown' }
    case 'invites':
      return { name: t('ui.invite.title'), icon: 'gift', to: '/friends' }
    case 'raidRules':
      return { name: t('ui.events.raid.name'), icon: 'star', to: '/events/raid' }
    case 'underground':
      return { name: t('ui.live.underground.name'), icon: 'pickaxe', to: '/underground' }
    default:
      return null
  }
}

/** A feature's opening: its icon, "{name} is open!", the line saying its page explains it, and the way there. */
export function FeatureNotice({
  target,
  onGo,
  onClose,
}: {
  target: FeatureNoticeTarget
  onGo: () => void
  onClose: () => void
}) {
  const { t } = useT()
  return (
    <NoticeCard
      tone="gold"
      picture={
        <span className="grid h-14 w-14 place-items-center bg-paper shadow-ring-thin">
          <PixelIcon name={target.icon} size={32} />
        </span>
      }
      title={t('ui.home.featureOpen', { name: target.name })}
      onClose={onClose}
      testId="feature-notice"
      action={
        <PixelButton size="sm" onClick={onGo}>
          {t('ui.region.see', { region: target.name })}
        </PixelButton>
      }
    >
      {t('ui.home.featureLine')}
    </NoticeCard>
  )
}

/**
 * A region's notice put away with Not now: on this device, for good (the region stays in the Areas sheet's Regions
 * view, where it can be started any time).
 */
const regionNoticeKey = (id: string) => `pokedice.regionNotice.${id}`
function regionNoticeHidden(id: string) {
  try {
    return localStorage.getItem(regionNoticeKey(id)) === '1'
  } catch {
    return false
  }
}
function hideRegionNotice(id: string) {
  try {
    localStorage.setItem(regionNoticeKey(id), '1')
  } catch {
    // Private mode: it comes back next visit.
  }
}

/** Feature notices put away with ✕ this visit (in memory: they come back next time, until the page's rules are read). */
const putAway = new Set<HomeNotice>()

export function HomeNotices({ onRegionGo }: { onRegionGo: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const now = useServerNow(30_000)
  const shareSeen = useShareSeen()
  const donationReady = useDonationReady()
  const [, rerender] = useState(0)
  const inside = useInWorld().inside
  // Prof. Oak's invite waits on the friends list, not here (the user's call, 2026-10-27).
  const due = homeNotices(save, data, { shareSeen, signedIn, now }).filter(
    (n) => n !== 'share' && !putAway.has(n) && (n !== 'donation' || donationReady),
  )
  // The region's own pop-up opens first, once (RegionBar); afterwards the offer waits here, at the top of the page.
  // Not inside a small world, where no other region is offered (docs/21).
  const offer = inside ? null : regionOnOffer()
  if (offer && save && !regionOfferDue(save, data) && !regionNoticeHidden(offer.id)) {
    const picture = regionPicture(offer.id)?.url
    return (
      <RegionOfferNotice
        name={offer.name}
        picture={picture}
        onGo={onRegionGo}
        onDismiss={() => {
          hideRegionNotice(offer.id)
          rerender((n) => n + 1)
        }}
      />
    )
  }
  const first = due[0]
  if (!first || !save) return null
  if (first === 'leaderboard') return <LeaderboardNotice />
  if (first === 'donation') return <SupportNotice />
  const target = featureTarget(first, save, data, t)
  if (!target) return null
  return (
    <FeatureNotice
      key={first}
      target={target}
      onGo={() => navigate(target.to)}
      onClose={() => {
        putAway.add(first)
        rerender((n) => n + 1)
      }}
    />
  )
}
