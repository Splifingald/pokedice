import { progressOf, scaledLevelSpan, teamAverageLevel, type Area } from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { PixelIcon } from '@/components/icons'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { areaSpecies } from './areas'

/** An area's level range: the team-scaled span where the area scales, its own range otherwise. */
export function useLevelSpan(area: Area) {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  return area.scalesToTeam && save
    ? scaledLevelSpan(area, teamAverageLevel(save), data)
    : { min: area.minLevel, max: area.maxLevel }
}

export const levelText = (s: { min: number; max: number }) =>
  s.min === s.max ? t('ui.area.levelOne', { n: s.min }) : t('ui.map.levelRange', { min: s.min, max: s.max })

/**
 * The plate on top of the scene: the area's name and levels, its rounds (done, current, to come) and the species caught
 * here. It opens the area's details.
 */
export function AreaPlate({ area, onOpen }: { area: Area; onOpen: () => void }) {
  useT()
  const save = useGame((s) => s.save)!
  const p = progressOf(save, area.id)
  const span = useLevelSpan(area)
  const need = area.roundsToClear
  const done = p.cleared && need != null ? need : Math.min(p.roundsDone ?? 0, need ?? 0)
  const species = areaSpecies(area)
  const caught = species.filter((d) => save.pokedex.includes(d)).length
  const levels = levelText(span)
  const what = species.length
    ? t('ui.map.speciesCaught', { caught, total: species.length })
    : area.gyms.length > 1
      ? t('ui.home.league')
      : t('ui.home.trainersOnly')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={t('ui.home.plateLabel', {
        area: area.name,
        levels,
        rounds: need != null ? t('ui.home.roundsDone', { done, total: need }) : t('ui.home.secretArea'),
        what,
      })}
      className="pixel-plate absolute left-2 right-2 top-2 z-[460] grid gap-[3px] px-2.5 pb-[9px] pt-1.5 text-left active:translate-y-px"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[24px] leading-none">{area.name}</span>
        <span className="whitespace-nowrap font-pixel-sm text-[16px] leading-none text-muted">{levels}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex flex-1 gap-[3px]" aria-hidden>
          {need != null &&
            Array.from({ length: Math.min(need, 12) }, (_, i) => (
              <i
                key={i}
                className={cx(
                  'h-2 max-w-[34px] flex-1',
                  i < done
                    ? 'bg-gold shadow-ring'
                    : i === done
                      ? 'bg-[#fff2cc] shadow-ring'
                      : 'bg-line shadow-ring-line',
                )}
              />
            ))}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap font-pixel-sm text-[16px] leading-none">
          {species.length > 0 && <PixelIcon name="ball" size={12} />}
          {species.length
            ? `${caught}/${species.length}`
            : area.gyms.length > 1
              ? t('ui.home.league')
              : t('ui.home.trainersOnly')}
        </span>
      </span>
    </button>
  )
}
