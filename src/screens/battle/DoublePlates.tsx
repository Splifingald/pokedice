// A double battle's plates and target picker (docs/33). Four plates would hide the stage, so they lose the names: each
// is the Pokémon's mini icon, its level, HP and statuses, the foes' at the top left and yours at the bottom right, the
// one in front (whose turn it is, and its target) ringed in gold.
import { type Battler } from '@/engine'
import { Chip } from '@/components/Chip'
import { HpBar } from '@/components/HpBar'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { StatusIcons } from '@/components/StatusIcons'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'

function FormTag({ b }: { b: Battler }) {
  const { t } = useT()
  if (b.gmax) return <Chip tone="red">{t('ui.battle.gmax')}</Chip>
  if (b.mega) return <Chip tone="gold">{t('ui.battle.mega')}</Chip>
  return null
}

/** One Pokémon's small plate: icon, level, HP (numbers on yours only), statuses. */
export function MiniPlate({
  b,
  hp,
  foe,
  front,
  fainted,
}: {
  b: Battler
  hp: number
  foe: boolean
  /** In front: the one whose turn it is, or the one it attacks. */
  front: boolean
  fainted?: boolean
}) {
  const { t } = useT()
  const level = t('ui.common.level.short', { n: b.level })
  return (
    <div
      role="group"
      aria-label={t(foe ? 'ui.battle.foePlate' : 'ui.battle.ownPlate', { name: b.name, level })}
      aria-current={front || undefined}
      className={cx(
        'pixel-plate flex min-w-0 items-center gap-1 py-0.5 pl-0.5 pr-1.5',
        front && 'outline outline-[3px] outline-offset-0 outline-gold',
        fainted && 'opacity-50',
      )}
    >
      <MiniSprite dex={b.dex} size={28} className={cx('-my-1 shrink-0', fainted && 'grayscale')} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1">
          <span className="font-pixel-sm text-[14px] leading-none">{level}</span>
          {b.shiny && <PixelIcon name="star" size={10} title={t('ui.mon.shiny')} className="shrink-0" />}
          <StatusIcons status={b.status} />
          <span className="ml-auto shrink-0">
            <FormTag b={b} />
          </span>
        </span>
        <HpBar
          hp={hp}
          max={b.maxHp}
          showNumbers={!foe}
          approximate={foe}
          compact
          height={6}
          className="min-w-[56px]"
        />
      </span>
    </div>
  )
}

/** Every Pokémon out, foes at the top left and yours at the bottom right, in field order (they don't jump about). */
export function DoublePlates({
  foes,
  own,
  frontFoe,
  frontOwn,
  hpOf,
  faintedOf,
  party,
}: {
  foes: Battler[]
  own: Battler[]
  frontFoe: string
  frontOwn: string
  hpOf: (b: Battler) => number
  faintedOf: (b: Battler) => boolean
  /** A trainer's team: how many, and how many are K.O. */
  party?: { count: number; index: number } | null
}) {
  const { t } = useT()
  return (
    <>
      <div className="absolute left-1.5 top-1.5 flex w-[46%] flex-col gap-1">
        {foes.map((b) => (
          <MiniPlate key={b.uid} b={b} hp={hpOf(b)} foe front={b.uid === frontFoe} fainted={faintedOf(b)} />
        ))}
        {party && party.count > 2 && (
          <span
            className="flex gap-[3px] self-start bg-paper/80 px-1 py-0.5"
            aria-label={t('ui.battle.partyLeft', { left: party.count - party.index, total: party.count })}
          >
            {Array.from({ length: party.count }, (_, i) => (
              <i
                key={i}
                className={cx('h-2 w-2 shadow-ring-thin', i < party.index ? 'bg-shadow' : 'bg-crimson')}
              />
            ))}
          </span>
        )}
      </div>
      <div className="absolute bottom-1.5 right-1.5 flex w-[46%] flex-col gap-1">
        {own.map((b) => (
          <MiniPlate
            key={b.uid}
            b={b}
            hp={hpOf(b)}
            foe={false}
            front={b.uid === frontOwn}
            fainted={faintedOf(b)}
          />
        ))}
      </div>
    </>
  )
}

/** Your turn in a double battle: which foe to attack (the stage's foe in front is the one picked). */
export function TargetPicker({
  foes,
  target,
  hpOf,
  onPick,
  disabled,
}: {
  foes: Battler[]
  target: string
  hpOf: (b: Battler) => number
  onPick: (b: Battler) => void
  disabled?: boolean
}) {
  const { t } = useT()
  return (
    <div role="radiogroup" aria-label={t('ui.battle.targetLabel')} className="flex items-center gap-2">
      <span className="shrink-0 text-lg leading-none text-muted">{t('ui.battle.target')}</span>
      {foes.map((b) => {
        const on = b.uid === target
        return (
          <button
            key={b.uid}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t('ui.battle.aimAt', { name: b.name })}
            disabled={disabled}
            onClick={() => onPick(b)}
            className={cx(
              'flex min-h-[44px] min-w-0 flex-1 items-center gap-1 bg-paper px-1 shadow-ring disabled:opacity-60',
              on && 'outline outline-[3px] outline-offset-0 outline-gold',
            )}
          >
            {on && <PixelIcon name="sword" size={14} className="shrink-0" />}
            <MiniSprite dex={b.dex} size={32} className="-my-1 shrink-0" />
            <HpBar
              hp={hpOf(b)}
              max={b.maxHp}
              showNumbers={false}
              approximate
              compact
              height={6}
              className="min-w-0 flex-1"
            />
          </button>
        )
      })}
    </div>
  )
}
