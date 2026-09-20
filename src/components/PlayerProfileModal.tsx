import { useState } from 'react'
import { regionCases } from '@/engine'
import { useT } from '@/i18n/react'
import { CharacterSelect } from '@/screens/NewGame'
import { mutateSave, useGame } from '@/store/game'
import { BadgeIcon } from './BadgeIcon'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { playerOf, TrainerSprite } from './TrainerArt'

/** One region: its name, a crown once the endgame lap is done, and the badge case under it. */
function RegionRow({ region }: { region: ReturnType<typeof regionCases>[number] }) {
  const { t } = useT()
  return (
    <li className="border-2 border-ink bg-panel p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-2xl leading-none">{t(region.nameKey)}</span>
        {region.endgameCleared && (
          <span className="flex items-center gap-1" title={t('ui.profile.crownHint')}>
            <PixelIcon name="crown" size={18} />
            <span className="sr-only">{t('ui.profile.crownHint')}</span>
          </span>
        )}
        <span className="ml-auto font-pixel-sm text-base leading-none text-muted">
          {t('ui.map.badges', { earned: region.earned, total: region.badges.length })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label={t('ui.map.badgesLabel', { earned: region.earned, total: region.badges.length })}>
        {region.badges.map((b) => (
          <BadgeIcon key={b.trainerId} badge={b.badge} earned={b.earned} size={26} />
        ))}
      </div>
    </li>
  )
}

/** Name, trainer sprite and the badge case of every region the player has reached. */
export function PlayerProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [editing, setEditing] = useState(false)
  const me = playerOf(save)
  const regions = save ? regionCases(save, data).filter((r) => r.unlocked) : []

  return (
    <Modal
      open={open}
      onClose={() => {
        setEditing(false)
        onClose()
      }}
      title={t('ui.profile.title')}
    >
      {editing ? (
        <CharacterSelect
          initial={save?.player}
          submitLabel={t('ui.settings.save')}
          compact
          onDone={(player) => {
            mutateSave((s) => ({ ...s, player }))
            setEditing(false)
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <TrainerSprite src={`/characters/${me.character}.png`} size={64} />
            <span className="min-w-0 flex-1 truncate text-3xl">{me.name || t('ui.settings.noName')}</span>
            <PixelButton onClick={() => setEditing(true)}>{t('ui.settings.change')}</PixelButton>
          </div>

          {regions.length > 0 && (
            <div>
              <h3 className="mb-2 text-2xl leading-none">{t('ui.profile.badgeCase')}</h3>
              <ul className="flex flex-col gap-2">
                {regions.map((r) => (
                  <RegionRow key={r.id} region={r} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
