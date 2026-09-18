import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { SlotSymbol, SpinResult } from '@/engine'
import { sfx } from '@/audio/sfx'
import { GoldPill } from '@/components/GoldPill'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { useGame } from '@/store/game'
import { leaveCasino, spinSlotMachine } from '@/store/run'
import { cx } from '@/theme/util'

const REEL_START_MS = 650
const REEL_GAP_MS = 380
const TICK_MS = 90

function Symbol({ symbol, prizeDex, size }: { symbol: SlotSymbol; prizeDex: number; size: number }) {
  return symbol === 'ball' ? (
    <PixelIcon name="ball" size={Math.round(size * 0.72)} title="Poké Ball" />
  ) : (
    <SpriteImg dex={prizeDex} size={size} />
  )
}

function resultText(res: SpinResult, prizeName: string): string {
  switch (res.outcome) {
    case 'oneBall':
      return `1 Poké Ball · +₽${res.gold}`
    case 'twoBalls':
      return `2 Poké Balls · +₽${res.gold}`
    case 'threeBalls':
      return `3 Poké Balls! +₽${res.gold}`
    case 'jackpot':
      if (!res.prize) return `JACKPOT! You already have a strong ${prizeName} · +₽${res.gold}`
      if (res.prize.replacedLevel != null)
        return `JACKPOT! Your ${prizeName} grew from Lv.${res.prize.replacedLevel} to Lv.${res.prize.level}!`
      return `JACKPOT! ${prizeName} Lv.${res.prize.level} ${res.prize.joinedTeam ? 'joined your team' : 'was sent to your Box'}!`
  }
}

/** Game Corner: a three-reel slot machine, played as long as the player likes (and can pay). */
export function CasinoView() {
  const save = useGame((s) => s.save)
  const cfg = useGame((s) => s.data.config.slotMachine)
  const prizeName = useGame((s) => s.data.species[s.data.config.slotMachine.prizeDex]?.name ?? 'Pokémon')
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [reels, setReels] = useState<SlotSymbol[]>(['prize', 'ball', 'prize'])
  const [stopped, setStopped] = useState(3)
  const [last, setLast] = useState<SpinResult | null>(null)
  /** Payout not revealed yet: the reels are still turning. */
  const [hidden, setHidden] = useState(0)
  const timers = useRef<number[]>([])
  const stopAt = useRef({ target: [] as SlotSymbol[], stopped: 3 })

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  if (!save) return null
  const spinning = stopped < 3
  const cost = Math.max(0, Math.round(cfg.cost))
  const canPay = save.gold >= cost

  const spin = () => {
    if (spinning) return
    const res = spinSlotMachine()
    if (!res) return
    sfx('rattle')
    setLast(null)
    const reveal = () => {
      setStopped(3)
      setReels(res.reels)
      setHidden(0)
      setLast(res)
      sfx(
        res.outcome === 'jackpot'
          ? res.prize
            ? 'catch'
            : 'levelup'
          : res.outcome === 'threeBalls'
            ? 'levelup'
            : 'gold',
      )
    }
    if (reduced) return reveal()
    setHidden(res.gold)
    setStopped(0)
    stopAt.current = { target: res.reels, stopped: 0 }
    // Every turning reel flickers; they stop one after the other, left to right, on the drawn result.
    const flicker = window.setInterval(
      () =>
        setReels((r) =>
          r.map((_, i) =>
            i < stopAt.current.stopped ? stopAt.current.target[i]! : Math.random() < 0.5 ? 'ball' : 'prize',
          ),
        ),
      TICK_MS,
    )
    timers.current.push(flicker)
    for (let i = 0; i < 3; i++) {
      timers.current.push(
        window.setTimeout(
          () => {
            if (i === 2) {
              clearInterval(flicker)
              reveal()
              return
            }
            sfx('land')
            stopAt.current.stopped = i + 1
            setReels((r) => r.map((x, j) => (j <= i ? res.reels[j]! : x)))
            setStopped(i + 1)
          },
          REEL_START_MS + i * REEL_GAP_MS,
        ),
      )
    }
  }

  const win = last && (last.outcome === 'jackpot' || last.outcome === 'threeBalls')

  return (
    <div className="flex flex-col gap-4">
      <section
        className="pixel-panel-dark mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-4"
        aria-label="Slot machine"
      >
        <div className="flex w-full items-center justify-between gap-2">
          <h2 className="text-3xl leading-none text-gold">GAME CORNER</h2>
          <GoldPill amount={save.gold - hidden} />
        </div>

        <div
          className="flex justify-center gap-2 border-[3px] border-gold bg-ink p-2 sm:gap-3 sm:p-3"
          role="img"
          aria-label={
            spinning
              ? 'Reels spinning'
              : `Reels: ${reels.map((r) => (r === 'ball' ? 'Poké Ball' : prizeName)).join(', ')}`
          }
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="flex h-24 w-20 items-center justify-center border-[3px] border-ink bg-panel sm:h-28 sm:w-24"
              style={{ boxShadow: 'inset 0 6px 0 rgba(0,0,0,0.18), inset 0 -6px 0 rgba(0,0,0,0.18)' }}
              animate={spinning && i >= stopped ? { y: [0, -3, 0] } : { y: 0 }}
              transition={spinning && i >= stopped ? { duration: 0.18, repeat: Infinity } : { duration: 0.1 }}
            >
              <Symbol symbol={reels[i]!} prizeDex={cfg.prizeDex} size={64} />
            </motion.div>
          ))}
        </div>

        <p
          className={cx(
            'min-h-[2.5rem] text-center text-2xl leading-tight',
            win ? 'text-gold' : 'text-panel',
          )}
          aria-live="polite"
        >
          {spinning ? 'Spinning…' : last ? resultText(last, prizeName) : `₽${cost} a spin. Good luck!`}
        </p>

        <PixelButton
          variant="primary"
          size="lg"
          className="w-full"
          disabled={spinning || !canPay}
          onClick={spin}
        >
          SPIN · ₽{cost}
        </PixelButton>
        {!canPay && !spinning && <p className="text-lg text-danger-light">Not enough Pokédollars to play.</p>}
      </section>

      <section className="pixel-panel mx-auto w-full max-w-lg p-3" aria-label="Payouts">
        <h3 className="mb-2 text-2xl">Payouts</h3>
        <ul className="flex flex-col gap-1.5 text-xl">
          {([1, 2, 3] as const).map((n) => {
            const key = n === 1 ? 'oneBall' : n === 2 ? 'twoBalls' : 'threeBalls'
            return (
              <li key={n} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  {Array.from({ length: n }, (_, j) => (
                    <PixelIcon key={j} name="ball" size={20} />
                  ))}
                  <span className="ml-1">
                    {n} Poké Ball{n > 1 ? 's' : ''}
                  </span>
                </span>
                <span className="font-mono">₽{Math.round(cfg[key].gold)}</span>
              </li>
            )
          })}
          <li className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-0.5">
              {[0, 1, 2].map((j) => (
                <SpriteImg key={j} dex={cfg.prizeDex} size={28} />
              ))}
              <span className="ml-1">3 {prizeName}</span>
            </span>
            <span className="text-right text-good">
              {prizeName} Lv.{cfg.prizeLevel}
            </span>
          </li>
        </ul>
      </section>

      {/* Always on screen, above the phone bottom bar. */}
      <div
        className="sticky z-30 -mx-3 border-t-[3px] border-ink bg-parchment px-3 py-2"
        style={{ bottom: 'var(--bottom-nav)' }}
      >
        <PixelButton
          size="lg"
          className="w-full md:mx-auto md:flex md:w-80"
          disabled={spinning}
          onClick={leaveCasino}
        >
          LEAVE
        </PixelButton>
      </div>
    </div>
  )
}
