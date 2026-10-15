import { monName, regionBestLevel, worldById, type WorldHomer } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { worldName } from '@/store/worlds'
import { PixelIcon } from './icons'

/**
 * A Pokémon waiting to unlock in a region (docs/26 §1), on its sheet: the level it waits for, where it came from (the
 * small world it came home from, when the admin still lists it, the region it was sent from, or the trainer it was
 * traded by), and the region's best now, with what it can't do until then.
 */
export function HomerLockView({
  name,
  level,
  best,
  region,
  world,
  from = null,
  tradedBy = null,
}: {
  name: string
  level: number
  best: number
  region: string
  world: string | null
  /** The region it was sent from, for one that didn't come from a world. */
  from?: string | null
  /** The trainer it came from in a trade, for one that arrived above the region's best (docs/23 §1.4). */
  tradedBy?: string | null
}) {
  const { t } = useT()
  return (
    <section className="flex flex-col gap-1.5 bg-well p-2.5 shadow-ring-line" aria-labelledby="homer-lock">
      <h3 id="homer-lock" className="flex items-center gap-1.5 text-[20px] font-normal leading-none">
        <PixelIcon name="lock" size={16} className="shrink-0" />
        {t('ui.sheet.lockTitle', { n: level })}
      </h3>
      {world ? (
        <p className="font-pixel-sm text-[15px] leading-tight text-muted">
          {t('ui.sheet.lockFrom', { world })}
        </p>
      ) : from ? (
        <p className="font-pixel-sm text-[15px] leading-tight text-muted">
          {t('ui.sheet.lockSentFrom', { region: from })}
        </p>
      ) : (
        tradedBy && (
          <p className="font-pixel-sm text-[15px] leading-tight text-muted">
            {t('ui.sheet.lockTradedBy', { name: tradedBy })}
          </p>
        )
      )}
      <p className="copy text-base">{t('ui.sheet.lockText', { name, region, n: level, best })}</p>
    </section>
  )
}

/** The lock of one waiting Pokémon, read from the save and the content. */
export function HomerLock({ homer }: { homer: WorldHomer }) {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const world = homer.worldId ? worldById(data, homer.worldId) : undefined
  const regionName = (id: string) => data.regions.find((r) => r.id === id)?.name ?? id
  return (
    <HomerLockView
      name={monName(homer.inst, data)}
      level={homer.inst.level}
      best={regionBestLevel(save, data, homer.region)}
      region={regionName(homer.region)}
      world={world ? worldName(world, data) : null}
      from={homer.from ? regionName(homer.from) : null}
      tradedBy={homer.tradedBy || null}
    />
  )
}
