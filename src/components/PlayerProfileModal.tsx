import { useState } from 'react'
import { regionCases } from '@/engine'
import type { RegionCase } from '@/engine'
import { useT } from '@/i18n/react'
import { AVATAR_GROUPS, avatarOf, playerAvatarId } from '@/lib/avatars'
import { cx } from '@/theme/util'
import { CharacterSelect } from '@/screens/NewGame'
import { mutateSave, useGame } from '@/store/game'
import { BadgeIcon } from './BadgeIcon'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { playerOf, TrainerSprite } from './TrainerArt'

/** One region: its name, a crown once the endgame lap is done, and the badge case under it. */
function RegionRow({ region }: { region: RegionCase }) {
  const { t } = useT()
  return (
    <li className="border-2 border-ink bg-panel p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-2xl leading-none">{region.name}</span>
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

/** Every look the leaderboard and Versus can show, by group; picking one saves it. */
function LookPicker({ current, onPick, onBack }: { current: string; onPick: (id: string) => void; onBack: () => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-2xl leading-none">{t('ui.profile.lookTitle')}</p>
      <p className="copy text-center text-lg leading-tight text-muted">{t('ui.profile.lookHint')}</p>
      {AVATAR_GROUPS.map(({ group, avatars }) => (
        <section key={group}>
          <h3 className="mb-1.5 text-xl leading-none">{t(group === 'default' ? 'ui.profile.lookDefault' : `region.${group}`)}</h3>
          <div role="radiogroup" aria-label={t(group === 'default' ? 'ui.profile.lookDefault' : `region.${group}`)} className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {avatars.map((a) => {
              const label = t(a.labelKey)
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={current === a.id}
                  aria-label={label}
                  title={label}
                  onClick={() => onPick(a.id)}
                  className={cx('pixel-btn flex items-center justify-center p-0.5', current === a.id ? 'bg-gold' : 'bg-panel')}
                >
                  <TrainerSprite src={a.src} size={56} />
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <PixelButton onClick={onBack}>{t('ui.common.back')}</PixelButton>
    </div>
  )
}

/** Name, trainer sprite, the look other players see, and the badge case of every region the player has reached. */
export function PlayerProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [editing, setEditing] = useState<'character' | 'look' | null>(null)
  const me = playerOf(save)
  const look = playerAvatarId(save?.player)
  const regions = save ? regionCases(save, data) : []

  return (
    <Modal
      open={open}
      onClose={() => {
        setEditing(null)
        onClose()
      }}
      title={t('ui.profile.title')}
    >
      {editing === 'character' ? (
        <CharacterSelect
          initial={save?.player}
          submitLabel={t('ui.settings.save')}
          compact
          onDone={(player) => {
            // Keeps the look: it is chosen on its own.
            mutateSave((s) => ({ ...s, player: { ...s.player, ...player } }))
            setEditing(null)
          }}
        />
      ) : editing === 'look' ? (
        <LookPicker
          current={look}
          onBack={() => setEditing(null)}
          onPick={(avatar) => {
            mutateSave((s) => (s.player ? { ...s, player: { ...s.player, avatar } } : s))
            setEditing(null)
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <TrainerSprite src={`/characters/${me.character}.png`} size={64} />
            <span className="min-w-0 flex-1 truncate text-3xl">{me.name || t('ui.settings.noName')}</span>
            <PixelButton onClick={() => setEditing('character')}>{t('ui.settings.change')}</PixelButton>
          </div>

          <div>
            <h3 className="mb-2 text-2xl leading-none">{t('ui.profile.look')}</h3>
            <div className="flex items-center gap-3 border-2 border-ink bg-panel p-2">
              <TrainerSprite src={avatarOf(look).src} size={64} alt={t(avatarOf(look).labelKey)} />
              <p className="copy min-w-0 flex-1 text-lg leading-tight text-muted">{t('ui.profile.lookHint')}</p>
              <PixelButton onClick={() => setEditing('look')} aria-label={t('ui.profile.lookTitle')}>
                {t('ui.settings.change')}
              </PixelButton>
            </div>
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
