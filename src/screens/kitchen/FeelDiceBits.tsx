// Kitchen sink (dev only): the dice and the readout's game feel (docs/38 §3), whatever the admin's switch says. A
// tray thrown at each combo tier, its count-up played at full, short or off; the dice's states (a pick's ↻ tag, the
// combo's brackets and its four rings, the last die's squash, the last reroll's jitter, dice in hand, the foe's); the
// readout before its combo lands, counting, and done.
import { useMemo, useState, type ReactNode } from 'react'
import { comboDice, computeDamage, statusesFromRoll, type RolledDie } from '@/engine'
import { Die } from '@/components/Die'
import { PixelButton } from '@/components/PixelButton'
import { MotionCap, type MotionLevel } from '@/lib/motion'
import { useGame } from '@/store/game'
import {
  DiceTray,
  Readout,
  trayKeyOf,
  useDamageReveal,
  type Preview,
  type ScoreView,
} from '../battle/BattlePanel'

/** A hand per combo tier, on base dice (faces 1–6 at 0–5). */
const HANDS: { name: string; faces: number[] }[] = [
  { name: 'no combo', faces: [0, 2, 4, 5] },
  { name: 'tier 1: a pair', faces: [3, 3, 0, 1] },
  { name: 'tier 2: three of a kind', faces: [4, 4, 4, 0] },
  { name: 'tier 3: four of a kind', faces: [5, 5, 5, 5, 1] },
  { name: 'tier 4: five of a kind', faces: [2, 2, 2, 2, 2] },
]
const LEVELS: MotionLevel[] = ['full', 'short', 'off']

function usePreview(faces: number[]): { dice: RolledDie[]; preview: Preview } {
  const data = useGame((s) => s.data)
  return useMemo(() => {
    const dice = faces.map((faceIndex) => ({ type: 'base' as const, faceIndex }))
    const r = computeDamage(dice, ['normal'], ['normal'], { comboLevels: {}, dieLevels: {} }, data)
    return { dice, preview: { r, statuses: statusesFromRoll(dice, data), almost: [], recoil: 0 } }
  }, [faces, data])
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className="flex flex-wrap items-end gap-4 pt-4">{children}</div>
    </div>
  )
}

/** A tray as the battle plays it: thrown, down, then the readout's count-up. */
function Played({ hand, roll }: { hand: number[]; roll: number }) {
  const { dice, preview } = usePreview(hand)
  const [landed, setLanded] = useState('')
  const tray = { side: 'player' as const, dice, keys: dice.map((_, i) => `kf${roll}-${i}`) }
  const key = trayKeyOf(tray)
  const reveal = useDamageReveal(preview, landed === key, key, true)
  const r = reveal.preview?.r
  const ring = new Set(
    r?.combo && reveal.combo
      ? comboDice(
          r.perDie.map((p) => p.value),
          r.combo.key,
        )
      : [],
  )
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-2 pt-6">
      <DiceTray
        tray={tray}
        live
        selected={[]}
        combo={ring}
        size={54}
        foeName="Rattata"
        onSettled={setLanded}
        feel
        score={reveal.score}
      />
      <div className="flex min-h-[30px] flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {reveal.preview && (
          <Readout
            preview={reveal.preview}
            activeName="Eevee"
            open={false}
            onToggle={() => {}}
            score={reveal.score}
          />
        )}
      </div>
    </div>
  )
}

export function FeelDiceBits() {
  const [roll, setRoll] = useState(0)
  const [level, setLevel] = useState<MotionLevel>('full')
  const [squash, setSquash] = useState(0)
  const [jitter, setJitter] = useState(0)
  const { preview } = usePreview(HANDS[3]!.faces)
  const counting: ScoreView = { id: -1, pops: [], key: 'four_kind', tier: 3, combo: false, value: 9 }
  return (
    <>
      <div className="flex w-full flex-wrap gap-2">
        <PixelButton variant="primary" size="sm" onClick={() => setRoll((n) => n + 1)}>
          Throw
        </PixelButton>
        {LEVELS.map((l) => (
          <PixelButton
            key={l}
            size="sm"
            variant={l === level ? 'gold' : 'secondary'}
            onClick={() => setLevel(l)}
          >
            {l}
          </PixelButton>
        ))}
      </div>
      <MotionCap.Provider value={level === 'full' ? null : level}>
        {HANDS.map((h) => (
          <Row key={h.name} name={`${h.name} (count-up at ${level})`}>
            <Played hand={h.faces} roll={roll} />
          </Row>
        ))}
      </MotionCap.Provider>
      <Row name="a pick (↻ tag), the combo's brackets and its rings (tiers 1–4), a pick before the last reroll (jitter)">
        <Die type="fire" face={{ kind: 'number', value: 3 }} selected />
        {([1, 2, 3, 4] as const).map((t) => (
          <Die key={t} type="water" face={{ kind: 'number', value: 5 }} combo tier={t} label={`tier ${t}`} />
        ))}
        <Die type="grass" face={{ kind: 'number', value: 2 }} selected jitter />
      </Row>
      <Row name="the last die down (squash, replay it), dice in hand before a throw, the foe's (40 px, in hand and down)">
        <span onClick={() => setSquash((n) => n + 1)}>
          <Die key={squash} type="electric" face={{ kind: 'number', value: 6 }} squash label="squash" />
        </span>
        <Die type="fire" face={null} />
        <Die type="base" face={null} />
        <Die type="normal" face={null} size={40} locked />
        <Die type="normal" face={{ kind: 'number', value: 4 }} size={40} locked />
      </Row>
      <Row name="the tray's jitter before a throw (replay it); the readout counting, before its combo lands">
        <PixelButton size="sm" onClick={() => setJitter((n) => n + 1)}>
          Jitter
        </PixelButton>
        <div className="w-[300px]">
          <DiceTray
            tray={null}
            live={false}
            selected={[]}
            combo={new Set()}
            size={48}
            foeName="Rattata"
            hand={{ side: 'player', dice: ['fire', 'base', 'base'] }}
            anticipate={jitter}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Readout preview={preview} activeName="Eevee" open={false} onToggle={() => {}} score={counting} />
        </div>
      </Row>
    </>
  )
}
