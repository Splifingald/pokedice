import { regionCases, worldById, type SaveData } from '@/engine'
import { progressTotals } from '@/save/cloud'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { worldName } from '@/store/worlds'

/**
 * One line per fact that tells two saves apart — every one of them counted across all the save's regions, the same
 * way `compareProgress` (the sync) counts, so a backup's figures say why the sync set it aside.
 */
export function SaveFacts({ save }: { save: SaveData }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const totals = progressTotals(save)
  const cases = regionCases(save, data)
  const badges = cases.reduce((n, r) => n + r.earned, 0)
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-lg leading-tight">
      {cases.length > 1 && (
        <>
          <dt className="text-muted">{t('ui.sync.regions')}</dt>
          <dd>{joinList(cases.map((r) => r.name))}</dd>
        </>
      )}
      <dt className="text-muted">{t('ui.sync.pokedex')}</dt>
      <dd>
        {totals.species}/{data.speciesList.length}
      </dd>
      <dt className="text-muted">{t('ui.sync.badges')}</dt>
      <dd>{badges}</dd>
      <dt className="text-muted">{t('ui.sync.areasCleared')}</dt>
      <dd>{totals.cleared}</dd>
      {totals.world && (
        <>
          <dt className="text-muted">{worldName(worldById(data, totals.world.id), data)}</dt>
          <dd>{t('ui.sync.worldFacts', { areas: totals.world.cleared, species: totals.world.species })}</dd>
        </>
      )}
      <dt className="text-muted">{t('ui.sync.lastPlayed')}</dt>
      <dd>{new Date(save.updatedAt).toLocaleString()}</dd>
    </dl>
  )
}
