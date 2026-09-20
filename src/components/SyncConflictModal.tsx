import { badgeCase, teamOf, type SaveData } from '@/engine'
import { compareProgress } from '@/save/cloud'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { resolveSyncConflict } from '@/store/sync'
import { cx } from '@/theme/util'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { MiniSprite } from './SpriteImg'

/** One line per fact that tells two saves apart. */
export function SaveFacts({ save }: { save: SaveData }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cleared = Object.values(save.areaProgress).filter((p) => p.cleared).length
  const badges = badgeCase(save, data).filter((b) => b.earned).length
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-lg leading-tight">
      <dt className="text-muted">{t('ui.sync.pokedex')}</dt>
      <dd>
        {new Set(save.pokedex).size}/{data.speciesList.length}
      </dd>
      <dt className="text-muted">{t('ui.sync.badges')}</dt>
      <dd>{badges}</dd>
      <dt className="text-muted">{t('ui.sync.areasCleared')}</dt>
      <dd>{cleared}</dd>
      <dt className="text-muted">{t('ui.sync.lastPlayed')}</dt>
      <dd>{new Date(save.updatedAt).toLocaleString()}</dd>
    </dl>
  )
}

function SaveCard({ label, save, more, onKeep }: { label: string; save: SaveData; more: boolean; onKeep: () => void }) {
  const { t } = useT()
  return (
    <section className={cx('pixel-panel flex flex-col gap-2 p-3', more && 'outline outline-[3px] outline-offset-2 outline-gold')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-2xl leading-none">{label}</h3>
        {more && <span className="border-2 border-ink bg-gold px-1 text-base leading-tight text-ink">{t('ui.sync.moreProgress')}</span>}
      </div>
      <div className="flex gap-1" aria-hidden>
        {teamOf(save).map((p) => (
          <span key={p.id} className="flex flex-col items-center text-base leading-none">
            <MiniSprite dex={p.dex} size={48} />
            {t('ui.common.level.short', { n: p.level })}
          </span>
        ))}
      </div>
      <SaveFacts save={save} />
      <PixelButton variant={more ? 'primary' : 'secondary'} onClick={onKeep}>
        {t('ui.sync.keepThis')}
      </PixelButton>
    </section>
  )
}

/** "Two saves found": the first cloud sync would otherwise have replaced a save with more progress. */
export function SyncConflictModal() {
  const { t } = useT()
  const conflict = useGame((s) => s.syncConflict)
  const localMore = conflict ? compareProgress(conflict.local, conflict.cloud) >= 0 : false
  return (
    <Modal open={!!conflict} dismissable={false} title={t('ui.sync.title')} className="max-w-2xl">
      {conflict && (
        <div className="flex flex-col gap-3">
          <p className="copy">{t('ui.sync.body')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SaveCard
              label={t('ui.sync.thisDevice')}
              save={conflict.local}
              more={localMore}
              onKeep={() => void resolveSyncConflict('local')}
            />
            <SaveCard
              label={t('ui.sync.cloudBackup')}
              save={conflict.cloud}
              more={!localMore}
              onKeep={() => void resolveSyncConflict('cloud')}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
