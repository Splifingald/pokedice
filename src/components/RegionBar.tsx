// The region strip at the top of the Map: where you are, where else you have been, and the offer of somewhere new.
//
// None of this exists until a league has been won: with one region unlocked and nothing on offer, the bar renders
// nothing at all, which is what keeps Johto unmentioned for a player still working through Kanto.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { donationDue, getRegion, regionOf, regionOfferDue, tutorialPending, type Region } from '@/engine'
import { useT } from '@/i18n/react'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { PartnerMoment } from '@/components/PartnerMoment'
import { availableRegions, closeRegionOffer, regionOnOffer, startRegion, switchRegion } from '@/store/regions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { TrainerSprite } from '@/components/TrainerArt'

/** `modalOnly`: just the offer's pop-up (Home shows the regions in its Areas sheet). */
export function RegionBar({ modalOnly = false }: { modalOnly?: boolean }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  // Prof. Oak's one-time pop-ups queue rather than stack, and they go first: the offer waits its turn behind them,
  // and the banner keeps it on screen meanwhile. The donation pop-up goes first too.
  const waiting = useGame((s) => !!s.save && (tutorialPending(s.save, s.data) || donationDue(s.save, s.data)))
  const busy = useGame((s) => s.run.phase !== 'idle')
  // The pop-up opens by itself once per region; once closed, it is saved as seen and only the banner reopens it.
  const due = useGame((s) => !!s.save && !!regionOfferDue(s.save, s.data))
  const [reopened, setReopened] = useState(false)
  const [picking, setPicking] = useState(false)

  const regions = availableRegions()
  const offer = regionOnOffer()
  const current = regionOf(save)
  const offerOpen = (due || reopened) && !waiting && !busy && !picking
  const closeOffer = () => {
    setReopened(false)
    closeRegionOffer()
  }
  if (regions.length < 2 && !offer) return null

  return (
    <>
      {!modalOnly && regions.length > 1 && (
        <nav aria-label={t('ui.region.label')} className="flex flex-wrap items-center gap-2">
          <span className="text-lg text-muted">{t('ui.region.label')}</span>
          {regions.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-current={r.id === current ? 'page' : undefined}
              onClick={() => switchRegion(r.id)}
              className={cx(
                'min-h-[34px] border-2 border-edge px-2 text-xl leading-tight',
                r.id === current ? 'bg-gold text-ink' : 'bg-panel hover:bg-paper',
              )}
            >
              {r.name}
            </button>
          ))}
        </nav>
      )}

      {!modalOnly && offer && (
        <motion.div
          className="pixel-panel flex flex-wrap items-center gap-3 border-gold p-3"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="min-w-0 flex-1 basis-64">
            <div className="text-2xl leading-tight text-gold">{t('ui.region.newOpen')}</div>
            <p className="text-lg leading-tight text-muted">{t('ui.region.newBody', { region: offer.name })}</p>
          </div>
          <PixelButton variant="primary" onClick={() => setReopened(true)}>
            {t('ui.region.see', { region: offer.name })}
          </PixelButton>
        </motion.div>
      )}

      {/* The terms, then the professor's lab: the three balls drop onto the table and one becomes the partner. */}
      {offer && (
        <Modal open={offerOpen} onClose={closeOffer} title={t('ui.region.awaits', { region: offer.name })}>
          <RegionTerms region={offer} onClose={closeOffer} onAccept={() => setPicking(true)} />
        </Modal>
      )}
      {offer && picking && (
        <PartnerMoment
          starters={offer.starters.filter((d) => data.species[d])}
          regionId={offer.id}
          regionName={offer.name}
          level={data.config.starterLevel}
          onLeave={() => setPicking(false)}
          onPick={(dex) => {
            setPicking(false)
            startRegion(offer.id, dex)
          }}
        />
      )}
    </>
  )
}

/** The terms, in Oak's voice: a fresh start there, nothing lost here, and it all comes back when that league falls. */
function RegionTerms({
  region,
  onClose,
  onAccept,
}: {
  region: Region
  onClose: () => void
  onAccept: () => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const here = getRegion(data, regionOf(save))?.name ?? ''
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center">
        <TrainerSprite src="/characters/prof-oak.png" size={96} />
      </div>
      <p className="text-xl leading-tight">{t('ui.region.termsIntro', { here, region: region.name })}</p>
      <ul className="flex flex-col gap-1 bg-paper p-2 text-lg shadow-ring leading-tight">
        <li>{t('ui.region.termsSelf')}</li>
        <li>{t('ui.region.termsStay', { here })}</li>
        <li>{t('ui.region.termsBack')}</li>
        <li>{t('ui.region.termsSeparate')}</li>
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <PixelButton onClick={onClose}>{t('ui.region.notYet')}</PixelButton>
        <PixelButton
          variant="primary"
          onClick={() => {
            onClose()
            onAccept()
          }}
        >
          {t('ui.region.goTo', { region: region.name })}
        </PixelButton>
      </div>
    </div>
  )
}
