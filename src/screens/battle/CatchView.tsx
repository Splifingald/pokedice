// The catch throw after a wild or legendary K.O.: pick one ball (or none), throw the d6, keep it or watch it flee.
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ballBonus, catchChance, catchValueOf } from '@/engine'
import { sfx } from '@/audio/sfx'
import { Die } from '@/components/Die'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { useGame } from '@/store/game'
import { finishCatch, skipCatch, throwBall } from '@/store/run'
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
  const ballName = result?.ballKey ? (data.items[result.ballKey]?.name ?? 'ball') : null

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
        <p className="copy">
          Catch value <b>{value}</b>: the die plus your ball must reach {value}.
          {c.target.mode === 'replace' && ` You have a Lv.${c.target.level} ${name} — catching this Lv.${c.level} one replaces it.`}
        </p>

        {!result ? (
          <>
            <fieldset className="flex w-full flex-col gap-2">
              <legend className="mb-1 text-xl">Throw with</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((o) => (
                  <button
                    key={o.key ?? 'none'}
                    type="button"
                    aria-pressed={chosen.key === o.key}
                    onClick={() => setBall(o.key)}
                    className={cx('pixel-btn flex items-center justify-between gap-2 px-3 py-2 text-left text-lg', chosen.key === o.key ? 'bg-gold' : 'bg-panel')}
                  >
                    <span>
                      {o.label}
                      {o.n != null && <span className="font-mono text-base"> ×{o.n}</span>}
                    </span>
                    <span className="font-mono text-base">
                      {o.bonus ? `+${o.bonus} · ` : ''}
                      {pct(o.bonus)} %
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap justify-center gap-2">
              <PixelButton variant="primary" size="lg" onClick={() => throwBall(chosen.key)}>
                THROW
              </PixelButton>
              <PixelButton size="lg" onClick={skipCatch}>
                Let it go
              </PixelButton>
            </div>
          </>
        ) : (
          <>
            <Die type="base" face={{ kind: 'number', value: result.die }} size={80} rollKey="catch-throw" label={`Catch die: ${result.die}`} />
            <p className="text-2xl" aria-live="polite">
              {revealed
                ? `${result.die}${result.bonus ? ` + ${result.bonus} (${ballName})` : ''} = ${result.total} — needed ${result.need}. ${result.caught ? `${name} was caught!` : `${name} broke free and fled…`}`
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
