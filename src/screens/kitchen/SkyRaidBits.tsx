// Kitchen sink: Rayquaza's raids in the sky (docs/15 §14): the raid's stage (the day over a sea of clouds, the Sky
// Pillar's far towers, Rayquaza on a pillar's top, yours on another over the clouds). The entrance is on
// /kitchen-sink/fx (and plays in the raid intro, `world="sky"`).
import { useMemo } from 'react'
import { makeBattler } from '@/engine'
import { RAYQUAZA } from '@/fx/timelines/skyRaid'
import { useGame } from '@/store/game'
import { BattleStage } from '../battle/BattleStage'
import type { Fx } from '../battle/useBattleAnimator'

export function SkyRaidBits() {
  const data = useGame((s) => s.data)
  const { own, foe } = useMemo(
    () => ({
      own: makeBattler({ uid: 'k-sky-own', dex: 149, level: 70, hp: 250 }, data),
      foe: { ...makeBattler({ uid: 'k-sky-foe', dex: RAYQUAZA, level: 70, hp: 600 }, data), mega: false },
    }),
    [data],
  )
  const fx: Fx = {
    cursor: 0,
    message: '',
    hp: {},
    activeUid: own.uid,
    foeUid: 'enemy',
    fainted: {},
    dex: {},
    wornOut: {},
    tray: null,
    pop: null,
    banner: null,
    shake: null,
    flash: null,
    status: null,
    fly: null,
    scene: null,
    chip: null,
    cry: null,
  }
  return (
    <div className="grid max-w-[560px] gap-2">
      <BattleStage
        own={own}
        foe={foe}
        fx={fx}
        ownShown
        foeShown
        trainer={null}
        overlay={null}
        onContact={() => {}}
        onSceneDone={() => {}}
        tapLabel={(b) => b.name}
        label="Rayquaza's raid stage"
        world="sky"
      />
      <p className="pixel-dialogue m-0 px-3 py-1.5 text-[20px]">
        The raid&apos;s message box, under the sky.
      </p>
    </div>
  )
}
