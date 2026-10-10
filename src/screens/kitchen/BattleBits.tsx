// Kitchen sink (dev only): the battle screen's pieces, with made-up battlers. Not translated beyond what the
// components themselves say.
import { useMemo, useState } from 'react'
import {
  comboDice,
  computeDamage,
  createRng,
  makeBattler,
  rollDie,
  statusesFromRoll,
  type RolledDie,
} from '@/engine'
import { Toggle } from '@/components/Toggle'
import { useGame } from '@/store/game'
import { BagButton, DiceTray, Readout, TeamColumn, TeamPips, type Preview } from '../battle/BattlePanel'
import { BattleStage } from '../battle/BattleStage'
import { CatchPanel } from '../battle/CatchPanel'
import { FoePlate, OwnPlate } from '../battle/Plates'
import type { Fx } from '../battle/useBattleAnimator'

export function BattleBits() {
  const data = useGame((s) => s.data)
  const [calling, setCalling] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<boolean[]>([false, false, true])
  const { own, foe, team, dice } = useMemo(() => {
    const own = makeBattler({ uid: 'k-own', dex: 6, level: 36, hp: 80 }, data)
    const foe = { ...makeBattler({ uid: 'k-foe', dex: 130, level: 30, hp: 60 }, data), mega: false }
    const team = [
      own,
      makeBattler({ uid: 'k-2', dex: 25, level: 30, hp: 40 }, data),
      makeBattler({ uid: 'k-3', dex: 9, level: 32, hp: 0 }, data),
    ]
    const rng = createRng(7)
    // A pair, so the combo ring shows.
    const first = rollDie(own.dice[0] ?? 'base', data, rng)
    const dice: RolledDie[] = [first, { ...first }, ...own.dice.slice(2).map((ty) => rollDie(ty, data, rng))]
    return { own, foe, team, dice }
  }, [data])
  const preview = useMemo<Preview>(() => {
    const r = computeDamage(dice, own.types, foe.types, { comboLevels: {}, dieLevels: {} }, data)
    return {
      r,
      statuses: statusesFromRoll(dice, data),
      almost: [{ status: 'burn', have: 0, need: 1, value: 0 }],
      recoil: 0,
    }
  }, [dice, own, foe, data])
  const ring = new Set(
    preview.r.combo
      ? comboDice(
          preview.r.perDie.map((p) => p.value),
          preview.r.combo.key,
        )
      : [],
  )
  const fx: Fx = {
    cursor: 0,
    message: '',
    hp: {},
    activeUid: own.uid,
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
    <>
      <div className="w-full max-w-[400px]">
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
          label="Battle stage"
        >
          <FoePlate b={foe} hp={foe.hp} party={{ count: 3, index: 1 }} />
          <OwnPlate b={own} hp={own.hp} />
        </BattleStage>
      </div>
      <div className="flex w-full max-w-[400px] flex-col gap-2">
        <DiceTray
          tray={{ side: 'player', dice, keys: dice.map((_, i) => `k${i}`) }}
          live
          selected={selected}
          combo={ring}
          onToggle={(i) => setSelected((s) => s.map((v, k) => (k === i ? !v : v)))}
          size={54}
          foeName={foe.name}
        />
        <div className="flex min-h-[30px] flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Readout preview={preview} activeName={own.name} open={open} onToggle={() => setOpen((v) => !v)} />
        </div>
        <DiceTray
          tray={{ side: 'enemy', dice: dice.slice(0, 2), keys: ['f0', 'f1'] }}
          live={false}
          selected={[]}
          combo={new Set()}
          size={54}
          foeName={foe.name}
        />
        <div className="flex items-center gap-2">
          <BagButton disabled={false} onClick={() => {}} />
          <BagButton disabled onClick={() => {}} />
          <div className="ml-auto">
            <TeamPips
              team={team}
              activeUid={own.uid}
              hpOf={(b) => b.hp}
              canSwitch
              calling={calling}
              onPick={() => {}}
            />
          </div>
        </div>
        {/* Wide screens: the same team as a column of cards, left of the stage. */}
        <div className="w-[220px]">
          <TeamColumn
            team={team}
            activeUid={own.uid}
            hpOf={(b) => b.hp}
            canSwitch
            calling={calling}
            onPick={() => {}}
          />
        </div>
        <Toggle label="Who goes out next? (pips call)" on={calling} onChange={setCalling} />
      </div>
      <div className="flex w-full max-w-[400px] flex-col gap-2">
        <CatchPanel
          c={{ dex: 130, level: 30, kind: 'wild', target: { mode: 'new' }, result: null }}
          onThrow={() => {}}
          revealed={false}
        />
      </div>
    </>
  )
}
