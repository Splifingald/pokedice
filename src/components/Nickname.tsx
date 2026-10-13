// Nicknames: a Pokémon's name on its sheet is a button that opens this dialog. The nickname is kept on the Pokémon,
// so it goes with it in a trade, and whoever has it can change it (engine/nickname.ts).
import { useEffect, useId, useRef, useState } from 'react'
import { getInstance, monName, NICKNAME_MAX, tradeClosed, worldHomers, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { nicknamePokemon } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

/** The name at the top of a Pokémon's sheet, with a pencil: a tap gives it a nickname. */
export function NicknameButton({ name, onClick }: { name: string; onClick: () => void }) {
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      // A description, not part of the name: the sheet's heading (and so the dialog's name) stays the Pokémon's name.
      title={t('ui.nickname.tap')}
      className="inline-flex min-h-[44px] max-w-full items-center gap-2 text-left hover:bg-paper md:min-h-[36px]"
    >
      <span className="min-w-0 truncate">{name}</span>
      <PixelIcon name="pencil" size={20} className="shrink-0" />
    </button>
  )
}

/** Give one of your Pokémon a nickname, change it, or (left empty) take it away. Open while `inst` is set. */
export function NicknameModal({ inst, onClose }: { inst: PokemonInstance | null; onClose: () => void }) {
  const { t } = useT()
  // The last one stays while the dialog fades out.
  const last = useRef(inst)
  if (inst) last.current = inst
  const shown = inst ?? last.current
  return (
    <Modal open={!!inst} onClose={onClose} title={t('ui.nickname.title')}>
      {shown && <NicknameForm key={shown.id} inst={shown} onDone={onClose} />}
    </Modal>
  )
}

function NicknameForm({ inst, onDone }: { inst: PokemonInstance; onDone: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const [value, setValue] = useState(inst.nickname ?? '')
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const hintId = useId()
  const species = data.species[inst.dex]?.name ?? t('ui.common.pokemon')
  // Only where trades exist for this save: no word of them in an Extreme save, or while the switch is off.
  const closed = save ? tradeClosed(save, data) : 'off'
  const tradeNote = closed !== 'off' && closed !== 'extreme'

  // After the dialog has taken focus: straight into the field.
  useEffect(() => {
    const raf = requestAnimationFrame(() => input.current?.select())
    return () => cancelAnimationFrame(raf)
  }, [])

  const submit = () => {
    if (nicknamePokemon(inst.id, value)) {
      const now = useGame.getState().save
      // A small world's Pokémon waiting to unlock (docs/26 §1) is named where it waits.
      const next = now ? (getInstance(now, inst.id) ?? worldHomers(now).find((h) => h.inst.id === inst.id)?.inst) : undefined
      pushToast(
        next?.nickname
          ? t('ui.nickname.named', { species, name: next.nickname })
          : t('ui.nickname.cleared', { name: monName(inst, data), species }),
        'good',
      )
    }
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[20px] leading-none">
          {t('ui.nickname.label', { name: species })}
        </label>
        <input
          id={id}
          ref={input}
          value={value}
          // Counted in characters, not UTF-16 units: an accent or a CJK name counts once.
          onChange={(e) => setValue([...e.target.value].slice(0, NICKNAME_MAX).join(''))}
          placeholder={species}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          aria-describedby={hintId}
          className="h-12 w-full bg-paper px-3 text-[26px] shadow-field placeholder:text-faint"
        />
        <small
          id={hintId}
          className="flex items-start gap-2 font-pixel-sm text-[15px] leading-tight text-muted"
        >
          <span className="min-w-0 flex-1">
            {t('ui.nickname.hint', { name: species })}
            {tradeNote && ` ${t('ui.nickname.trades')}`}
          </span>
          <span className="shrink-0 tabular-nums">
            {[...value].length}/{NICKNAME_MAX}
          </span>
        </small>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <PixelButton onClick={onDone}>{t('ui.common.cancel')}</PixelButton>
        <PixelButton type="submit" variant="primary">
          {t('ui.settings.save')}
        </PixelButton>
      </div>
    </form>
  )
}
