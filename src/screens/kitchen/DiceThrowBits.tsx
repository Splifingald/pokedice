// Kitchen sink (dev only): the recorded dice throws (docs/37), shown whatever the admin's switch says. A tray thrown at
// each motion level (full, short, the OS's calm drop, off), with slow motion and a reroll of the picked dice only;
// frozen frames mid-throw; every status face; the dice at rest; and which recording each die plays.
import { useEffect, useState, type ReactNode } from 'react'
import { Die } from '@/components/Die'
import { PixelButton } from '@/components/PixelButton'
import { DiceLabContext, loadDicePlayer, type DiceLab } from '@/components/useDieThrow'
import type { DieType } from '@/engine'
import type { ThrowLevel } from '@/fx/dice/solve'
import { useGame } from '@/store/game'

/** Pips, two status faces and a number: what a tray can hold. */
const HAND: { type: DieType; face: number }[] = [
  { type: 'base', face: 4 },
  { type: 'fire', face: 0 },
  { type: 'electric', face: 3 },
  { type: 'dragon', face: 5 },
]
const STATUS: { type: DieType; face: number }[] = [
  { type: 'fire', face: 0 },
  { type: 'poison', face: 0 },
  { type: 'ice', face: 0 },
  { type: 'electric', face: 3 },
  { type: 'psychic', face: 5 },
  { type: 'grass', face: 2 },
]
const LEVELS: { level: ThrowLevel | 'off'; name: string }[] = [
  { level: 'full', name: 'full: the whole throw, a click per bounce' },
  { level: 'short', name: 'short (the setting, auto battles): the last bounce and the settle' },
  { level: 'calm', name: 'the OS asks for less motion: a two-step drop, no spin' },
  { level: 'off', name: 'off: at rest at once' },
]

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

/** A tray: room above for the throw to come in, as under the battle's message box. */
function Tray({
  dice,
  roll,
  picked,
  size = 48,
  onPick,
}: {
  dice: { type: DieType; face: number }[]
  roll: number[]
  picked?: boolean[]
  size?: number
  onPick?: (i: number) => void
}) {
  const data = useGame((s) => s.data)
  return (
    <div className="flex min-h-[64px] flex-wrap items-end gap-2 pt-[120px]">
      {dice.map((d, i) => (
        <Die
          key={i}
          type={d.type}
          face={data.diceTypes[d.type].faces[d.face]}
          size={size}
          rollKey={`ks-${d.type}-${i}-${roll[i] ?? 0}`}
          delay={i * 0.05}
          selected={!!picked?.[i]}
          onClick={onPick ? () => onPick(i) : undefined}
        />
      ))}
    </div>
  )
}

/** Which recording each die of the tray plays, mirrored or not, and what it would show unturned. */
function Recordings({ roll, level }: { roll: number[]; level: ThrowLevel }) {
  const data = useGame((s) => s.data)
  const [line, setLine] = useState('')
  useEffect(() => {
    let live = true
    void loadDicePlayer().then((m) => {
      if (!live) return
      setLine(
        HAND.map((d, i) => {
          const r = m.describeThrow(`ks-${d.type}-${i}-${roll[i] ?? 0}`, d.face, level)
          const raw = r.raw == null ? '—' : data.diceTypes[d.type].faces[r.raw]?.value
          return `#${r.index + 1}/${r.of}${r.mirror ? ' mirrored' : ''} (unturned: ${raw}, ${r.seconds.toFixed(2)} s)`
        }).join(' · '),
      )
    })
    return () => {
      live = false
    }
  }, [roll, level, data])
  return <p className="font-pixel-sm text-[16px] text-muted">{line}</p>
}

export function DiceThrowBits() {
  const [roll, setRoll] = useState([0, 0, 0, 0])
  const [picked, setPicked] = useState([false, false, false, false])
  const [slow, setSlow] = useState(false)
  const lab = (level: ThrowLevel | 'off', extra?: DiceLab): DiceLab => ({
    on: true,
    level,
    speed: slow ? 0.25 : 1,
    ...extra,
  })
  const all = () => setRoll((r) => r.map((n) => n + 1))
  const rerollPicked = () => {
    setRoll((r) => r.map((n, i) => (picked[i] ? n + 1 : n)))
    setPicked([false, false, false, false])
  }
  return (
    <>
      <div className="flex w-full flex-wrap gap-2">
        <PixelButton variant="primary" size="sm" onClick={all}>
          Throw all
        </PixelButton>
        <PixelButton size="sm" disabled={!picked.some(Boolean)} onClick={rerollPicked}>
          Reroll picked ({picked.filter(Boolean).length})
        </PixelButton>
        <PixelButton size="sm" variant="ghost" onClick={() => setSlow((s) => !s)}>
          {slow ? 'Game pace' : 'Slow-mo ¼'}
        </PixelButton>
      </div>
      {LEVELS.map(({ level, name }) => (
        <Frame key={level} name={name}>
          <DiceLabContext.Provider value={lab(level)}>
            <Tray
              dice={HAND}
              roll={roll}
              picked={level === 'full' ? picked : undefined}
              onPick={
                level === 'full' ? (i) => setPicked((p) => p.map((v, k) => (k === i ? !v : v))) : undefined
              }
            />
          </DiceLabContext.Provider>
          {level !== 'off' && <Recordings roll={roll} level={level} />}
        </Frame>
      ))}
      <Frame name="mid-throw, frozen at 0.10 s, 0.25 s, 0.40 s and 0.55 s (full)">
        <div className="flex flex-wrap gap-x-6">
          {[0.1, 0.25, 0.4, 0.55].map((at) => (
            <DiceLabContext.Provider key={at} value={lab('full', { freeze: at, speed: 1 })}>
              <Tray dice={HAND.slice(0, 2)} roll={roll} />
            </DiceLabContext.Provider>
          ))}
        </div>
      </Frame>
      <Frame name="every status face, thrown (full); a foe's smaller dice (40 px)">
        <DiceLabContext.Provider value={lab('full')}>
          <Tray dice={STATUS} roll={roll} />
          <Tray dice={HAND} roll={roll} size={40} />
        </DiceLabContext.Provider>
      </Frame>
      <Frame name="at rest (no roll key: never thrown)">
        <div className="flex flex-wrap items-end gap-2">
          {[...HAND, ...STATUS].map((d, i) => (
            <RestingDie key={i} type={d.type} face={d.face} />
          ))}
        </div>
      </Frame>
    </>
  )
}

function RestingDie({ type, face }: { type: DieType; face: number }) {
  const data = useGame((s) => s.data)
  return <Die type={type} face={data.diceTypes[type].faces[face]} size={48} />
}
