// Trick or Treat on the area screen (docs/28): the ghost over the area, its gauge under it, TREAT and TRICK BALL in
// the pinned bar, then the result and CONTINUE. The store asks the engine for each step (store/run.ts); this screen
// only plays it: the Treat's arc and the munch, then the gauge filling; the ball's arc, the ghost drawn in, the die,
// the wobbles, and the stars or the break-free (and the gauge's push). With motion `short` a step is its flight and
// then its result at once; with `off` everything lands at once, every message kept.
import { useEffect, useRef, useState } from 'react'
import {
  failPush,
  treatRange,
  trickBand,
  trickCfg,
  trickChance,
  trickRulesDue,
  trickZoneAt,
  markTrickRulesSeen,
  type TrickStep,
} from '@/engine'
import { fxSound, sfx } from '@/audio/sfx'
import { Die } from '@/components/Die'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import {
  TierChip,
  TrickGauge,
  TrickResult,
  TrickRulesModal,
  TrickSprite,
  TrickStage,
  restLook,
  targetLabel,
  type TrickLook,
} from '@/components/TrickOrTreat'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { mutateSave, useGame, type TrickRun } from '@/store/game'
import { giveTreat, leaveTrick, throwTrickBall } from '@/store/run'
import { RunRoundGauge } from './RoundGauge'

/** What the message box says once a step has played. */
function stepMessage(step: TrickStep, name: string): string {
  const target = targetLabel(step.need ?? 6)
  if (step.kind === 'treat')
    return step.fled ? tr('ui.trick.fledTreat', { name }) : tr('ui.trick.ate', { name, n: step.amount })
  if (step.caught) return tr('ui.trick.caught', { name })
  if (step.fled) return tr('ui.trick.fledBall', { name, die: step.die ?? 0, target })
  return tr('ui.trick.missed', { name, die: step.die ?? 0, target, n: step.amount })
}

/** The stage once a step has played to its end. */
const endLook = (step: TrickStep): TrickLook => restLook(step.to, step.state.end)

export function TrickView() {
  const { t } = useT()
  const run = useGame((s) => s.run)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const trick = run.trick as TrickRun
  const { level, calm } = useMotion()
  const name = data.species[trick.state.dex]?.name ?? `#${trick.state.dex}`
  const [look, setLook] = useState<TrickLook>(() => (trick.last ? endLook(trick.last) : restLook(0)))
  const [message, setMessage] = useState(() =>
    trick.last ? stepMessage(trick.last, name) : t('ui.trick.appears', { name }),
  )
  const [die, setDie] = useState<{ value: number; key: number; roll: boolean } | null>(() =>
    trick.last?.die != null ? { value: trick.last.die, key: 0, roll: false } : null,
  )
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState<'unlock' | 'info' | null>(() =>
    save && trickRulesDue(save, data) ? 'unlock' : null,
  )
  const timers = useRef<number[]>([])
  const seq = useRef(0)
  useEffect(() => () => timers.current.forEach((x) => clearTimeout(x)), [])

  const cfg = trickCfg(data)
  const band = trickBand(cfg, trick.state.tier)
  const here = trickZoneAt(band, trick.state.gauge)
  const { min, max } = treatRange(cfg)
  const end = trick.state.end
  const done = !!end && !busy

  /** Each beat at its time (ms at full speed); the last one hands the buttons back. */
  const schedule = (beats: [number, () => void][]) => {
    timers.current.forEach((x) => clearTimeout(x))
    timers.current = beats.map(([at, f]) => window.setTimeout(f, at))
  }

  const play = (step: TrickStep) => {
    const key = ++seq.current
    const final = () => {
      setLook(endLook(step))
      setMessage(stepMessage(step, name))
      setBusy(false)
    }
    if (step.die != null) setDie({ value: step.die, key, roll: level !== 'off' })
    if (level === 'off') return final()
    setBusy(true)
    const short = level === 'short'
    if (step.kind === 'treat') {
      fxSound('trick.toss')
      setLook((l) => ({ ...l, treat: key, ghost: 'float' }))
      if (short) return schedule([[300, final]])
      const flee = 900
      schedule([
        [
          520,
          () => {
            fxSound('trick.munch')
            setLook((l) => ({ ...l, treat: null, ghost: 'munch' }))
            setMessage(stepMessage({ ...step, fled: false }, name))
          },
        ],
        [
          880,
          () => {
            fxSound('trick.fill')
            setLook((l) => ({ ...l, gauge: step.to, ghost: 'float' }))
          },
        ],
        ...(step.fled
          ? ([
              [
                880 + flee,
                () => {
                  fxSound('trick.flee')
                  setLook((l) => ({ ...l, ghost: 'flee' }))
                  setMessage(stepMessage(step, name))
                },
              ],
              [880 + flee + 700, final],
            ] as [number, () => void][])
          : ([[1380, final]] as [number, () => void][])),
      ])
      return
    }
    // A Trick Ball.
    fxSound('catch.throw')
    setMessage(t('ui.trick.throwing'))
    setLook((l) => ({ ...l, ball: { at: 'fly', wobble: 0, key }, ghost: 'float' }))
    if (short)
      return schedule([
        [
          300,
          () => {
            fxSound(step.caught ? 'catch.gotcha' : 'catch.break')
            if (step.fled) fxSound('trick.flee')
            final()
          },
        ],
      ])
    const wobbles = step.caught ? 3 : (step.need ?? 6) - (step.die ?? 0) >= 2 ? 1 : 2
    const beats: [number, () => void][] = [
      [
        520,
        () => {
          fxSound('catch.open')
          setLook((l) => ({ ...l, ghost: 'absorb', ball: { at: 'ground', wobble: 0, key } }))
        },
      ],
      [
        820,
        () => {
          sfx('rattle')
          setLook((l) => ({ ...l, ghost: 'hidden' }))
        },
      ],
    ]
    const start = 1420
    for (let i = 0; i < wobbles; i++)
      beats.push([
        start + i * 520,
        () => {
          fxSound('catch.wobble')
          setLook((l) => ({ ...l, ball: { at: 'ground', wobble: i + 1, key } }))
        },
      ])
    const after = start + wobbles * 520
    if (step.caught)
      beats.push(
        [
          after,
          () => {
            fxSound('catch.gotcha')
            setLook((l) => ({ ...l, ball: { at: 'caught', wobble: 0, key } }))
            setMessage(stepMessage(step, name))
          },
        ],
        [after + 800, final],
      )
    else {
      beats.push(
        [
          after,
          () => {
            fxSound('catch.break')
            setLook((l) => ({ ...l, ghost: 'out', ball: null }))
            setMessage(stepMessage({ ...step, fled: false }, name))
          },
        ],
        [
          after + 360,
          () => {
            fxSound('trick.fill')
            setLook((l) => ({ ...l, gauge: step.to, ghost: 'float' }))
          },
        ],
      )
      if (step.fled)
        beats.push(
          [
            after + 1200,
            () => {
              fxSound('trick.flee')
              setLook((l) => ({ ...l, ghost: 'flee' }))
              setMessage(stepMessage(step, name))
            },
          ],
          [after + 1900, final],
        )
      else beats.push([after + 900, final])
    }
    schedule(beats)
  }

  const act = (f: () => TrickStep | null) => {
    if (busy || end) return
    const step = f()
    if (step) play(step)
  }

  const closeRules = () => {
    if (rules === 'unlock') mutateSave((s) => (s.trickOrTreat?.rulesSeen ? null : markTrickRulesSeen(s)))
    setRules(null)
  }

  const odds = here ? Math.round(trickChance(here.zone.need) * 100) : 0
  return (
    // Phones: room at the bottom for the pinned bar over the tab bar.
    <div className="flex flex-col gap-3 pb-[180px] md:pb-0">
      <section
        className="pixel-panel mx-auto flex w-full max-w-lg flex-col gap-3 p-3"
        aria-labelledby="trick-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="trick-title" className="m-0 flex items-center gap-2 text-[28px] font-normal leading-none">
            {t('ui.trick.title')}
          </h2>
          <span className="flex items-center gap-2">
            <span className="text-xl leading-none">
              {name} {t('ui.common.level.short', { n: trick.state.level })}
            </span>
            <TierChip tier={trick.state.tier} />
          </span>
        </div>
        <TrickStage
          areaId={run.areaId}
          dex={trick.state.dex}
          shiny={trick.state.shiny}
          look={look}
          still={calm}
          speed={level === 'short' ? 0.55 : 1}
          label={t('ui.trick.stage', { name, level: trick.state.level })}
        >
          {die && (
            <span className="absolute bottom-2 right-2" aria-hidden>
              <Die
                type="base"
                face={{ kind: 'number', value: die.value }}
                size={44}
                rollKey={die.roll ? `tt-${die.key}` : undefined}
              />
            </span>
          )}
        </TrickStage>
        <TrickGauge band={band} value={look.gauge} instant={level === 'off'} />
        <p className="copy m-0 min-h-[2.7em] text-center text-ink" aria-live="polite">
          {message}
        </p>
        {done && (
          <TrickResult
            name={name}
            dex={trick.state.dex}
            shiny={trick.state.shiny}
            level={trick.state.level}
            end={end}
            placed={trick.caught?.placed}
            isNew={trick.caught?.isNew}
            replacedLevel={trick.caught?.replacedLevel}
            secrets={(trick.caught?.secrets ?? []).map(
              (id) => data.areas.find((a) => a.id === id)?.name ?? id,
            )}
          />
        )}
      </section>
      <div className="mx-auto w-full max-w-lg">
        <InfoButton name={t('ui.trick.title')} onClick={() => setRules('info')} />
      </div>
      <TrickRulesModal
        open={rules != null}
        onClose={closeRules}
        onGo={rules === 'unlock' ? closeRules : undefined}
      />

      {/* Always on screen: pinned right above the phone tab bar, as the Game Corner's. */}
      <div
        className="fixed inset-x-0 z-30 border-t-[3px] border-edge bg-parchment px-3 py-2 md:sticky md:inset-x-auto md:-mx-3"
        style={{ bottom: 'var(--bottom-nav)' }}
      >
        <div className="flex flex-col gap-1.5 md:mx-auto md:w-[28rem]">
          <RunRoundGauge />
          {done ? (
            <PixelButton variant="primary" size="lg" className="w-full" onClick={leaveTrick}>
              {t('ui.common.continue')}
            </PixelButton>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <div className="flex flex-col gap-0.5">
                <PixelButton
                  size="lg"
                  className="w-full"
                  disabled={busy || !!end}
                  onClick={() => act(giveTreat)}
                  aria-describedby="tt-treat-note"
                >
                  <TrickSprite kind="treat" size={30} />
                  {t('ui.trick.treat')}
                </PixelButton>
                <span id="tt-treat-note" className="text-center font-pixel-sm text-[15px] text-muted">
                  {t('ui.trick.treatNote', { min, max })}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <PixelButton
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={busy || !!end}
                  onClick={() => act(throwTrickBall)}
                  aria-describedby="tt-ball-note"
                >
                  <TrickSprite kind="ball" size={30} />
                  {t('ui.trick.ball')}
                </PixelButton>
                <span id="tt-ball-note" className="text-center font-pixel-sm text-[15px] text-muted">
                  {here
                    ? t('ui.trick.ballNote', {
                        target: targetLabel(here.zone.need),
                        pct: odds,
                        push: failPush(cfg),
                      })
                    : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
