// The region strip at the top of the Map: where you are, where else you have been, and the offer of somewhere new.
//
// None of this exists until a league has been won: with one region unlocked and nothing on offer, the bar renders
// nothing at all, which is what keeps Johto unmentioned for a player still working through Kanto.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { getRegion, regionOf, tutorialPending, type Region } from '@/engine'
import { useT } from '@/i18n/react'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { availableRegions, regionOnOffer, startRegion, switchRegion } from '@/store/regions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

export function RegionBar() {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  // Prof. Oak's one-time pop-ups queue rather than stack, and they go first: the offer waits its turn behind them,
  // and the banner keeps it on screen meanwhile.
  const waiting = useGame((s) => !!s.save && tutorialPending(s.save, s.data))
  const busy = useGame((s) => s.run.phase !== 'idle')
  const [dismissed, setDismissed] = useState(false)
  const [picking, setPicking] = useState(false)

  const regions = availableRegions()
  const offer = regionOnOffer()
  const current = regionOf(save)
  const offerOpen = !dismissed && !waiting && !busy && !picking
  if (regions.length < 2 && !offer) return null

  return (
    <>
      {regions.length > 1 && (
        <nav aria-label={t('ui.region.label')} className="flex flex-wrap items-center gap-2">
          <span className="text-lg text-muted">{t('ui.region.label')}</span>
          {regions.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-current={r.id === current ? 'page' : undefined}
              onClick={() => switchRegion(r.id)}
              className={cx(
                'min-h-[34px] border-2 border-ink px-2 text-xl leading-tight',
                r.id === current ? 'bg-gold text-ink' : 'bg-panel hover:bg-white',
              )}
            >
              {r.name}
            </button>
          ))}
        </nav>
      )}

      {offer && (
        <motion.div
          className="pixel-panel flex flex-wrap items-center gap-3 border-gold p-3"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="min-w-0 flex-1 basis-64">
            <div className="text-2xl leading-tight text-gold">{t('ui.region.newOpen')}</div>
            <p className="text-lg leading-tight text-muted">{t('ui.region.newBody', { region: offer.name })}</p>
          </div>
          <PixelButton variant="primary" onClick={() => setDismissed(false)}>
            {t('ui.region.see', { region: offer.name })}
          </PixelButton>
        </motion.div>
      )}

      {/* One modal, two panels: the terms, then the starters. Two modals would stack and cross-fade over each other. */}
      {offer && (
        <Modal
          open={offerOpen || picking}
          onClose={() => {
            setPicking(false)
            setDismissed(true)
          }}
          title={t(picking ? 'ui.region.choosePartner' : 'ui.region.awaits', { region: offer.name })}
        >
          {picking ? (
            <StarterPicker region={offer} onBack={() => setPicking(false)} onDone={() => setPicking(false)} />
          ) : (
            <RegionTerms
              region={offer}
              onClose={() => setDismissed(true)}
              onAccept={() => setPicking(true)}
            />
          )}
        </Modal>
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
      <img
        src="/characters/prof-oak.png"
        alt=""
        width={96}
        height={96}
        className="mx-auto block"
        style={{ imageRendering: 'pixelated' }}
      />
      <p className="text-xl leading-tight">{t('ui.region.termsIntro', { here, region: region.name })}</p>
      <ul className="flex flex-col gap-1 border-[3px] border-ink bg-parchment p-2 text-lg leading-tight">
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

/** The region's three starters. Picking one begins the region. */
function StarterPicker({
  region,
  onBack,
  onDone,
}: {
  region: Region
  onBack: () => void
  onDone: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [choice, setChoice] = useState<number | null>(null)
  const starters = region.starters.filter((d) => data.species[d])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {starters.map((dex) => {
          const s = data.species[dex]!
          return (
            <button
              key={dex}
              type="button"
              aria-pressed={choice === dex}
              onClick={() => setChoice(dex)}
              className={cx(
                'pixel-panel flex flex-col items-center gap-1 p-2',
                choice === dex ? 'bg-gold' : 'hover:bg-white',
              )}
            >
              <SpriteImg dex={dex} size={96} />
              <span className="text-xl leading-none">{s.name}</span>
              <span className="flex gap-1">
                <TypeBadge type={s.type1} size="sm" />
                {s.type2 && <TypeBadge type={s.type2} size="sm" />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PixelButton onClick={onBack}>{t('ui.region.back')}</PixelButton>
        <PixelButton
          variant="primary"
          disabled={choice == null}
          onClick={() => {
            if (choice != null && startRegion(region.id, choice)) onDone()
          }}
        >
          {choice != null ? t('ui.region.setOff', { name: data.species[choice]?.name ?? '' }) : t('ui.region.pickOne')}
        </PixelButton>
      </div>
    </div>
  )
}
