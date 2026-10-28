// Kitchen sink (dev only): the battle stage's game feel (docs/38 §2) — a shiny's entrance, hits of each weight (the
// damage number, the shake, the settle that hands the stage back while the particles fade), the K.O.'s boss stop and
// its drop through the platform. Made-up battlers; the timelines frame by frame are on /kitchen-sink/fx.
import { useMemo, useState } from 'react'
import { hitPower, makeBattler } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { Toggle } from '@/components/Toggle'
import { useGame } from '@/store/game'
import { BattleStage } from '../battle/BattleStage'
import { FoePlate, OwnPlate } from '../battle/Plates'
import type { Fx, Scene, SceneHit } from '../battle/useBattleAnimator'

/** A hit of each weight, as the log reads one. */
const HITS: [string, number, SceneHit][] = [
  [
    'Resisted',
    3,
    { tone: 'weak', sound: 'hit', power: hitPower({ effectiveness: 0.5, damage: 3, maxHp: 90 }) },
  ],
  [
    'Plain',
    12,
    { tone: 'normal', sound: 'hit', power: hitPower({ effectiveness: 1, damage: 12, maxHp: 90 }) },
  ],
  [
    'Super effective, full house',
    64,
    {
      tone: 'super',
      sound: 'super',
      power: hitPower({ effectiveness: 2, combo: 'full_house', damage: 64, maxHp: 90 }),
    },
  ],
  [
    'K.O.',
    90,
    { tone: 'super', sound: 'super', power: hitPower({ effectiveness: 2, damage: 90, maxHp: 90, ko: true }) },
  ],
]

export function HitFeelBits() {
  const data = useGame((s) => s.data)
  const [take, setTake] = useState(0)
  const [scene, setScene] = useState<Scene | null>(null)
  const [down, setDown] = useState<{ foe: boolean; own: boolean }>({ foe: false, own: false })
  const { own, foe } = useMemo(
    () => ({
      own: makeBattler({ uid: 'f-own', dex: 25, level: 30, hp: 70 }, data),
      foe: { ...makeBattler({ uid: 'f-foe', dex: 130, level: 30, hp: 90 }, data), shiny: true },
    }),
    [data],
  )
  const fx: Fx = {
    cursor: 0,
    message: '',
    hp: {},
    activeUid: own.uid,
    foeUid: foe.uid,
    fainted: { [foe.uid]: down.foe, [own.uid]: down.own },
    dex: {},
    wornOut: {},
    tray: null,
    pop: null,
    banner: null,
    shake: null,
    flash: null,
    status: null,
    fly: null,
    scene,
    chip: null,
    cry: null,
  }
  const strike = (damage: number, hit: SceneHit) => {
    setDown({ foe: false, own: false })
    setScene({ id: Date.now(), cursor: 0, kind: 'attack', side: 'player', type: 'electric', damage, hit })
  }
  return (
    <>
      <div className="w-full max-w-[400px]">
        {/* A new take: the shiny comes out again. */}
        <BattleStage
          key={take}
          own={own}
          foe={foe}
          fx={fx}
          ownShown
          foeShown
          trainer={null}
          overlay={null}
          onContact={() => {}}
          onSceneDone={() => {
            // The log would play the K.O. next: the drop.
            if (scene?.hit?.power.ko) setDown((d) => ({ ...d, foe: true }))
            setScene(null)
          }}
          tapLabel={(b) => b.name}
          label="Battle stage, game feel"
        >
          <FoePlate b={foe} hp={down.foe ? 0 : foe.hp} />
          <OwnPlate b={own} hp={down.own ? 0 : own.hp} />
        </BattleStage>
      </div>
      <div className="flex w-full max-w-[400px] flex-col gap-2">
        <PixelButton size="sm" onClick={() => setTake((k) => k + 1)}>
          Shiny entrance again
        </PixelButton>
        <div className="flex flex-wrap gap-2">
          {HITS.map(([name, damage, hit]) => (
            <PixelButton key={name} size="sm" disabled={!!scene} onClick={() => strike(damage, hit)}>
              {name}
            </PixelButton>
          ))}
        </div>
        <Toggle
          label="Foe K.O. (the drop)"
          on={down.foe}
          onChange={(v) => setDown((d) => ({ ...d, foe: v }))}
        />
        <Toggle
          label="Yours K.O. (the drop)"
          on={down.own}
          onChange={(v) => setDown((d) => ({ ...d, own: v }))}
        />
      </div>
    </>
  )
}
