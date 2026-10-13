import { monName, regionBestLevel, worldById, type WorldHomer } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { worldName } from '@/store/worlds'
import { PixelIcon } from './icons'

/**
 * A small world's Pokémon waiting to unlock in its region (docs/26 §1), on its sheet: the level it waits for, the world
 * it came home from (when the admin still lists it), and the region's best now, with what it can't do until then.
 */
export function HomerLockView({
  name,
  level,
  best,
  region,
  world,
}: {
  name: string
  level: number
  best: number
  region: string
  world: string | null
}) {
  const { t } = useT()
  return (
    <section className="flex flex-col gap-1.5 bg-well p-2.5 shadow-ring-line" aria-labelledby="homer-lock">
      <h3 id="homer-lock" className="flex items-center gap-1.5 text-[20px] font-normal leading-none">
        <PixelIcon name="lock" size={16} className="shrink-0" />
        {t('ui.sheet.lockTitle', { n: level })}
      </h3>
      {world && (
        <p className="font-pixel-sm text-[15px] leading-tight text-muted">
          {t('ui.sheet.lockFrom', { world })}
        </p>
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
  const world = worldById(data, homer.worldId)
  return (
    <HomerLockView
      name={monName(homer.inst, data)}
      level={homer.inst.level}
      best={regionBestLevel(save, data, homer.region)}
      region={data.regions.find((r) => r.id === homer.region)?.name ?? homer.region}
      world={world ? worldName(world, data) : null}
    />
  )
}
