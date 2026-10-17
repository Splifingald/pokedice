import { useState } from 'react'
import { instanceMaxHp, instanceStats, teamOf, type PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { SheetModal } from './SheetModal'
import { MiniSprite } from './SpriteImg'
import { TypeBadge } from './TypeBadge'
import { attackEdge } from './TypeMatchups'

/**
 * "Before each fight the player picks which one to send." The team side by side, each with its essentials (mini, name,
 * level, types, HP) and two buttons: SWITCH picks it, INFO opens its details. With the type hint on and the foe known,
 * a thumb marks the ones whose dice hit it super effectively (up) or not very effectively (down).
 */
export function LeadPicker({
  value,
  onChange,
  foe,
  pair,
}: {
  value: string | null
  onChange: (uid: string) => void
  /** The types of the Pokémon about to be faced, when the player can see it. */
  foe?: readonly PokeType[]
  /** A double battle (docs/33): two go out. SWITCH picks one, the earlier pick making way when two are picked. */
  pair?: { value: string[]; onChange: (uids: string[]) => void }
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const hints = useGame((s) => !!s.settings.typeHints)
  const [info, setInfo] = useState<string | null>(null)
  if (!save) return null
  const team = teamOf(save)
  const current = value && team.some((p) => p.id === value && p.currentHp > 0) ? value : team.find((p) => p.currentHp > 0)?.id
  const picked = pair ? pickedPair(pair.value) : []
  const pick = (id: string) => {
    if (!pair) return onChange(id)
    if (picked.includes(id)) return
    pair.onChange([...picked, id].slice(-2))
  }
  return (
    <div>
      <div className="mb-1 text-lg text-muted">{t(pair ? 'ui.lead.sendOutTwo' : 'ui.lead.sendOut')}</div>
      <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {team.map((p) => {
          const species = data.species[p.dex]
          if (!species) return null
          const fainted = p.currentHp <= 0
          const selected = pair ? picked.includes(p.id) : p.id === current
          const edge = hints && foe?.length ? attackEdge(data, instanceStats(p, data).dice, foe) : 1
          return (
            <li
              key={p.id}
              className={cx(
                'pixel-panel flex min-w-0 flex-col gap-1 p-1.5',
                selected && 'outline outline-[3px] outline-offset-2 outline-gold',
                fainted && 'hatched',
              )}
            >
              <div className="flex min-w-0 items-center gap-0.5">
                <MiniSprite dex={p.dex} size={32} className={cx('-my-1 -ml-1', fainted && 'grayscale')} />
                <span className="truncate text-lg leading-none">{species.name}</span>
                {p.shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />}
                {edge !== 1 && (
                  <PixelIcon
                    name={edge > 1 ? 'thumbUp' : 'thumbDown'}
                    size={16}
                    title={t(edge > 1 ? 'ui.lead.strong' : 'ui.lead.weak')}
                    className="ml-auto shrink-0"
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-base leading-none">{t('ui.common.level.short', { n: p.level })}</span>
                <TypeBadge type={species.type1} size="sm" />
                {species.type2 && <TypeBadge type={species.type2} size="sm" />}
              </div>
              <div className={cx('font-mono text-sm leading-none', fainted && 'text-danger')}>
                {fainted ? t('ui.mon.fainted') : t('ui.lead.hp', { hp: p.currentHp, max: instanceMaxHp(p, data) })}
              </div>
              <div className="mt-auto flex flex-col gap-1 pt-0.5">
                <PixelButton
                  size="sm"
                  variant={selected ? 'primary' : 'secondary'}
                  className="w-full px-1"
                  disabled={fainted}
                  aria-pressed={selected}
                  aria-label={t('ui.lead.sendOutName', { name: species.name })}
                  onClick={() => pick(p.id)}
                >
                  {t('ui.lead.switch')}
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="ghost"
                  className="w-full px-1"
                  aria-label={t('ui.newGame.monInfo', { name: species.name })}
                  onClick={() => setInfo(p.id)}
                >
                  {t('ui.lead.info')}
                </PixelButton>
              </div>
            </li>
          )
        })}
      </ul>
      <SheetModal view={info ? { kind: 'inst', id: info } : null} onClose={() => setInfo(null)} />
    </div>
  )
}

/** A double battle's two leads: those picked still able, filled up with the first able ones, in team order. */
export function pickedPair(value: readonly string[]): string[] {
  const save = useGame.getState().save
  if (!save) return []
  const able = teamOf(save).filter((p) => p.currentHp > 0).map((p) => p.id)
  const kept = value.filter((id) => able.includes(id))
  return [...kept, ...able.filter((id) => !kept.includes(id))].slice(0, 2)
}

export function defaultLead(): string | undefined {
  const save = useGame.getState().save
  return save ? teamOf(save).find((p) => p.currentHp > 0)?.id : undefined
}
