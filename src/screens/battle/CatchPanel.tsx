// The catch, in the battle scene: the worn-out foe stays on its platform while the panel offers the balls, each with
// its chance (catchChance), how many you have, and "not needed" once a weaker one already makes it certain. One throw
// plays the catch timeline on the stage (BattleView); the die and the result show here as it lands.
import { useState } from 'react'
import { ballBonus, catchChance, catchValueOf } from '@/engine'
import { Die } from '@/components/Die'
import { ItemSprite } from '@/components/ItemSprite'
import { OakTip, useOneTimeTip } from '@/components/OakTip'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame, type RunState } from '@/store/game'
import { finishCatch } from '@/store/run'
import { cx } from '@/theme/util'

// Professor Oak's one-time tip on the first catch (per device).
const CATCH_TIP_KEY = 'pokedice.tip.catch'

type Catch = NonNullable<RunState['catch']>

/** What the message box says during the catch. */
export function catchMessage(c: Catch, name: string, thrown: { revealed: boolean }): string {
  const r = c.result
  if (!r)
    return tr('ui.catch.wornOut', {
      who: tr(c.kind === 'boss' ? 'ui.catch.theLegendary' : 'ui.catch.theWild'),
      name,
    })
  if (thrown.revealed)
    return r.caught
      ? tr('ui.catch.caught', { name })
      : tr('ui.catch.missed', { need: Math.max(1, r.need - r.bonus) })
  // Nothing about the result until the ball has finished its wobbles: the die would give it away.
  const data = useGame.getState().data
  return tr('ui.catch.throwing', { ball: data.items[r.ballKey ?? 'poke-ball']?.name ?? tr('ui.catch.aBall') })
}

/** The ball picker, the catch math and the throw; after it, the die and CONTINUE. */
export function CatchPanel({
  c,
  onThrow,
  revealed,
}: {
  c: Catch
  onThrow: (ballKey: string | null) => void
  /** The result is out. */
  revealed: boolean
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const [ball, setBall] = useState<string | null>(null)
  const [tip, closeTip] = useOneTimeTip(CATCH_TIP_KEY)
  const result = c.result
  const value = catchValueOf(data, c.dex)
  const balls = Object.entries(inventory ?? {})
    .map(([k, n]) => ({ item: data.items[k], n }))
    .filter((b) => b.n > 0 && b.item?.effect.kind === 'ball')
    .sort((a, b) => ballBonus(a.item) - ballBonus(b.item))
  const options = [
    { key: null as string | null, label: t('ui.catch.noBall'), bonus: 0, n: null as number | null },
    ...balls.map((b) => ({
      key: b.item!.key as string | null,
      label: b.item!.name,
      bonus: ballBonus(b.item),
      n: b.n as number | null,
    })),
  ]
  const chosen = options.find((o) => o.key === ball) ?? options[0]!
  const pct = (bonus: number) => Math.round(catchChance(value, bonus) * 100)
  // A ball adds nothing once a weaker option (or no ball) is already certain.
  const sure = catchChance(value, 0) >= 1
  const notNeeded = (o: (typeof options)[number]) =>
    o.key != null && options.some((w) => w.bonus < o.bonus && catchChance(value, w.bonus) >= 1)

  if (result) {
    // A throw that couldn't miss has no die: only the ball is thrown.
    const certain = catchChance(value, result.bonus) >= 1
    const total = result.die + result.bonus
    return (
      <>
        <div className="flex min-h-[64px] items-center justify-center gap-2.5 font-pixel text-[24px] leading-none text-ink">
          {/* The die shows with the result, never before it: it would spoil the wobbles. */}
          {revealed && !certain && (
            <>
              <Die
                type="base"
                face={{ kind: 'number', value: result.die }}
                size={54}
                rollKey="catch-throw"
                label={t('ui.catch.die', { value: result.die })}
              />
              <span aria-hidden>
                +{result.bonus} = {total} {total >= result.need ? '≥' : '<'} {result.need}
              </span>
            </>
          )}
        </div>
        <div className="min-h-[56px]">
          {revealed && (
            <PixelButton variant="primary" size="lg" className="w-full" onClick={finishCatch}>
              {t('ui.common.continue')}
            </PixelButton>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {!sure && (
        <div
          role="radiogroup"
          aria-label={t('ui.catch.ballLegend')}
          className="grid grid-cols-[repeat(auto-fit,minmax(60px,1fr))] gap-1.5"
        >
          {options.map((o) => {
            const item = o.key ? data.items[o.key] : null
            const useless = notNeeded(o)
            const on = chosen.key === o.key
            return (
              <button
                key={o.key ?? 'none'}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={t('ui.catch.ballLabel', {
                  label: o.label,
                  left: o.n != null ? t('ui.catch.ballLeft', { n: o.n }) : '',
                  pct: pct(o.bonus),
                  useless: useless ? t('ui.catch.notNeededSuffix') : '',
                })}
                title={useless ? t('ui.catch.notNeededTitle', { label: o.label }) : o.label}
                onClick={() => setBall(o.key)}
                className={cx(
                  'relative grid min-h-[72px] content-start justify-items-center gap-0.5 px-0.5 pb-1.5 pt-1.5 text-ink',
                  on
                    ? 'bg-gold-pale shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_4px_#f07a2a]'
                    : 'bg-paper shadow-card',
                  useless && !on && 'opacity-60',
                )}
              >
                <span className="grid h-[26px] w-[26px] place-items-center">
                  {item ? <ItemSprite item={item} size={26} /> : <PixelIcon name="dice" size={20} />}
                </span>
                <b className="font-pixel text-[20px] font-normal leading-none tabular-nums">
                  {pct(o.bonus)}%
                </b>
                <small className="font-pixel-sm text-[14px] leading-none text-muted">
                  {useless ? t('ui.catch.notNeeded') : o.n != null ? `×${o.n}` : t('ui.catch.noBall')}
                </small>
              </button>
            )
          })}
        </div>
      )}
      <p
        className="m-0 min-h-[30px] text-center font-pixel-sm text-[18px] leading-tight text-ink"
        aria-live="polite"
      >
        {sure ? t('ui.catch.noBallNeeded') : t('ui.battle.catchMath', { bonus: chosen.bonus, need: value })}
      </p>
      {tip && <OakTip onClose={closeTip}>{t('ui.catch.tip')}</OakTip>}
      {c.target.mode === 'replace' && (
        <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.catch.replaces', {
            level: c.target.level,
            name: data.species[c.dex]?.name ?? t('ui.common.unknown'),
          })}
        </p>
      )}
      <PixelButton
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => onThrow(sure ? null : chosen.key)}
      >
        {sure ? t('ui.catch.catch') : t('ui.catch.roll')}
      </PixelButton>
    </>
  )
}
