// Kitchen sink (dev only): the Underground (docs/34) — the cave, the crack gauge (fresh, under way, shaking, collapsed),
// a wall in every state (fresh, half dug with a thing half uncovered, a strike flashing, cleared, collapsing), the
// pickaxe die (unrolled, rolled) and its faces (now, the next level's), orbs of every colour and size, plates, the
// haul (every outcome), the plates grid (none, some), the orb bag, the team seats (solo, two, full) and the rules.
import { useState, type ReactNode } from 'react'
import { DEFAULT_CONFIG, ORB_COLOURS, ORB_SIZES, type HaulLine, type Wall } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import {
  CrackGauge,
  HaulList,
  OrbArt,
  OrbBagTable,
  PickaxeDie,
  PickaxeFaces,
  PlateArt,
  PlateGrid,
  UgCave,
  UgRulesModal,
  UgWall,
} from '@/components/Underground'
import { UgTeamSeats, UgTeamSheet } from '@/screens/events/UndergroundTeam'
import { useUgTeams } from '@/store/ugTeams'
import { useGame } from '@/store/game'

const CFG = DEFAULT_CONFIG.underground

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[13px] text-muted">{name}</span>
      <div className="w-full max-w-[390px] overflow-hidden bg-[#2b211a] p-2 shadow-ring">{children}</div>
    </div>
  )
}

/** A 6 × 6 wall with a large orb, a medium one, a plate and a fossil. */
const WALL: Wall = {
  id: 'ks:1',
  cols: 6,
  rows: 6,
  depth: [
    3, 2, 3, 3, 1, 2, 2, 1, 3, 3, 2, 1, 3, 3, 2, 2, 1, 3, 1, 2, 3, 3, 3, 2, 2, 3, 1, 1, 2, 3, 3, 3, 2, 3, 1,
    2,
  ],
  things: [
    { kind: 'orbL', x: 1, y: 1, w: 3, h: 3, colour: 'red' },
    { kind: 'orbM', x: 4, y: 4, w: 2, h: 2, colour: 'green' },
    { kind: 'plate', x: 0, y: 4, w: 3, h: 2, plate: 'fire' },
    { kind: 'fossil', x: 4, y: 0, w: 2, h: 2, item: 'skull-fossil' },
  ],
  strikes: 15,
  used: 0,
  neighbourLoss: 1,
}
const dug = (w: Wall, tiles: number[], used: number): Wall => ({
  ...w,
  depth: w.depth.map((d, i) => (tiles.includes(i) ? 0 : d)),
  used,
})
const HALF = dug(WALL, [7, 8, 13, 24, 25, 30, 31, 32, 4], 7)
const CLEARED = dug(WALL, [...Array(36).keys()], 12)
const COLLAPSED = dug(WALL, [7, 8, 13, 14, 4, 5], 15)

const LINES: HaulLine[] = [
  { thing: WALL.things[2]!, outcome: 'plate' },
  { thing: WALL.things[3]!, outcome: 'box' },
  { thing: WALL.things[0]!, outcome: 'bag' },
  { thing: { ...WALL.things[1]!, colour: 'blue' }, outcome: 'sent', to: { id: 'u2', name: 'Dawn' } },
  { thing: WALL.things[1]!, outcome: 'lost' },
]

export function UndergroundBits() {
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const [sheet, setSheet] = useState(false)
  const [flash, setFlash] = useState(1)
  return (
    <div className="flex w-full flex-col gap-4" data-testid="ug-sink">
      <div className="grid gap-3 sm:grid-cols-2">
        <Frame name="UgCave (a square's size)">
          <UgCave className="relative h-[110px]" />
        </Frame>
        <Frame name="UgCave big (the page's banner, a wide screen)">
          <UgCave big className="relative h-[132px]" />
        </Frame>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Frame name="CrackGauge: fresh">
          <CrackGauge strikes={15} used={0} />
        </Frame>
        <Frame name="CrackGauge: under way">
          <CrackGauge strikes={15} used={7} />
        </Frame>
        <Frame name="CrackGauge: last 3, shaking">
          <CrackGauge strikes={15} used={13} />
        </Frame>
        <Frame name="CrackGauge: last 3, calm">
          <CrackGauge strikes={15} used={13} calm />
        </Frame>
        <Frame name="CrackGauge: collapsed">
          <CrackGauge strikes={15} used={15} />
        </Frame>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Frame name="UgWall: fresh">
          <UgWall wall={WALL} data={data} />
        </Frame>
        <Frame name="UgWall: half dug, the large orb half uncovered, a strike flashing">
          <UgWall
            wall={HALF}
            data={data}
            fx={{ tile: 14, roll: 2, key: flash }}
            onStrike={() => setFlash((k) => k + 1)}
          />
        </Frame>
        <Frame name="UgWall: cleared (everything glints)">
          <UgWall wall={CLEARED} data={data} disabled />
        </Frame>
        <Frame name="UgWall: collapsing (full; short is one thud)">
          <UgWall key={flash} wall={COLLAPSED} data={data} disabled collapsing />
        </Frame>
      </div>
      <PixelButton size="sm" className="self-start" onClick={() => setFlash((k) => k + 1)}>
        Replay the strike and the collapse
      </PixelButton>

      <div className="flex flex-wrap items-end gap-4 bg-panel p-3 shadow-ring">
        <span className="grid justify-items-center gap-1">
          <PickaxeDie roll={null} />
          <small className="font-pixel-sm text-[13px] text-muted">not rolled</small>
        </span>
        <span className="grid justify-items-center gap-1">
          <PickaxeDie roll={2} rollKey={flash} />
          <small className="font-pixel-sm text-[13px] text-muted">rolled 2</small>
        </span>
        <span className="grid gap-1">
          <PickaxeFaces faces={CFG.pickaxe[3]!.faces} face={2} />
          <small className="font-pixel-sm text-[13px] text-muted">faces, the one that came up</small>
        </span>
        <span className="grid gap-1">
          <PickaxeFaces faces={CFG.pickaxe[4]!.faces} next={CFG.pickaxe[3]!.faces} />
          <small className="font-pixel-sm text-[13px] text-muted">
            the next level, its raised face ringed
          </small>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-[#2b211a] p-3 shadow-ring">
        {ORB_COLOURS.flatMap((c) =>
          ORB_SIZES.map((s) => <OrbArt key={c + s} colour={c} size={s} px={s === 's' ? 16 : 32} />),
        )}
        <PlateArt type="fire" px={40} />
        <PlateArt type="dragon" px={40} />
        <PlateArt type="fairy" px={40} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-panel p-3 shadow-ring">
          <HaulList lines={LINES} data={data} />
        </div>
        <div className="flex flex-col gap-3 bg-panel p-3 shadow-ring">
          <PlateGrid held={[]} />
          <PlateGrid held={['fire', 'water', 'steel', 'fairy']} />
          <OrbBagTable
            bag={{ red: { s: 6, m: 2, l: 1 }, blue: { s: 0, m: 0, l: 0 }, green: { s: 3, m: 1, l: 0 } }}
            cfg={CFG}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-panel p-3 shadow-ring">
          <UgTeamSeats team={null} />
        </div>
        <div className="bg-panel p-3 shadow-ring">
          <UgTeamSeats
            team={{ me: 'red', seats: { red: { id: 'me', name: 'Sam' }, blue: { id: 'u2', name: 'Dawn' } } }}
          />
        </div>
        <div className="bg-panel p-3 shadow-ring">
          <UgTeamSeats
            team={{
              me: 'blue',
              seats: {
                red: { id: 'u1', name: 'Barry' },
                blue: { id: 'me', name: 'Sam' },
                green: { id: 'u3', name: 'Cynthia' },
              },
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules('unlock')}>
          Rules (once: Later / Let’s go!)
        </PixelButton>
        <InfoButton name="The Underground" onClick={() => setRules('info')} className="max-w-[240px]" />
        <PixelButton
          size="sm"
          onClick={() => {
            // Two invitations waiting, one sent (signed in, the friends list follows; signed out, the sign-in line).
            useUgTeams.setState({
              invites: [
                { team: 'k1', from: 'u4', name: 'Barry', seats: 1 },
                { team: 'k2', from: 'u5', name: 'Cynthia', seats: 2 },
              ],
              sent: [{ id: 'u2', name: 'Dawn' }],
              state: 'ready',
            })
            setSheet(true)
          }}
        >
          Team sheet
        </PixelButton>
      </div>
      <UgTeamSheet open={sheet} onClose={() => setSheet(false)} />
      <UgRulesModal
        open={!!rules}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
        data={data}
      />
    </div>
  )
}
