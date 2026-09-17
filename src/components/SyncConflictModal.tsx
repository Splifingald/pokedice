import { badgeCase, teamOf, type SaveData } from '@/engine'
import { compareProgress } from '@/save/cloud'
import { useGame } from '@/store/game'
import { resolveSyncConflict } from '@/store/sync'
import { cx } from '@/theme/util'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { SpriteImg } from './SpriteImg'

/** One line per fact that tells two saves apart. */
export function SaveFacts({ save }: { save: SaveData }) {
  const data = useGame((s) => s.data)
  const cleared = Object.values(save.areaProgress).filter((p) => p.cleared).length
  const badges = badgeCase(save, data).filter((b) => b.earned).length
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-lg leading-tight">
      <dt className="text-muted">Pokédex</dt>
      <dd>
        {new Set(save.pokedex).size}/{data.speciesList.length}
      </dd>
      <dt className="text-muted">Badges</dt>
      <dd>{badges}</dd>
      <dt className="text-muted">Areas cleared</dt>
      <dd>{cleared}</dd>
      <dt className="text-muted">Last played</dt>
      <dd>{new Date(save.updatedAt).toLocaleString()}</dd>
    </dl>
  )
}

function SaveCard({ label, save, more, onKeep }: { label: string; save: SaveData; more: boolean; onKeep: () => void }) {
  return (
    <section className={cx('pixel-panel flex flex-col gap-2 p-3', more && 'outline outline-[3px] outline-offset-2 outline-gold')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-2xl leading-none">{label}</h3>
        {more && <span className="border-2 border-ink bg-gold px-1 text-base leading-tight text-ink">More progress</span>}
      </div>
      <div className="flex gap-1" aria-hidden>
        {teamOf(save).map((p) => (
          <span key={p.id} className="flex flex-col items-center text-base leading-none">
            <SpriteImg dex={p.dex} size={48} />
            Lv.{p.level}
          </span>
        ))}
      </div>
      <SaveFacts save={save} />
      <PixelButton variant={more ? 'primary' : 'secondary'} onClick={onKeep}>
        KEEP THIS ONE
      </PixelButton>
    </section>
  )
}

/** "Two saves found": the first cloud sync would otherwise have replaced a save with more progress. */
export function SyncConflictModal() {
  const conflict = useGame((s) => s.syncConflict)
  const localMore = conflict ? compareProgress(conflict.local, conflict.cloud) >= 0 : false
  return (
    <Modal open={!!conflict} dismissable={false} title="Two saves found" className="max-w-2xl">
      {conflict && (
        <div className="flex flex-col gap-3">
          <p className="copy">
            This device and your cloud backup don't match, and the most recently played one has less progress. Pick the
            save to keep — the other stays as a backup on this device (Settings → Save backups).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SaveCard label="This device" save={conflict.local} more={localMore} onKeep={() => void resolveSyncConflict('local')} />
            <SaveCard label="Cloud backup" save={conflict.cloud} more={!localMore} onKeep={() => void resolveSyncConflict('cloud')} />
          </div>
        </div>
      )}
    </Modal>
  )
}
