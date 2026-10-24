// The Raids page's list of progression raids (docs/24), under the day's raid: one region at a time (the regions started,
// the one being played first), each raid with its area, its state and the team left on it. A row opens the raid's page,
// where a team can be left on it even before its area is completed.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  enabledRegions,
  isWorldRegion,
  megaRaidLock,
  progressRaids,
  progressRaidState,
  progressRaidTeam,
  regionOf,
  regionStarted,
  type ProgressRaidState,
} from '@/engine'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { FilterChips } from '@/components/Segmented'
import { MiniSprite } from '@/components/SpriteImg'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { progressRaidPath } from './progressRaids'

export function ProgressRaidList() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const live = save ? regionOf(save) : 'kanto'
  const [region, setRegion] = useState<string>(live)
  if (!save) return null
  const regions = enabledRegions(data)
    // A small world's raids are fought from inside it, not listed here.
    .filter(
      (r) => !isWorldRegion(data, r.id) && regionStarted(save, r.id) && progressRaids(data, r.id).length > 0,
    )
    .sort((a, b) => (a.id === live ? -1 : b.id === live ? 1 : 0))
  if (!regions.length) return null
  const shown = regions.some((r) => r.id === region) ? region : regions[0]!.id
  const raids = progressRaids(data, shown).map((r) => ({ raid: r, state: progressRaidState(save, data, r) }))
  const count = (s: ProgressRaidState) => raids.filter((r) => r.state === s).length
  return (
    <section aria-labelledby="raid-progress-h" className="grid gap-1.5">
      <div className="flex items-baseline gap-2">
        <h2 id="raid-progress-h" className="m-0 text-[22px] font-normal leading-none">
          {t('ui.raid.progress.listTitle')}
        </h2>
        <small className="font-pixel-sm text-[15px] text-muted">
          {t('ui.raid.progress.listCount', { open: count('open'), done: count('done') })}
        </small>
      </div>
      <p className="m-0 font-pixel-sm text-[14px] leading-tight text-muted">
        {t('ui.raid.progress.listHint')}
      </p>
      {regions.length > 1 && (
        <FilterChips
          label={t('ui.raid.progress.regions')}
          value={shown}
          onChange={setRegion}
          options={regions.map((r) => ({ id: r.id, label: r.name, count: progressRaids(data, r.id).length }))}
        />
      )}
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {raids.map(({ raid, state }) => {
          const area = data.areas.find((a) => a.id === raid.areaId)
          // A Mega raid (docs/39): known once its Pokémon is; locked, it says what opens it.
          const known = state !== 'locked' || save.pokedex.includes(raid.mega?.base ?? raid.dex)
          const megaLock = raid.mega && state === 'locked' ? megaRaidLock(save, data, raid) : null
          const name = known ? (data.species[raid.dex]?.name ?? '???') : t('ui.common.unknown')
          // The team left on it, as it stands (a Pokémon released since drops out of it).
          const left = save.events?.raidTeams?.[raid.key]?.length ? progressRaidTeam(save, data, raid) : []
          return (
            <li key={raid.key}>
              <button
                type="button"
                onClick={() => navigate(progressRaidPath(raid), { state: { from: '/events/raid' } })}
                className={cx(
                  'flex min-h-[60px] w-full items-center gap-2 py-1 pl-1 pr-2.5 text-left',
                  state === 'locked' ? 'bg-well shadow-ring-line' : 'bg-paper shadow-card',
                )}
              >
                <MiniSprite
                  dex={raid.dex}
                  size={40}
                  silhouette={!known}
                  className={cx('-my-1', state === 'locked' && 'opacity-80')}
                />
                <span className="grid min-w-0 flex-1 leading-[1.05]">
                  <b className="truncate text-[19px] font-normal">{name}</b>
                  <small className="truncate font-pixel-sm text-[14px] text-muted">
                    {megaLock
                      ? t(`ui.raid.mega.lock.${megaLock}.title`, { name: data.species[raid.mega!.base]?.name ?? '' })
                      : state === 'locked'
                        ? t('ui.raid.progress.clearArea', { area: area?.name ?? '' })
                        : (area?.name ?? '')}
                  </small>
                  <small
                    className={cx(
                      'truncate font-pixel-sm text-[14px]',
                      left.length ? 'text-good' : 'text-muted',
                    )}
                  >
                    {left.length
                      ? t('ui.raid.progress.teamLeft', {
                          names: joinList(left.map((m) => data.species[m.dex]?.name ?? '')),
                        })
                      : t('ui.raid.progress.noTeamLeft')}
                  </small>
                </span>
                {state === 'done' ? (
                  <Chip tone="done">{t('ui.raid.progress.stDone')}</Chip>
                ) : state === 'open' ? (
                  <Chip tone="blue">{t('ui.raid.progress.stOpen')}</Chip>
                ) : (
                  <Chip tone="lock">
                    <PixelIcon name="lock" size={12} />
                    {t('ui.dex.locked')}
                  </Chip>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
