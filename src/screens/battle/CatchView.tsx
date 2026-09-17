// The catch throw after a wild or legendary K.O.: pick one ball (or none), throw the d6, keep it or watch it flee.
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { ballBonus, catchChance, catchValueOf } from '@/engine'
import { sfx } from '@/audio/sfx'
import { Die } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { playerOf, PokeBall, ThrowSprite } from '@/components/TrainerArt'
import { useGame } from '@/store/game'
import { finishCatch, throwBall } from '@/store/run'
import { cx } from '@/theme/util'

// The throw, in ms from THROW: the arm swings, the ball flies, swallows the Pokémon, drops and wobbles until the reveal.
const FRAME_MS = 55
const FLY_AT = 130
const FLY_MS = 330
const ABSORB_MS = 180
const DROP_MS = 150
const REVEAL_MS = 1450

type Outcome = 'caught' | 'fled' | null

function ThrowStage({
  dex,
  shiny,
  character,
  ballKey,
  thrown,
  outcome,
  reduced,
}: {
  dex: number
  shiny?: boolean
  character: 'red' | 'green'
  ballKey: string | null
  thrown: boolean
  outcome: Outcome
  reduced: boolean
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState(0)
  const [step, setStep] = useState<'ready' | 'fly' | 'absorb' | 'wobble'>('ready')
  const [box, setBox] = useState({ w: 360, h: 150 })

  useEffect(() => {
    if (!thrown) return
    const r = stage.current?.getBoundingClientRect()
    if (r) setBox({ w: r.width, h: r.height })
    if (reduced) {
      setStep('wobble')
      return
    }
    const at = (ms: number, f: () => void) => setTimeout(f, ms)
    const timers = [
      ...[1, 2, 3, 4].map((f, i) => at(i * FRAME_MS, () => setFrame(f))),
      at(FLY_AT, () => setStep('fly')),
      at(FLY_AT + FLY_MS, () => setStep('absorb')),
      at(FLY_AT + FLY_MS + ABSORB_MS, () => setStep('wobble')),
      at(420, () => setFrame(0)),
    ]
    return () => timers.forEach(clearTimeout)
  }, [thrown, reduced])

  const monSize = 112
  const ballSize = 28
  // Where the ball goes: from the thrower's hand to the Pokémon, then down to the ground under it.
  const hand = { x: 96, y: box.h - 104 }
  const mon = { x: box.w - 12 - monSize / 2 - ballSize / 2, y: monSize / 2 - ballSize / 2 }
  const ground = { x: mon.x, y: monSize - 18 }
  const arc = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    return { x: hand.x + (mon.x - hand.x) * t, y: hand.y + (mon.y - hand.y) * t - 70 * 4 * t * (1 - t) }
  })

  const inBall = step === 'absorb' || step === 'wobble'
  const ballShown = step !== 'ready' && outcome !== 'fled'

  return (
    <div ref={stage} className="relative h-[150px] w-full max-w-md" aria-hidden>
      <div className="absolute bottom-0 left-0">
        <ThrowSprite character={character} frame={frame} size={128} />
      </div>
      <motion.div
        className="absolute right-3 top-0"
        style={{ width: monSize, height: monSize, transformOrigin: '50% 60%' }}
        initial={false}
        animate={
          outcome === 'fled'
            ? { scale: [0, 1.1, 1, 1], opacity: [1, 1, 1, 0], x: [0, 0, 0, 60], filter: 'brightness(1)' }
            : inBall
              ? { scale: 0, opacity: 0, filter: 'brightness(4)' }
              : step === 'fly'
                ? { scale: 1, opacity: 1, filter: 'brightness(1)' }
                : { scale: 1, opacity: 1, x: 0, filter: 'brightness(1)' }
        }
        transition={
          outcome === 'fled'
            ? { duration: reduced ? 0 : 0.7, times: [0, 0.25, 0.4, 1] }
            : { duration: reduced ? 0 : ABSORB_MS / 1000, ease: 'easeIn' }
        }
      >
        <SpriteImg dex={dex} size={monSize} shiny={shiny} />
      </motion.div>
      {ballShown && (
        <motion.div
          className="absolute left-0 top-0"
          initial={reduced ? { x: ground.x, y: ground.y } : { x: hand.x, y: hand.y, rotate: 0 }}
          animate={
            step === 'fly'
              ? { x: arc.map((p) => p.x), y: arc.map((p) => p.y), rotate: 540 }
              : step === 'absorb'
                ? { x: mon.x, y: mon.y, rotate: 720, scale: [1, 1.3, 1] }
                : outcome === 'caught'
                  ? { x: ground.x, y: ground.y, rotate: 0, filter: 'brightness(0.75)' }
                  : { x: ground.x, y: [mon.y, ground.y], rotate: reduced ? 0 : [0, 0, -24, 24, 0, 0, -18, 18, 0] }
          }
          transition={
            step === 'fly'
              ? { duration: FLY_MS / 1000, ease: 'linear' }
              : step === 'absorb'
                ? { duration: ABSORB_MS / 1000 }
                : outcome === 'caught'
                  ? { duration: 0.15 }
                  : {
                      y: { duration: DROP_MS / 1000, ease: 'easeIn' },
                      rotate: { duration: 0.9, delay: DROP_MS / 1000, times: [0, 0.1, 0.2, 0.3, 0.4, 0.55, 0.7, 0.85, 1], repeat: Infinity },
                    }
          }
        >
          <PokeBall ballKey={ballKey} size={ballSize} />
        </motion.div>
      )}
      {/* Click! A few sparks pop off the ball on a catch. */}
      {outcome === 'caught' &&
        !reduced &&
        [-1, 0, 1].map((d) => (
          <motion.div
            key={d}
            className="absolute left-0 top-0 h-2 w-2 bg-gold"
            style={{ boxShadow: '0 0 0 2px #2a2438' }}
            initial={{ x: ground.x + ballSize / 2 - 4, y: ground.y, opacity: 1 }}
            animate={{ x: ground.x + ballSize / 2 - 4 + d * 26, y: ground.y - 26 + Math.abs(d) * 8, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        ))}
      {outcome === 'fled' && !reduced && (
        <motion.div
          className="absolute left-0 top-0"
          initial={{ x: ground.x - 6, y: ground.y - 6, scale: 0.4, opacity: 1 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="h-10 w-10 rounded-full bg-white" />
        </motion.div>
      )}
    </div>
  )
}

export function CatchView() {
  const c = useGame((s) => s.run.catch)
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const save = useGame((s) => s.save)
  const [ball, setBall] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const result = c?.result ?? null

  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setRevealed(true), reduced ? 0 : REVEAL_MS)
    return () => clearTimeout(t)
  }, [result, reduced])
  useEffect(() => {
    if (revealed && result) sfx(result.caught ? 'catch' : 'error')
  }, [revealed, result])

  if (!c) return null
  const name = data.species[c.dex]?.name ?? '???'
  const value = catchValueOf(data, c.dex)
  const balls = Object.entries(inventory ?? {})
    .map(([k, n]) => ({ item: data.items[k], n }))
    .filter((b) => b.n > 0 && b.item?.effect.kind === 'ball')
    .sort((a, b) => ballBonus(a.item) - ballBonus(b.item))
  const options = [
    { key: null as string | null, label: 'No ball', bonus: 0, n: null as number | null },
    ...balls.map((b) => ({ key: b.item!.key as string | null, label: b.item!.name, bonus: ballBonus(b.item), n: b.n as number | null })),
  ]
  const chosen = options.find((o) => o.key === ball) ?? options[0]!
  const pct = (bonus: number) => Math.round(catchChance(value, bonus) * 100)
  const title = revealed && result ? (result.caught ? 'Gotcha!' : `${name} fled!`) : `${c.kind === 'boss' ? 'The legendary' : 'The wild'} ${name} is worn out!`


  return (
    <motion.div className="fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-ink/70 p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catch-title"
        className="pixel-panel my-4 flex w-full max-w-xl flex-col items-center gap-3 p-4 text-center"
        initial={{ y: 30, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
      >
        <h2 id="catch-title" className="text-4xl leading-none">
          {title}
        </h2>
        <ThrowStage
          dex={c.dex}
          shiny={c.shiny}
          character={playerOf(save).character}
          ballKey={result?.ballKey ?? null}
          thrown={!!result}
          outcome={revealed && result ? (result.caught ? 'caught' : 'fled') : null}
          reduced={reduced}
        />
        {c.target.mode === 'replace' && !result && (
          <p className="copy text-muted">Replaces your Lv.{c.target.level} {name}.</p>
        )}

        {!result ? (
          <>
            <div aria-live="polite">
              <div className="text-xl leading-none">Catch chance</div>
              <div className="text-6xl leading-none tabular-nums">{pct(chosen.bonus)}%</div>
            </div>
            <fieldset className="w-full">
              <legend className="sr-only">Ball</legend>
              <div className="flex flex-wrap justify-center gap-2">
                {options.map((o) => {
                  const icon = o.key ? data.items[o.key]?.spriteUrl : null
                  return (
                    <button
                      key={o.key ?? 'none'}
                      type="button"
                      aria-pressed={chosen.key === o.key}
                      aria-label={`${o.label}${o.n != null ? `, ${o.n} left` : ''}, +${o.bonus}`}
                      title={o.label}
                      onClick={() => setBall(o.key)}
                      className={cx('pixel-btn relative flex w-20 flex-col items-center px-1 pb-1 pt-2', chosen.key === o.key ? 'bg-gold' : 'bg-panel')}
                    >
                      {o.key == null ? (
                        <span className="flex h-10 items-center text-lg leading-none">None</span>
                      ) : icon ? (
                        <img src={icon} alt="" width={40} height={40} style={{ imageRendering: 'pixelated' }} />
                      ) : (
                        <span className="flex h-10 items-center">
                          <PixelIcon name="ball" size={28} />
                        </span>
                      )}
                      <span className="text-xl leading-none">+{o.bonus}</span>
                      {o.n != null && <span className="absolute right-1 top-0.5 font-mono text-sm">×{o.n}</span>}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <PixelButton variant="primary" size="lg" onClick={() => throwBall(chosen.key)}>
              THROW
            </PixelButton>
          </>
        ) : (
          <>
            <Die type="base" face={{ kind: 'number', value: result.die }} size={80} rollKey="catch-throw" label={`Catch die: ${result.die}`} />
            <p className="text-2xl" aria-live="polite">
              {revealed
                ? result.caught
                  ? `${name} was caught!`
                  : `MISSED! You needed at least ${Math.max(1, result.need - result.bonus)}.`
                : 'The die is rolling…'}
            </p>
            {revealed && (
              <PixelButton variant="primary" size="lg" onClick={finishCatch}>
                CONTINUE
              </PixelButton>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
