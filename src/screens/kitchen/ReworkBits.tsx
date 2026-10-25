// Kitchen sink: the area rework's pieces (docs/15 §6). The button that loads and presses itself (loading, held, its
// restart), the bottom dock, the Pokémon card three to a row (the Center's, the send-out step's brief one, picked,
// fainted, with the lead's crown and a thumb) and a label too long for its button even at its smallest size.
import { useState } from 'react'
import { AutoButton } from '@/components/AutoButton'
import { BottomDock } from '@/components/BottomDock'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { PokeCard } from '@/components/PokeCard'
import type { PokemonInstance } from '@/engine'

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
  return (
    <div className="grid w-full gap-4">
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
