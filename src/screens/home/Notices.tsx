// Home's notices (docs/43 §7): what used to open over Home as a one-time pop-up but asks nothing of the player, now a
// card in the page above the sections — Prof. Oak's leaderboard tip, Support me, his invite — and a new region on
// offer once its own pop-up has been seen. One at a time, the first due (engine/popups.ts `homeNotices`): Home stays a
// place to play, not a board of messages.
import { homeNotices, regionOfferDue } from '@/engine'
import { useT } from '@/i18n/react'
import { LeaderboardNotice } from '@/components/LeaderboardTutorial'
import { NoticeCard } from '@/components/NoticeCard'
import { PixelButton } from '@/components/PixelButton'
import { ShareNotice, useShareSeen } from '@/components/ShareTutorial'
import { SupportNotice, useDonationReady } from '@/components/SupportModal'
import { regionPicture } from '@/fx/regionArt'
import { useGame } from '@/store/game'
import { regionOnOffer } from '@/store/regions'
import { useInWorld } from '@/screens/events/world'

/** The next region, while it waits: its picture, its name and SEE, which opens the Areas sheet on the regions. */
export function RegionOfferNotice({
  name,
  picture,
  onSee,
}: {
  name: string
  picture?: string
  onSee: () => void
}) {
  const { t } = useT()
  return (
    <NoticeCard
      tone="gold"
      picture={
        picture ? (
          <img src={picture} alt="" className="pixelated h-14 w-14 object-cover shadow-ring-thin" />
        ) : (
          <span
            className="grid h-14 w-14 place-items-center bg-well text-[34px] leading-none shadow-ring-thin"
            aria-hidden
          >
            ?
          </span>
        )
      }
      title={t('ui.region.newOpen')}
      action={
        <PixelButton size="sm" variant="gold" onClick={onSee}>
          {t('ui.region.see', { region: name })}
        </PixelButton>
      }
    >
      {t('ui.home.offerLine', { region: name })}
    </NoticeCard>
  )
}

export function HomeNotices({ onRegions }: { onRegions: () => void }) {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const shareSeen = useShareSeen()
  const donationReady = useDonationReady()
  const due = homeNotices(save, data, { shareSeen }).filter((n) => n !== 'donation' || donationReady)
  // The region's own pop-up opens first, once (RegionBar); afterwards the offer waits here, at the top of the page.
  // Not inside a small world, where no other region is offered (docs/21).
  const offer = useInWorld().inside ? null : regionOnOffer()
  if (offer && save && !regionOfferDue(save, data)) {
    const picture = regionPicture(offer.id)?.url
    return <RegionOfferNotice name={offer.name} picture={picture} onSee={onRegions} />
  }
  const first = due[0]
  if (!first) return null
  return first === 'leaderboard' ? (
    <LeaderboardNotice />
  ) : first === 'donation' ? (
    <SupportNotice />
  ) : (
    <ShareNotice />
  )
}
