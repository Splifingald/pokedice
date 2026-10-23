// Kitchen sink (dev only): the rewards' game feel (docs/38 §4) — the gold counting up from 0, its coins flying to the
// top bar's gold, the XP bar's steps and level-up flash, the pixel confetti, the Pokédex registration card, and the
// Upgrades' navy and best-buy buttons with a purchase's pop, frozen on its frames.
import { useEffect, useMemo, useRef, useState } from 'react'
import { xpToNext } from '@/engine'
import { Confetti } from '@/components/Confetti'
import { CoinFlight } from '@/components/CoinFlight'
import { XpBar } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { xpFillFrames } from '@/lib/xpFill'
import { useGame } from '@/store/game'
import { DexRegisteredCard, GoldCard } from '../battle/VictoryView'
import { UpCard, type Up, type UpPop } from '../Upgrades'

const PAIR: Up = {
  id: 'pair',
  kind: 'combo',
  name: 'Pair',
  level: 2,
  max: 10,
  bonus: 3,
  next: 4,
  cost: 15,
  locked: null,
  visual: null,
  buy: () => true,
}

/** A frame number that runs from 0 to `n` every `ms`, again from 0 on each replay. */
function useReplay(n: number, ms: number): [number, () => void] {
  const [f, setF] = useState(n)
  useEffect(() => {
    if (f >= n) return
    const timer = window.setTimeout(() => setF(f + 1), ms)
    return () => window.clearTimeout(timer)
  }, [f, n, ms])
  return [f, () => setF(0)]
}

const Label = ({ children }: { children: string }) => (
  <small className="font-pixel-sm text-[14px] text-muted">{children}</small>
)

export function RewardBits() {
  const inst = useGame((s) => (s.save ? s.save.box.find((p) => p.id === s.save!.team[0]) : undefined))
  const cfg = useGame((s) => s.data.config)
  const [gold, setGold] = useState(0)
  const [flying, setFlying] = useState(0)
  const [burst, setBurst] = useState(0)
  const from = useRef<HTMLSpanElement>(null)
  const to = useRef<HTMLSpanElement>(null)
  // A level-up's fill: from 70 % of Lv.11 to a third of Lv.12.
  const frames = useMemo(() => {
    const at = (level: number, k: number) => ({ level, xp: Math.round(xpToNext(level, cfg) * k) })
    return xpFillFrames(at(11, 0.7), at(12, 1 / 3), cfg)
  }, [cfg])
  const [xpAt, replayXp] = useReplay(frames.length, 50)
  const pop = (frame: number): UpPop => ({ level: 3, text: '+4 damage', frame, calm: false })
  const white = frames.findIndex((f) => f.white)
  return (
    <div className="grid w-full max-w-md gap-4">
      <div className="grid gap-1">
        <GoldCard key={gold} amount={1250} />
        <Label>The victory's gold: it counts up from 0 (the coin ticks need the Game feel switch)</Label>
        <PixelButton size="sm" onClick={() => setGold((n) => n + 1)}>
          Count again
        </PixelButton>
      </div>

      <div className="grid gap-1">
        <div className="flex items-center justify-between bg-paper p-2 shadow-ring">
          <span ref={from} className="inline-flex items-center gap-1 text-2xl">
            <PixelIcon name="coin" size={24} /> +250
          </span>
          <span
            ref={to}
            className="pixel-corners light-scope inline-flex min-h-[44px] items-center gap-1.5 bg-night px-2.5 text-[19px] text-gold-light"
          >
            <PixelIcon name="coin" size={16} /> ₽ 4,210
          </span>
        </div>
        {flying > 0 && <CoinFlight key={flying} from={from} to={to} />}
        <Label>
          Coins fly to the top bar's gold (here, a stand-in on the right); skipped when calm or off
        </Label>
        <PixelButton size="sm" onClick={() => setFlying((n) => n + 1)}>
          Fly the coins
        </PixelButton>
      </div>

      {inst && (
        <div className="grid gap-1">
          <XpBar inst={inst} shown={frames[Math.min(xpAt, frames.length - 1)]} stepped />
          <Label>The XP bar in steps, Lv.11 → Lv.12 (playing)</Label>
          <PixelButton size="sm" onClick={replayXp}>
            Fill again
          </PixelButton>
          <XpBar inst={inst} shown={frames[2]} stepped />
          <Label>Filling (frame 3)</Label>
          <XpBar inst={inst} shown={frames[white]} stepped />
          <Label>The level-up's white frame</Label>
          <XpBar inst={inst} shown={frames[white + 2]} stepped />
          <Label>Rolled over to Lv.12, empty</Label>
        </div>
      )}

      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-6 py-6">
          {[undefined, 2, 6, 10].map((frame) => (
            <span
              key={`${frame}-${burst}`}
              className="relative inline-block h-10 w-10 bg-well shadow-ring-line"
            >
              <Confetti pixel frame={frame} />
            </span>
          ))}
        </div>
        <Label>Pixel confetti: playing, then frames 2, 6 and 10</Label>
        <PixelButton size="sm" onClick={() => setBurst((n) => n + 1)}>
          Burst again
        </PixelButton>
      </div>

      <div className="grid gap-1">
        <DexRegisteredCard dex={16} />
        <Label>A species' first catch, under its catch card</Label>
      </div>

      <ul className="m-0 grid list-none gap-2 p-0">
        <UpCard u={PAIR} gold={100} />
        <UpCard u={{ ...PAIR, id: 'pair-best' }} gold={100} best />
        <UpCard u={{ ...PAIR, id: 'pair-1', level: 3 }} gold={100} frozenPop={pop(0)} />
        <UpCard u={{ ...PAIR, id: 'pair-2', level: 3 }} gold={100} frozenPop={pop(1)} />
        <UpCard u={{ ...PAIR, id: 'pair-3', level: 3 }} gold={100} frozenPop={pop(3)} />
        <UpCard u={{ ...PAIR, id: 'pair-4', level: 3 }} gold={100} frozenPop={pop(8)} />
      </ul>
      <Label>
        Upgrades: navy, the best buy gold with its chip; a purchase's pop: 1/3, 2/3, the white frame, the
        bonus
      </Label>
    </div>
  )
}
