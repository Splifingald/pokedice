// The catch, in the battle scene: the worn-out foe stays on its platform while the panel offers the balls, each with
// its chance (catchChance), how many you have, and "not needed" once a weaker one already makes it certain. One throw
// plays the catch timeline on the stage (BattleView); the die and the result show here as it lands. A throw that fell
// short with a Bait in the bag asks first (docs/25): its die, its odds, Keep it / Throw the Bait. Capture Luck's second
// chance ends on Throw again instead of Continue.
import { TalentGem, talentName } from '@/components/Talent'
import { AutoButton } from '@/components/AutoButton'
import { BottomDock } from '@/components/BottomDock'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  baitChance,
  baitFaces,
  ballBonus,
  catchChance,
  catchValueOf,
  friendBallHelps,
  isBallFor,
  isTalentBall,
  sureThrow,
} from '@/engine'
import { useFriendBallBoost } from '@/lib/itemText'
import { Die } from '@/components/Die'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { joinList, t as tr } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame, type RunState } from '@/store/game'
import { finishCatch } from '@/store/run'
import { cx } from '@/theme/util'

// Professor Oak's one-time tip on the first catch (per device).

type Catch = NonNullable<RunState['catch']>

/** The Bait's die on the panel: its berry's colour, as the stage draws it (art, not a theme colour). */
const BAIT_COLOR = '#e8506a'

/** What the message box says during the catch. */
export function catchMessage(c: Catch, name: string, thrown: { revealed: boolean }): string {
  const r = c.result
  if (!r)
    return c.retried
      ? tr('ui.catch.again', { name })
      : tr('ui.catch.wornOut', {
          who: tr(c.kind === 'boss' ? 'ui.catch.theLegendary' : 'ui.catch.theWild'),
          name,
        })
  if (thrown.revealed) {
    if (r.baitOffer) return tr('ui.catch.baitAsk', { name })
    if (r.caught) return tr('ui.catch.caught', { name })
    if (r.stays) return tr('ui.catch.stayed', { name })
    return tr('ui.catch.missed', { need: Math.max(1, r.need - r.bonus - (r.bait ?? 0)) })
  }
  // Nothing about the result until the ball has finished its wobbles: the die would give it away.
  if (r.baited === 'used') return tr('ui.catch.baitThrown', { name })
  if (r.baited === 'kept') return tr('ui.catch.baitKept')
  const data = useGame.getState().data
  return tr('ui.catch.throwing', { ball: data.items[r.ballKey ?? 'poke-ball']?.name ?? tr('ui.catch.aBall') })
}

/** The ball picker, the catch math and the throw; after it, the die and CONTINUE. */
export function CatchPanel({
  c,
  picked,
  onThrow,
  revealed,
  onContinue = finishCatch,
  onBait,
  onRetry,
  docked = false,
  raid = false,
}: {
  c: Catch
  /** The ball Idle picked for this throw (docs/36; null: none): shown chosen, whatever was tapped. */
  picked?: string | null
  onThrow: (ballKey: string | null) => void
  /** The result is out. */
  revealed: boolean
  /** CONTINUE after the throw (a raid has its own result card). */
  onContinue?: () => void
  /** The answer to the Bait offered after a throw that fell short: thrown, or kept. */
  onBait?: (use: boolean) => void
  /** THROW AGAIN, once Capture Luck has kept it on the spot. */
  onRetry?: () => void
  /** In a battle's panel: the buttons go in its BottomDock (on phones, at the screen's foot). */
  docked?: boolean
  /** A raid's catch: the Raid Ball (docs/44) is offered too. */
  raid?: boolean
}) {
  const Dock = docked ? BottomDock : Plain
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const [ball, setBall] = useState<string | null>(null)
  const result = c.result
  const value = catchValueOf(data, c.dex)
  const balls = Object.entries(inventory ?? {})
    .map(([k, n]) => ({ item: data.items[k], n }))
    .filter((b) => b.n > 0 && isBallFor(b.item, !!raid))
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
  const chosen = options.find((o) => o.key === (picked !== undefined ? picked : ball)) ?? options[0]!
  // False Swipe (docs/51): + the catch die from the Pokémon that landed the K.O., in every ball's chance.
  const swipe = c.bonus ?? 0
  const pct = (bonus: number) => Math.round(catchChance(value, bonus + swipe) * 100)
  // A ball adds nothing once a weaker option (or no ball) is already certain.
  const sure = catchChance(value, swipe) >= 1
  // The Friend Ball (docs/59): its hidden-talent boost, while it can still find this one's talent.
  const boost = useFriendBallBoost()
  const talentUp = (o: (typeof options)[number]) =>
    o.key != null && isTalentBall(data.items[o.key]) && friendBallHelps(data, c.dex, !!c.talent, boost)
  const notNeeded = (o: (typeof options)[number]) =>
    o.key != null &&
    !talentUp(o) &&
    options.some((w) => w.bonus < o.bonus && catchChance(value, w.bonus + swipe) >= 1)

  // A throw that couldn't miss has no die and nothing to read once the ball has landed: on at once, no CONTINUE (the
  // user's call, 2026-10-26). A throw with a die keeps its CONTINUE, which loads and goes by itself.
  const sureDone = !!result && revealed && sureThrow(result) && !result.baitOffer && !result.stays
  const onwards = useRef(onContinue)
  onwards.current = onContinue
  useEffect(() => {
    if (sureDone) onwards.current()
  }, [sureDone])

  if (result) {
    // A throw that couldn't miss has no die: only the ball is thrown.
    const certain = sureThrow(result)
    const total = result.die + result.bonus + (result.bait ?? 0)
    const bait = result.baitOffer ? data.items[result.baitOffer] : undefined
    const faces = baitFaces(bait)
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
              {result.bait != null && (
                <Die
                  type="base"
                  color={BAIT_COLOR}
                  face={{ kind: 'number', value: result.bait }}
                  size={44}
                  rollKey="bait-throw"
                  label={t('ui.catch.baitDie', { value: result.bait })}
                />
              )}
              <span aria-hidden>
                +{result.bonus}
                {result.bait != null && ` +${result.bait}`} = {total} {total >= result.need ? '≥' : '<'}{' '}
                {result.need}
              </span>
            </>
          )}
        </div>
        <Dock>
        <div className="min-h-[56px]">
          {revealed && result.baitOffer ? (
            <div className="grid gap-1.5">
              <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-ink">
                {t('ui.catch.baitOdds', {
                  faces: joinList(faces.map(String)),
                  pct: Math.round(baitChance(result, faces) * 100),
                })}
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
                <PixelButton size="lg" onClick={() => onBait?.(false)}>
                  {t('ui.catch.baitKeep')}
                </PixelButton>
                <PixelButton variant="primary" size="lg" onClick={() => onBait?.(true)}>
                  {t('ui.catch.baitThrow', { n: inventory?.[result.baitOffer] ?? 0 })}
                </PixelButton>
              </div>
            </div>
          ) : revealed && result.stays ? (
            <PixelButton variant="primary" size="lg" className="w-full" onClick={onRetry}>
              {t('ui.catch.throwAgain')}
            </PixelButton>
          ) : (
            revealed &&
            !sureDone && (
              // The throw's only way on: it loads and goes by itself (the rework).
              <AutoButton paused="byDialogs" variant="primary" size="lg" className="w-full" onClick={onContinue}>
                {t('ui.common.continue')}
              </AutoButton>
            )
          )}
        </div>
        </Dock>
      </>
    )
  }

  // One ball or none in the bag, or a catch that can't miss: nothing to pick, the throw is the only way on, so it
  // loads and goes by itself (the rework).
  const single = sure || options.length === 1
  return (
    <>
      {/* Each ball says its own chance: no formula line, no tip (the rework). */}
      {swipe > 0 && (
        <p className="m-0 flex items-center justify-center gap-1.5 text-center font-pixel-sm text-[16px] leading-tight text-ink">
          <TalentGem talent="falseSwipe" size={16} />
          {t('ui.talent.catchBonus', { talent: talentName('falseSwipe'), n: swipe })}
        </p>
      )}
      {c.target.mode === 'replace' && (
        <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.catch.replaces', {
            level: c.target.level,
            name: data.species[c.dex]?.name ?? t('ui.common.unknown'),
          })}
        </p>
      )}
      <Dock>
        {single ? (
          <AutoButton paused="byDialogs" variant="primary" size="lg" className="w-full" onClick={() => onThrow(null)}>
            {sure ? t('ui.catch.catch') : t('ui.catch.roll')}
          </AutoButton>
        ) : (
          // A choice of balls (docs/42): each one is the throw, in the thumb's reach. No ball picked first and a
          // ROLL TO CATCH after it: the tap that chooses is the tap that throws.
          <div className="grid gap-1.5" role="group" aria-label={t('ui.catch.ballLegend')}>
            <p className="m-0 text-center font-pixel-sm text-[16px] leading-none text-muted">{t('ui.catch.tapBall')}</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(64px,1fr))] gap-1.5">
              {options.map((o) => {
                const item = o.key ? data.items[o.key] : null
                const useless = notNeeded(o)
                // Idle's pick (docs/36), shown chosen while it waits to throw it.
                const on = picked !== undefined && chosen.key === o.key
                return (
                  <button
                    key={o.key ?? 'none'}
                    type="button"
                    aria-label={`${t('ui.catch.throwLabel', {
                      label: o.label,
                      left: o.n != null ? t('ui.catch.ballLeft', { n: o.n }) : '',
                      pct: pct(o.bonus),
                      useless: useless ? t('ui.catch.notNeededSuffix') : '',
                    })}${talentUp(o) ? `, ${t('ui.catch.talentBoost', { x: boost })}` : ''}`}
                    title={useless ? t('ui.catch.notNeededTitle', { label: o.label }) : o.label}
                    onClick={() => {
                      setBall(o.key)
                      onThrow(o.key)
                    }}
                    className={cx(
                      'pixel-btn relative grid min-h-[84px] content-center justify-items-center gap-1 px-0.5 py-1.5 text-ink',
                      on ? 'bg-gold-pale outline outline-[3px] outline-offset-2 outline-gold' : 'bg-paper',
                      useless && !on && 'opacity-60',
                    )}
                  >
                    <span className="grid h-[28px] w-[28px] place-items-center">
                      {item ? <ItemSprite item={item} size={28} /> : <PixelIcon name="dice" size={22} />}
                    </span>
                    {talentUp(o) && <FriendBallTag boost={boost} className="absolute -right-1 -top-2.5 z-[1]" />}
                    <b className="font-pixel text-[22px] font-normal leading-none tabular-nums">{pct(o.bonus)}%</b>
                    <small className="font-pixel-sm text-[16px] leading-none text-muted">
                      {useless ? t('ui.catch.notNeeded') : o.n != null ? `×${o.n}` : t('ui.catch.noBall')}
                    </small>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </Dock>
    </>
  )
}

/** Outside a battle's panel (a raid, the kitchen sink): the buttons in the flow, as before. */
function Plain({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

/**
 * The Friend Ball's corner tag on its throw button (docs/59): the unknown talent's gem and the boost, while it can
 * still find this Pokémon's hidden talent. The button's name says it in words.
 */
export function FriendBallTag({ boost, className }: { boost: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'light-scope flex items-center gap-0.5 bg-gold px-1 font-pixel-sm text-tag leading-none text-ink shadow-ring-thin',
        className,
      )}
    >
      <TalentGem talent="extraReroll" unknown size={12} />×{boost}
    </span>
  )
}
