// The catch throw after a wild or legendary K.O.: pick one ball (or none), throw the d6, keep it or watch it flee.
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ballBonus, catchChance, catchValueOf } from '@/engine'
import { sfx } from '@/audio/sfx'
import { Die } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { useGame } from '@/store/game'
import { finishCatch, throwBall } from '@/store/run'
import { cx } from '@/theme/util'

export function CatchView() {
  const c = useGame((s) => s.run.catch)
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [ball, setBall] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const result = c?.result ?? null

  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setRevealed(true), reduced ? 0 : 950)
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
        <motion.div
          animate={revealed && result && !result.caught ? { x: 60, opacity: 0.25 } : { x: 0, opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.6 }}
        >
          <SpriteImg dex={c.dex} size={128} className="border-[3px] border-ink bg-parchment" />
        </motion.div>
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
