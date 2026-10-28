// The next region's offer, once a league is won: Prof. Oak's terms in a pop-up, then the professor's lab. It opens by
// itself once per region, on its turn in the one-time pop-ups' queue (engine/popups.ts); once closed it is saved as
// seen, and the offer waits on Home as a notice (home/Notices.tsx) and in the Areas sheet's Regions view, which start the
// region themselves. Nothing of this exists until a league has been won, which keeps Johto unmentioned for a player
// still working through Kanto.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRegion, regionOf, type Region } from '@/engine'
import { useT } from '@/i18n/react'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { PartnerMoment } from '@/components/PartnerMoment'
import { useMyTurn, useOnScreen } from '@/components/popupTurn'
import { closeRegionOffer, regionOnOffer, startRegion } from '@/store/regions'
import { useGame } from '@/store/game'
import { exploreFirstArea } from '@/store/run'
import { TrainerSprite } from '@/components/TrainerArt'

/** `go`: a count bumped by Home's region notice's GO, which opens the lab straight away. */
export function RegionBar({ go = 0 }: { go?: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const busy = useGame((s) => s.run.phase !== 'idle')
  const open = useMyTurn('regionOffer')
  const [picking, setPicking] = useState(false)
  const navigate = useNavigate()
  const offer = regionOnOffer()
  const offerOpen = open && !busy && !picking
  useEffect(() => {
    if (go > 0) setPicking(true)
  }, [go])
  useOnScreen('regionOffer', offerOpen)
  if (!offer) return null

  return (
    <>
      {/* The terms, then the professor's lab: the three balls drop onto the table and one becomes the partner. */}
      {offer && (
        <Modal
          open={offerOpen}
          onClose={closeRegionOffer}
          title={t('ui.region.awaits', { region: offer.name })}
        >
          <RegionTerms region={offer} onClose={closeRegionOffer} onAccept={() => setPicking(true)} />
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
            // The rework: a region begun opens on its first area, not Home.
            if (startRegion(offer.id, dex) && exploreFirstArea()) navigate('/area')
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
