// Kitchen sink: the area loop's deep pass (docs/43 §5.3). A result's moment stamping down (big, small, replayed), the switch on the send-out's
// cards (the turn's, with BACK; a K.O.'s), the forfeit flag, and the scene-and-panel shape of the page between
// encounters with its bar; a find on the stage, of each kind.
import { useState } from 'react'
import {
  instanceMaxHp,
  MONEY,
  monName,
  teamOf,
  type Battler,
  type Encounter,
  type FindRarity,
} from '@/engine'
import { BadgeIcon } from '@/components/BadgeIcon'
import { ForfeitButton } from '@/components/ForfeitButton'
import { PixelButton } from '@/components/PixelButton'
import { AreaSceneBox, AreaTeam } from '@/screens/area/AreaIdle'
import { CenterSign } from '@/screens/area/CenterView'
import { FoundThing, RarityTag } from '@/screens/area/FindView'
import { StagePanel } from '@/screens/area/StagePanel'
import { StageBackground } from '@/screens/battle/BattleStage'
import { SwitchStep } from '@/screens/battle/BattleView'
import { Stamp } from '@/screens/battle/Stamp'
import { CatchCard } from '@/screens/battle/VictoryView'
import { useGame } from '@/store/game'

/** The three kinds of find a step shows (an item from the bag, Pokédollars, a fossil), one of each rarity. */
const FINDS: (Extract<Encounter, { kind: 'item' }> & { rarity: FindRarity })[] = [
  { kind: 'item', entryId: 'ks-potion', itemKey: 'super-potion', qty: 2, rarity: 'common' },
  { kind: 'item', entryId: 'ks-money', itemKey: MONEY, qty: 120, rarity: 'uncommon' },
  { kind: 'item', entryId: 'ks-fossil', itemKey: 'helix-fossil', qty: 1, rarity: 'rare' },
]

export function AreaDeepBits() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const area = useGame((s) => s.data.areas.find((a) => a.id === s.save?.currentAreaId))
  const [replay, setReplay] = useState(0)
  const [switchKey, setSwitchKey] = useState(0)
  const [drop, setDrop] = useState(0)
  // The switch reads the team from the save this browser holds: its Pokémon as a fight's, at their own HP.
  const team = save ? teamOf(save) : []
  const fighters = team.map(
    (p) =>
      ({
        uid: p.id,
        dex: p.dex,
        name: monName(p, data),
        hp: p.currentHp,
        maxHp: instanceMaxHp(p, data),
        level: p.level,
      }) as Battler,
  )
  return (
    <div className="grid w-full gap-6">
      <div className="grid max-w-md gap-3">
        <PixelButton size="sm" onClick={() => setReplay((n) => n + 1)}>
          Stamp again
        </PixelButton>
        <Stamp weight="big" replay={replay}>
          <div className="flex items-center justify-center gap-3 bg-gold p-2 text-center shadow-ring">
            <BadgeIcon badge="Boulder Badge" earned size={36} />
            <div className="text-2xl leading-none">Big: a badge (with the game feel and full motion)</div>
          </div>
        </Stamp>
        <Stamp weight="small" replay={replay}>
          <CatchCard dex={25} level={9} joined isNew />
        </Stamp>
      </div>

      {fighters.length > 1 ? (
        <div className="flex flex-wrap gap-6">
          <div className="flex w-[380px] max-w-full flex-col gap-2">
            <b className="text-lg">The turn&apos;s switch: the cards, BACK, GO!, the flag</b>
            <SwitchStep
              key={`turn-${switchKey}`}
              options={fighters.slice(1)}
              first={fighters[fighters.length - 1]?.uid}
              foe={19}
              onPick={() => setSwitchKey((n) => n + 1)}
              onBack={() => setSwitchKey((n) => n + 1)}
            />
          </div>
          <div className="flex w-[380px] max-w-full flex-col gap-2">
            <b className="text-lg">A K.O.&apos;s switch: GO! and the flag</b>
            <SwitchStep key={`ko-${switchKey}`} options={fighters.slice(1)} foe={19} onPick={() => {}} />
          </div>
        </div>
      ) : (
        <p className="text-lg">The switch shows with a save of two Pokémon or more.</p>
      )}

      <div className="flex w-[380px] max-w-full flex-col gap-2">
        <b className="text-lg">The last one standing taps its pip: nobody to send in, BACK and the flag</b>
        <SwitchStep options={[]} foe={19} onPick={() => {}} onBack={() => {}} />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-lg">The forfeit flag, at the side of a GO! row:</span>
        <ForfeitButton flag />
      </div>

      <div className="grid gap-2">
        <b className="text-lg">
          A find dropping on the stage (FindView), with its rarity: common, uncommon, rare
        </b>
        <div className="grid gap-2 md:grid-cols-3">
          {FINDS.map(({ rarity, ...f }) => (
            <div key={f.itemKey} className="grid gap-1.5">
              <div className="relative isolate aspect-[3/2] overflow-hidden shadow-ledge">
                <StageBackground art={null} zones={false} />
                <FoundThing key={drop} enc={f} isMoney={f.itemKey === MONEY} rarity={rarity} />
              </div>
              <div className="flex justify-center">
                <RarityTag rarity={rarity} />
              </div>
            </div>
          ))}
        </div>
        <PixelButton size="sm" className="self-start" onClick={() => setDrop((n) => n + 1)}>
          Drop them again
        </PixelButton>
      </div>

      <div className="grid max-w-md gap-2">
        <b className="text-lg">Inside a Pokémon Center: its sign under the round&apos;s strip</b>
        <CenterSign />
      </div>

      {area && (
        <div className="grid gap-2">
          <b className="text-lg">
            The page between encounters: the scene and its panel (PC: docked, as tall)
          </b>
          <StagePanel
            scene={<AreaSceneBox area={area} />}
            bar={
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
                <PixelButton size="lg">HOME</PixelButton>
                <PixelButton size="lg" variant="primary">
                  CONTINUE
                </PixelButton>
              </div>
            }
          >
            <AreaTeam />
          </StagePanel>
          <b className="text-lg">
            The Center&apos;s: stacked on every screen (its sign on top, the team the page&apos;s width)
          </b>
          <StagePanel
            stacked
            scene={<CenterSign />}
            bar={
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
                <PixelButton size="lg">HOME</PixelButton>
                <PixelButton size="lg" variant="primary">
                  CONTINUE
                </PixelButton>
              </div>
            }
          >
            <AreaTeam />
          </StagePanel>
        </div>
      )}
    </div>
  )
}
