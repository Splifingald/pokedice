// Kitchen sink: Small worlds' pieces (docs/21) in every state — Home's square (a fresh start, played, the last day,
// the mythical caught), the pop-up, the partner pick in the world's colours, the strip (running, the last day, content
// not in yet), the squares inside (the mythical waiting, ready, gone home, waiting for its region; the Mart), the
// booster chips and the dice level tag, the mythical's result card, the closing pop-up (kept, got away, never entered,
// with its Pokémon gone home), the lock of a Pokémon waiting in its region (docs/26 §1) and the page the main game's
// screens show inside a world.
import { useMemo, useState } from 'react'
import { newSmallWorld, type SmallWorld, type WorldBye } from '@/engine'
import { HomerLockView } from '@/components/HomerLock'
import { PartnerMoment } from '@/components/PartnerMoment'
import { PixelButton } from '@/components/PixelButton'
import { DiceLevelTag } from '@/screens/battle/Plates'
import {
  BoosterChip,
  MartSquare,
  MythicalSquare,
  WorldAwayView,
  WorldByeView,
  WorldMythicalCard,
  WorldPopupView,
  WorldRules,
  WorldSquareView,
  WorldStripView,
} from '@/screens/events/world'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A world like the Visual Lab's Mirage Island, ten days long, `done` of it gone by. */
function sampleWorld(now: number, done: number): SmallWorld {
  const start = now - done
  return {
    ...newSmallWorld('sink-world', 'kanto', new Date(start).toISOString(), new Date(start + 10 * DAY).toISOString()),
    title: { en: 'Mirage Island' },
    banner: 'flowers',
    theme: { main: '#5b3a9e', accent: '#ff6f9c', ground: '#efe6fb' },
    minBadges: 3,
    starters: [63, 92, 79],
    xpMultiplier: 5,
    boosters: [
      { type: 'psychic', multiplier: 1.5 },
      { type: 'ghost', multiplier: 2 },
    ],
    shop: [
      { key: 'great-ball', price: 60, limit: null },
      { key: 'ultra-ball', price: 150, limit: 10 },
      { key: 'rare-candy', price: 400, limit: 5 },
    ],
    mythical: { dex: 151, level: 60, areaId: '' },
  }
}

const noop = () => {}

export function WorldBits() {
  const now = useMemo(() => Date.now(), [])
  const mid = useMemo(() => sampleWorld(now, 5 * DAY), [now])
  const last = useMemo(() => sampleWorld(now, 10 * DAY - 9 * HOUR), [now])
  const fresh = useMemo(() => sampleWorld(now, 2 * HOUR), [now])
  const [popup, setPopup] = useState(false)
  const [pick, setPick] = useState(false)
  const [bye, setBye] = useState<WorldBye | null>(null)
  const byes: Record<string, WorldBye> = {
    kept: { id: mid.id, world: mid, entered: true, caught: true, partner: 63, home: { kanto: 8, johto: 5, sinnoh: 3 } },
    gone: { id: mid.id, world: mid, entered: true, caught: false, partner: 92, home: { kanto: 1 } },
    never: { id: mid.id, world: mid, entered: false, caught: false, partner: null, home: {} },
  }
  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setPopup(true)}>
          The pop-up
        </PixelButton>
        <PixelButton size="sm" onClick={() => setPick(true)}>
          Partner pick
        </PixelButton>
        <PixelButton size="sm" onClick={() => setBye(byes.kept!)}>
          Closed: kept
        </PixelButton>
        <PixelButton size="sm" onClick={() => setBye(byes.gone!)}>
          Closed: got away
        </PixelButton>
        <PixelButton size="sm" onClick={() => setBye(byes.never!)}>
          Closed: never entered
        </PixelButton>
      </div>
      <div className="grid max-w-[600px] grid-cols-2 gap-2.5">
        <WorldSquareView world={fresh} now={now} cleared={0} total={6} partner={null} caught={false} onClick={noop} />
        <WorldSquareView world={mid} now={now} cleared={3} total={6} partner="Abra" caught={false} onClick={noop} />
        <WorldSquareView world={last} now={now} cleared={5} total={6} partner="Gastly" caught={false} onClick={noop} />
        <WorldSquareView world={last} now={now} cleared={6} total={6} partner="Gastly" caught onClick={noop} />
      </div>
      <div className="grid max-w-[600px] gap-2">
        <WorldStripView world={mid} now={now} back="Kanto" onBack={noop} />
        <WorldStripView world={last} now={now} back="Johto" onBack={noop} />
        <WorldStripView world={null} now={now} back="Kanto" onBack={noop} />
      </div>
      <div className="grid max-w-[600px] grid-cols-2 gap-2.5">
        <MythicalSquare world={mid} caught={false} state="In Dream Peak" onClick={noop} />
        <MythicalSquare world={mid} caught={false} state="Waiting: fight it!" onClick={noop} />
        <MythicalSquare world={mid} caught state="In your Kanto Box" onClick={noop} />
        <MythicalSquare world={mid} caught state="Waits for Johto" onClick={noop} />
        <MartSquare world={mid} gold={1240} onClick={noop} />
        <MartSquare world={mid} gold={0} onClick={noop} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BoosterChip type="psychic" n={1.5} />
        <BoosterChip type="ghost" n={2} />
        <BoosterChip type="fire" n={1.25} />
        <DiceLevelTag level={5} />
        <DiceLevelTag level={55} />
        <DiceLevelTag level={100} />
      </div>
      <div className="grid max-w-md gap-2">
        <WorldMythicalCard dex={151} region="kanto" waiting={false} />
        <WorldMythicalCard dex={251} region="johto" waiting />
      </div>
      <div className="max-w-md">
        <WorldRules world={mid} />
      </div>
      <div className="grid max-w-md gap-2">
        <HomerLockView name="Gengar" level={42} best={31} region="Kanto" world="Mirage Island" />
        <HomerLockView name="Boo" level={60} best={0} region="Sinnoh" world={null} />
      </div>
      <div className="grid max-w-md gap-2">
        <WorldAwayView world={mid} kind="events" back="Kanto" onBack={noop} />
        <WorldAwayView world={mid} kind="main" back="Kanto" onBack={noop} />
      </div>
      <WorldPopupView world={mid} now={now} open={popup} onLater={() => setPopup(false)} onEnter={() => setPopup(false)} />
      {bye && <WorldByeView bye={bye} open onOk={() => setBye(null)} />}
      {pick && (
        <PartnerMoment
          starters={mid.starters}
          regionId={mid.regionId}
          regionName="Mirage Island"
          level={5}
          theme={mid.theme}
          onLeave={() => setPick(false)}
          onPick={() => setPick(false)}
        />
      )}
    </div>
  )
}
