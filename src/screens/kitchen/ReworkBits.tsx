// Kitchen sink: the area rework's pieces (docs/15 §6). The button that loads and presses itself (loading, held, its
// restart), the bottom dock, the Pokémon card three to a row (the Center's, the send-out step's brief one, picked,
// fainted, with the lead's crown and a thumb) and a label too long for its button even at its smallest size. Then
// docs/42's: the way into a fight (its bars, played again on a tap) and More details switched from here.
import { useState } from 'react'
import { AutoButton } from '@/components/AutoButton'
import { BottomDock } from '@/components/BottomDock'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { PokeCard } from '@/components/PokeCard'
import type { PokemonInstance } from '@/engine'
import { LeadPicker } from '@/components/LeadPicker'
import { teamOf } from '@/engine'
import { AreaSceneBox } from '@/screens/area/AreaIdle'
import { EncounterSwipe } from '@/screens/battle/EncounterSwipe'
import { TeamXpStrip, type MonRecap } from '@/screens/battle/VictoryView'
import { setSettings, useGame } from '@/store/game'

const mon = (over: Partial<PokemonInstance>): PokemonInstance => ({
  id: 'ks-card',
  dex: 1,
  level: 12,
  xp: 0,
  currentHp: 30,
  caughtAt: 0,
  ...over,
})

const TEAM = [
  mon({ id: 'ks-card-1' }),
  mon({ id: 'ks-card-2', dex: 25, level: 9, currentHp: 8 }),
  mon({ id: 'ks-card-3', dex: 16, level: 7, currentHp: 0 }),
]

export function ReworkBits() {
  const [presses, setPresses] = useState(0)
  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState(TEAM[0]!.id)
  const [swipe, setSwipe] = useState(0)
  const details = useGame((s) => s.settings.details === true)
  const [strip, setStrip] = useState(0)
  const [switchPick, setSwitchPick] = useState(TEAM[1]!.id)
  // The result strip and the area scene read the save: shown with the save this browser holds, if any.
  const save = useGame((s) => s.save)
  const area = useGame((s) => s.data.areas.find((a) => a.id === s.save?.currentAreaId))
  const team = save ? teamOf(save) : []
  const mons: MonRecap[] = team.map((p, i) => ({
    uid: p.id,
    dex: p.dex,
    xp: 12 + i * 5,
    from: i === 0 ? { level: Math.max(1, p.level - 1), xp: 0 } : { level: p.level, xp: 0 },
    shared: i > 0,
    fromLevel: i === 0 ? p.level - 1 : null,
    toLevel: i === 0 ? p.level : null,
    milestones: [],
    evolvesTo: null,
  }))
  return (
    <div className="grid w-full gap-4">
      <div className="grid max-w-md gap-2">
        <b className="text-lg">TeamXpStrip: the result's team (the first levels up), shown one by one</b>
        {mons.length ? (
          <TeamXpStrip key={strip} mons={mons} shown={mons.length} />
        ) : (
          <p className="copy text-muted">Start a game: the strip shows the save's team.</p>
        )}
        <PixelButton size="sm" className="self-start" onClick={() => setStrip((n) => n + 1)}>
          Fill it again
        </PixelButton>
      </div>

      <div className="grid max-w-md gap-2">
        <b className="text-lg">
          The K.O.'s switch: those able to come in, as cards (LeadPicker members); INFO is the fight's sheet
          (FightMonSheet: its HP, dice and stats, no links)
        </b>
        <LeadPicker members={TEAM.slice(0, 2)} value={switchPick} onChange={setSwitchPick} go fight />
      </div>

      {area && (
        <div className="grid max-w-md gap-2">
          <b className="text-lg">AreaSceneBox: the area and its team, over the page between encounters</b>
          <AreaSceneBox area={area} />
        </div>
      )}

      <div className="grid max-w-md gap-2">
        <b className="text-lg">EncounterSwipe: a new fight opens (Game feel on, motion full or short; none when calm)</b>
        <div className="relative aspect-[3/2] overflow-hidden bg-gradient-to-b from-sky-300 to-green-500 shadow-ring">
          <EncounterSwipe key={swipe} />
        </div>
        <PixelButton size="sm" className="self-start" onClick={() => setSwipe((n) => n + 1)}>
          Play it again
        </PixelButton>
      </div>

      <div className="grid max-w-md gap-2">
        <b className="text-lg">More details (docs/42): {details ? 'on' : 'off'}. Off, every card below is brief</b>
        <PixelButton size="sm" className="self-start" onClick={() => setSettings({ details: !details || undefined })}>
          {details ? 'Switch details off' : 'Switch details on'}
        </PixelButton>
      </div>

      <div className="grid max-w-md gap-2">
        <b className="text-lg">AutoButton: loading (pressed {presses}×), held, and again</b>
        <AutoButton key={round} variant="primary" size="lg" className="w-full" onClick={() => setPresses((n) => n + 1)}>
          CONTINUE
        </AutoButton>
        <AutoButton hold variant="primary" size="lg" className="w-full" onClick={() => {}}>
          SKIP (held: no fill)
        </AutoButton>
        <PixelButton size="sm" className="self-start" onClick={() => setRound((n) => n + 1)}>
          Load it again
        </PixelButton>
      </div>

      <div className="grid max-w-md gap-2">
        <b className="text-lg">PokeCard: the Center's (types, HP, the lead's crown), fainted</b>
        <ol className="grid grid-cols-3 gap-1.5">
          {TEAM.map((p, i) => (
            <PokeCard
              key={p.id}
              inst={p}
              onOpen={() => {}}
              badge={i === 0 ? <PixelIcon name="crown" size={16} /> : null}
            />
          ))}
        </ol>
        <b className="text-lg">PokeCard, brief: the send-out step (tap picks, INFO, a thumb against a Water foe)</b>
        <ul className="grid grid-cols-3 gap-1.5">
          {TEAM.map((p) => (
            <PokeCard
              key={p.id}
              inst={p}
              brief
              foe={['water']}
              selected={picked === p.id}
              pressed={picked === p.id}
              onOpen={() => setPicked(p.id)}
            >
              <PixelButton size="sm" className="w-full px-1" onClick={() => {}}>
                INFO
              </PixelButton>
            </PokeCard>
          ))}
        </ul>
      </div>

      <div className="grid max-w-[360px] gap-2">
        <b className="text-lg">A label too long even at 60 %: two lines, never cut</b>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton size="lg" className="whitespace-nowrap px-2">
            NEU WERFEN (2)
          </PixelButton>
          <PixelButton variant="primary" size="lg" className="whitespace-nowrap px-2">
            ANGRIFF
          </PixelButton>
        </div>
      </div>

      <div className="relative h-[220px] max-w-md overflow-auto border-[3px] border-dashed border-shadow px-3">
        <p className="m-0 py-2 text-lg">BottomDock: the buttons stay at the foot while this scrolls.</p>
        {Array.from({ length: 8 }, (_, i) => (
          <p key={i} className="m-0 py-2 text-muted">
            Content {i + 1}
          </p>
        ))}
        <BottomDock>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <PixelButton size="lg">◂ BACK</PixelButton>
            <PixelButton variant="primary" size="lg">
              NEXT ▸
            </PixelButton>
          </div>
        </BottomDock>
      </div>
    </div>
  )
}
