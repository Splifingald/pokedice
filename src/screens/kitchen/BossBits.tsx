// Kitchen sink (dev only): the Community Boss (docs/71 §4) — its tag and art on Home's square, the gauges (fresh,
// partway with two broken, all broken), and the arena with a full field (yours in front, friends', others) and with
// only yours.
import type { ReactNode } from 'react'
import { newLiveEvent, type LiveEvent } from '@/engine'
import { LiveSquare, LiveTag } from '@/screens/events/live'
import { BossArena, BossGauges } from '@/screens/events/Boss'
import type { BossFieldMon } from '@/store/communityBoss'

const H = 3_600_000
const START = Date.parse('2027-03-20T18:00:00.000Z')
const NOW = START + 20 * H

const SNORLAX: LiveEvent = {
  ...newLiveEvent('ks-boss', new Date(START).toISOString(), new Date(START + 3 * 24 * H).toISOString()),
  type: 'boss',
  banner: 'gym-normal',
  minBadges: 0,
}

const mon = (dex: number, name: string, extra: Partial<BossFieldMon> = {}): BossFieldMon => ({
  name,
  dex,
  level: 50,
  shiny: false,
  hit: 100,
  ...extra,
})
const FIELD: BossFieldMon[] = [
  mon(68, 'Sam', { own: true }),
  mon(448, 'Sam', { own: true, hit: 120 }),
  mon(62, 'Sam', { own: true }),
  mon(6, 'Misty', { friend: true }),
  mon(257, 'Brock', { friend: true }),
  ...[25, 150, 94, 130, 143, 9, 3, 65, 112, 248, 445, 384, 149, 245].map((dex, i) =>
    mon(dex, `Trainer ${i + 1}`),
  ),
]

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className="w-full max-w-[480px]">{children}</div>
    </div>
  )
}

export function BossBits() {
  return (
    <div className="flex flex-col gap-4">
      <Frame name="Tag">
        <LiveTag e={SNORLAX} />
      </Frame>
      <Frame name="Home's square">
        <LiveSquare live={SNORLAX} now={NOW} />
      </Frame>
      <Frame name="Gauges: fresh">
        <BossGauges e={SNORLAX} total={0} />
      </Frame>
      <Frame name="Gauges: two broken, the third partway">
        <BossGauges e={SNORLAX} total={52_000_000} />
      </Frame>
      <Frame name="Gauges: all broken">
        <BossGauges e={SNORLAX} total={999_999_999} />
      </Frame>
      <Frame name="Arena: a full field (yours in front, friends', others)">
        <BossArena e={SNORLAX} field={FIELD} />
      </Frame>
      <Frame name="Arena: only yours">
        <BossArena e={SNORLAX} field={FIELD.slice(0, 3)} />
      </Frame>
    </div>
  )
}
