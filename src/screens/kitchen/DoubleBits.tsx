// Kitchen sink (dev only): double battles' pieces (docs/31) — the four-Pokémon stage, its name-less plates, the target
// picker, the preview's tag with its INFO and rules, and the lead picker sending two. Made-up battlers.
import { useMemo, useState } from 'react'
import { makeBattler, type Battler } from '@/engine'
import { DoubleRulesModal, DoubleTag } from '@/components/DoubleBattle'
import { LeadPicker } from '@/components/LeadPicker'
import { PixelButton } from '@/components/PixelButton'
import { Toggle } from '@/components/Toggle'
import { useGame } from '@/store/game'
import { BattleStage } from '../battle/BattleStage'
import { DoublePlates, MiniPlate, TargetPicker } from '../battle/DoublePlates'
import type { Fx } from '../battle/useBattleAnimator'

const fxFor = (own: Battler, foe: Battler, fainted: Record<string, boolean> = {}): Fx => ({
  cursor: 0,
  message: '',
  hp: {},
  activeUid: own.uid,
  foeUid: foe.uid,
  fainted,
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
})

export function DoubleBits() {
  const data = useGame((s) => s.data)
  const [swap, setSwap] = useState(false)
  const [aim, setAim] = useState(0)
  const [rules, setRules] = useState(false)
  const [leads, setLeads] = useState<string[]>([])
  const { own, foes } = useMemo(() => {
    const own = [
      makeBattler({ uid: 'd-own1', dex: 311, level: 30, hp: 70 }, data),
      makeBattler({ uid: 'd-own2', dex: 312, level: 30, hp: 30 }, data),
    ]
    const foes = [
      makeBattler({ uid: 'd-foe1', dex: 337, level: 42, hp: 120 }, data),
      { ...makeBattler({ uid: 'd-foe2', dex: 338, level: 42, hp: 40 }, data), mega: true },
    ]
    return { own, foes }
  }, [data])
  // Whose turn it is decides who stands in front: toggle it to watch them change places.
  const front = swap ? own[1]! : own[0]!
  const back = swap ? own[0]! : own[1]!
  const target = foes[aim]!
  const other = foes[1 - aim]!
  const plates = (fainted: Record<string, boolean> = {}) => (
    <DoublePlates
      foes={foes}
      own={own}
      frontFoe={target.uid}
      frontOwn={front.uid}
      hpOf={(b) => b.hp}
      faintedOf={(b) => !!fainted[b.uid]}
      party={{ count: 3, index: fainted[foes[1]!.uid] ? 1 : 0 }}
    />
  )
  return (
    <>
      <div className="flex w-full max-w-[400px] flex-col gap-2">
        <BattleStage
          own={front}
          foe={target}
          double
          ownBack={back}
          foeBack={other}
          onAim={(b) => setAim(foes.findIndex((f) => f.uid === b.uid))}
          aimLabel={(b) => `Attack ${b.name}`}
          fx={fxFor(front, target)}
          ownShown
          foeShown
          trainer={null}
          overlay={null}
          onContact={() => {}}
          onSceneDone={() => {}}
          tapLabel={(b) => b.name}
          label="Double battle stage"
        >
          {plates()}
        </BattleStage>
        <Toggle label="Partner's turn (they change places)" on={swap} onChange={setSwap} />
        <TargetPicker
          foes={foes}
          target={target.uid}
          hpOf={(b) => b.hp}
          onPick={(b) => setAim(foes.indexOf(b))}
        />
        <TargetPicker foes={foes} target={target.uid} hpOf={(b) => b.hp} onPick={() => {}} disabled />
      </div>
      {/* One of each side K.O.'d: its plate greys, a 1 v 2 left. */}
      <div className="w-full max-w-[400px]">
        <BattleStage
          own={own[0]!}
          foe={foes[0]!}
          double
          ownBack={own[1]}
          foeBack={foes[1]}
          fx={fxFor(own[0]!, foes[0]!, { [own[1]!.uid]: true, [foes[1]!.uid]: true })}
          ownShown
          foeShown
          trainer={null}
          overlay={null}
          onContact={() => {}}
          onSceneDone={() => {}}
          tapLabel={(b) => b.name}
          label="Double battle stage, one K.O. on each side"
        >
          {plates({ [own[1]!.uid]: true, [foes[1]!.uid]: true })}
        </BattleStage>
      </div>
      <div className="flex w-full max-w-[400px] flex-col gap-2">
        <MiniPlate b={foes[0]!} hp={foes[0]!.hp} foe front={false} />
        <MiniPlate b={foes[1]!} hp={foes[1]!.hp} foe front />
        <MiniPlate b={own[0]!} hp={own[0]!.hp} foe={false} front />
        <MiniPlate b={own[1]!} hp={0} foe={false} front={false} fainted />
        <DoubleTag />
        <PixelButton onClick={() => setRules(true)}>Rules pop-up</PixelButton>
        <DoubleRulesModal open={rules} onClose={() => setRules(false)} />
        <LeadPicker value={null} onChange={() => {}} pair={{ value: leads, onChange: setLeads }} />
      </div>
    </>
  )
}
