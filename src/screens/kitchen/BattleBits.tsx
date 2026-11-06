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
import { useGame, type CatchState, type CatchThrow } from '@/store/game'
import { BagButton, DiceTray, Readout, KeyHints, TeamPips, type Preview } from '../battle/BattlePanel'
import { BattleStage } from '../battle/BattleStage'
import { CatchPanel, catchMessage } from '../battle/CatchPanel'
import { FoePlate, OwnPlate } from '../battle/Plates'
import type { Fx } from '../battle/useBattleAnimator'
import { RaidSpeedButton } from '../events/RaidView'

// A wild Gyarados worn out, and a Poké Ball throw that fell 2 short (4 + 1 < 7): what the Bait and Capture Luck do next.
const CATCH_WILD: CatchState = { dex: 130, level: 30, kind: 'wild', target: { mode: 'new' }, result: null }
const SHORT: CatchThrow = {
  die: 4,
  bonus: 1,
  total: 5,
  need: 7,
  caught: false,
  ballKey: 'poke-ball',
  events: [],
  pendingCatchId: null,
}
const CATCH_AFTER: [string, CatchThrow][] = [
  ['Short by 2, a Bait in the bag: asked', { ...SHORT, baitOffer: 'bait' }],
  ['The Bait thrown: +2, caught', { ...SHORT, bait: 2, total: 7, caught: true, baited: 'used' }],
  ['The Bait thrown: +1, still short', { ...SHORT, bait: 1, total: 6, baited: 'used' }],
  ['Missed, but Capture Luck kept it on the spot', { ...SHORT, stays: true }],
]

export function BattleBits() {
  const data = useGame((s) => s.data)
  const [calling, setCalling] = useState(false)
  const [open, setOpen] = useState(false)
  const [fast, setFast] = useState(false)
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
      // Every counter the chips can show: the roll's own (Burn's stacks), a Paralysis's chance, a confusion's level, a heal.
      statuses: [
        ...statusesFromRoll(dice, data),
        { status: 'paralyze', chance: 0.5 },
        { status: 'confuse', level: 2 },
        { status: 'heal', amount: 7 },
      ],
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
    foeUid: foe.uid,
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
        {/* A raid's bottom row: your raid team as compact pips, the speed button off (×1) and on (×1.5). */}
        <div className="flex items-center gap-2">
          <TeamPips
            compact
            team={team}
            activeUid={own.uid}
            hpOf={(b) => b.hp}
            canSwitch
            calling={calling}
            onPick={() => {}}
          />
          <div className="ml-auto flex items-center gap-1.5">
            <RaidSpeedButton on={fast} onChange={setFast} />
            <RaidSpeedButton on onChange={() => {}} />
          </div>
        </div>
        {/* The keys' line (docs/43 §5.3): on a computer, faint until the panel is hovered or focused. */}
        <div className="group/panel">
          <KeyHints
            keys={[
              ['1–6', 'dice'],
              ['R', 'reroll'],
              ['Space', 'attack'],
              ['B', 'Bag'],
              ['S', 'switch'],
            ]}
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
      {/* Idle (docs/36): the ball it picked, shown chosen a moment before it flies. */}
      <div className="flex w-full max-w-[400px] flex-col gap-2">
        <CatchPanel c={CATCH_WILD} picked="poke-ball" onThrow={() => {}} revealed={false} />
        <small className="font-pixel-sm text-[16px] text-muted">Idle&apos;s pick: Poké Ball</small>
      </div>
      {/* The Bait and Capture Luck (docs/25): asked after a short throw, the bait die added, kept on the spot. */}
      {CATCH_AFTER.map(([label, result]) => (
        <div key={label} className="flex w-full max-w-[400px] flex-col gap-2">
          <p className="pixel-dialogue m-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]">
            {catchMessage({ ...CATCH_WILD, result }, 'Gyarados', { revealed: true })}
          </p>
          <CatchPanel
            c={{ ...CATCH_WILD, result }}
            onThrow={() => {}}
            revealed
            onBait={() => {}}
            onRetry={() => {}}
          />
          <small className="font-pixel-sm text-[16px] text-muted">{label}</small>
        </div>
      ))}
    </>
  )
}
