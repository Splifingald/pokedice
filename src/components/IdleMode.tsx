// Idle mode and the play styles (docs/36, docs/15 §20): the three styles as cards to pick from (a new game's question,
// Settings), the Settings panel and its INFO. No rules pop-up ever opens by itself: the user's exception to §20.
import { useRef, useState, type KeyboardEvent } from 'react'
import { idleModeOn, playStyleOf, PLAY_STYLES, type PlayStyle } from '@/engine'
import { useT } from '@/i18n/react'
import { choosePlayStyle } from '@/store/autopilot'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon, type IconName } from './icons'
import { Panel } from './Panel'
import { PixelButton } from './PixelButton'
import { InfoButton, RulesModal, type RuleRow } from './RulesModal'

const STYLE_ICON: Record<PlayStyle, IconName> = { classic: 'sword', explored: 'map', idle: 'dice' }

/** Each style's name and its line, from the strings. */
export function useStyleText() {
  const { t } = useT()
  return (s: PlayStyle) => ({ name: t(`ui.playStyle.${s}`), hint: t(`ui.playStyle.${s}Hint`) })
}

/**
 * The styles as a radio group of cards (an icon, the name, its line; the picked one ringed in gold with a check, so it
 * is never colour alone). Arrow keys move the pick.
 */
export function PlayStylePicker({
  value,
  onChange,
  styles = [...PLAY_STYLES],
  label,
}: {
  value: PlayStyle | null
  onChange: (s: PlayStyle) => void
  styles?: PlayStyle[]
  label: string
}) {
  const text = useStyleText()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + styles.length) % styles.length
    onChange(styles[next]!)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      {styles.map((s, i) => {
        const on = value === s
        const { name, hint } = text(s)
        return (
          <button
            key={s}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (value == null && i === 0) ? 0 : -1}
            onClick={() => onChange(s)}
            onKeyDown={(e) => move(e, i)}
            className={cx(
              'flex min-h-[64px] w-full items-center gap-3 px-3 py-2 text-left text-ink',
              on ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
            )}
          >
            <span
              className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line"
              aria-hidden
            >
              <PixelIcon name={STYLE_ICON[s]} size={24} />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
              <b className="text-[22px] font-normal leading-none">{name}</b>
              <small className="font-pixel-sm text-[15px] text-muted">{hint}</small>
            </span>
            {on && <PixelIcon name="check" size={20} className="shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

/** A new game's first question (docs/36): how to play, before Prof. Oak's words. */
export function PlayStylePrompt({
  onPick,
  initial = null,
}: {
  onPick: (s: PlayStyle) => void
  initial?: PlayStyle | null
}) {
  const { t } = useT()
  const [pick, setPick] = useState<PlayStyle | null>(initial)
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-center text-[36px] leading-none">{t('ui.playStyle.prompt')}</h1>
      <PlayStylePicker value={pick} onChange={setPick} label={t('ui.playStyle.title')} />
      <p className="copy m-0 text-center text-muted">{t('ui.playStyle.promptHint')}</p>
      <PixelButton
        variant="primary"
        size="lg"
        className="self-center"
        disabled={!pick}
        onClick={() => pick && onPick(pick)}
      >
        {t('ui.newGame.next')}
      </PixelButton>
    </div>
  )
}

/** The rules' banner, drawn in code: the trail, the dice that play it, the ball it throws for you. */
function IdleBanner() {
  return (
    <div className="light-scope absolute inset-0 flex items-center justify-center gap-6 bg-night" aria-hidden>
      <PixelIcon name="map" size={48} />
      <PixelIcon name="dice" size={64} />
      <PixelIcon name="ball" size={48} />
    </div>
  )
}

export function useIdleRules(): RuleRow[] {
  const { t } = useT()
  return [
    { icon: 'dice', title: t('ui.rules.idle.styles.title'), text: t('ui.rules.idle.styles.text') },
    { icon: 'ball', title: t('ui.rules.idle.catch.title'), text: t('ui.rules.idle.catch.text') },
    { icon: 'map', title: t('ui.rules.idle.travel.title'), text: t('ui.rules.idle.travel.text') },
    { icon: 'potion', title: t('ui.rules.idle.items.title'), text: t('ui.rules.idle.items.text') },
  ]
}

/** Its rules, from INFO in Settings only (OK): it never pops up by itself (the user's ask of 2026-10-23, docs/36). */
export function IdleRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = useIdleRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.playStyle.idle')}
      picture={<IdleBanner />}
      icon="dice"
      rules={rules}
    />
  )
}

/** Settings → Play style: the three cards, switched any time, and INFO. Nowhere while the switch is off. */
export function PlayStylePanel() {
  const { t } = useT()
  const on = useGame((s) => idleModeOn(s.data))
  const style = useGame((s) => playStyleOf(s.settings))
  const [rules, setRules] = useState(false)
  if (!on) return null
  return (
    <Panel title={t('ui.playStyle.title')}>
      <PlayStylePicker
        value={style}
        onChange={(s) => s !== style && choosePlayStyle(s)}
        label={t('ui.playStyle.title')}
      />
      <p className="copy mb-0 mt-2 text-muted">{t('ui.playStyle.settingsHint')}</p>
      <InfoButton className="mt-3" name={t('ui.playStyle.idle')} onClick={() => setRules(true)} />
      <IdleRulesModal open={rules} onClose={() => setRules(false)} />
    </Panel>
  )
}
