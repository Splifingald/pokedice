// The region strip at the top of the Map: where you are, where else you have been, and the offer of somewhere new.
//
// None of this exists until a league has been won: with one region unlocked and nothing on offer, the bar renders
// nothing at all, which is what keeps Johto unmentioned for a player still working through Kanto.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { getRegion, regionOf, type Region } from '@/engine'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { availableRegions, regionOnOffer, startRegion, switchRegion } from '@/store/regions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

export function RegionBar() {
  const save = useGame((s) => s.save)!
  const [offerOpen, setOfferOpen] = useState(true)
  const [picking, setPicking] = useState(false)

  const regions = availableRegions()
  const offer = regionOnOffer()
  const current = regionOf(save)
  if (regions.length < 2 && !offer) return null

  return (
    <>
      {regions.length > 1 && (
        <nav aria-label="Region" className="flex flex-wrap items-center gap-2">
          <span className="text-lg text-muted">Region</span>
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
            <div className="text-2xl leading-tight text-gold">A new region is open</div>
            <p className="text-lg leading-tight text-muted">
              {offer.name} is waiting. You will start over there — new partner, empty bag — but everything
              here stays exactly as you left it.
            </p>
          </div>
          <PixelButton variant="primary" onClick={() => setOfferOpen(true)}>
            See {offer.name}
          </PixelButton>
        </motion.div>
      )}

      {offer && (
        <RegionOffer
          region={offer}
          open={offerOpen}
          onClose={() => setOfferOpen(false)}
          onAccept={() => setPicking(true)}
        />
      )}
      {offer && picking && <StarterPicker region={offer} onClose={() => setPicking(false)} />}
    </>
  )
}

/** The terms, in Oak's voice: a fresh start there, nothing lost here, and it all comes back when that league falls. */
function RegionOffer({
  region,
  open,
  onClose,
  onAccept,
}: {
  region: Region
  open: boolean
  onClose: () => void
  onAccept: () => void
}) {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const here = getRegion(data, regionOf(save))
  return (
    <Modal open={open} onClose={onClose} title={`${region.name} awaits`}>
      <div className="flex flex-col gap-3">
        <img
          src="/characters/prof-oak.png"
          alt=""
          width={96}
          height={96}
          className="mx-auto block"
          style={{ imageRendering: 'pixelated' }}
        />
        <p className="text-xl leading-tight">
          You have beaten the league. Beyond {here?.name ?? 'here'} lies <strong>{region.name}</strong> — new
          routes, new gyms, and Pokémon you have never seen.
        </p>
        <ul className="flex flex-col gap-1 border-[3px] border-ink bg-parchment p-2 text-lg leading-tight">
          <li>You travel as yourself — same name, same character.</li>
          <li>
            Your Pokémon, your bag and your ₽ <strong>stay in {here?.name ?? 'this region'}</strong>. You will
            choose a new partner there.
          </li>
          <li>Come back any time from the Region row at the top of the Map.</li>
          <li>
            Beat {region.name}&apos;s league and everything you left behind is <strong>yours again</strong>,
            all in one place.
          </li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <PixelButton onClick={onClose}>Not yet</PixelButton>
          <PixelButton
            variant="primary"
            onClick={() => {
              onClose()
              onAccept()
            }}
          >
            Go to {region.name}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/** The region's three starters. Picking one begins the region. */
function StarterPicker({ region, onClose }: { region: Region; onClose: () => void }) {
  const data = useGame((s) => s.data)
  const [choice, setChoice] = useState<number | null>(null)
  const starters = region.starters.filter((d) => data.species[d])

  return (
    <Modal open onClose={onClose} title={`Choose your ${region.name} partner`}>
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
          <PixelButton onClick={onClose}>Back</PixelButton>
          <PixelButton
            variant="primary"
            disabled={choice == null}
            onClick={() => {
              if (choice != null && startRegion(region.id, choice)) onClose()
            }}
          >
            {choice != null ? `Set off with ${data.species[choice]?.name}` : 'Pick one'}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
