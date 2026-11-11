// Kitchen sink (dev only): Hatching Day (docs/71 §2) — Home's square, the Day Care card's chip (one event, two added
// up), the Day Care page's strip (days left, its last hours in red), and its tag on the picture.
import type { ReactNode } from 'react'
import { newLiveEvent, type LiveEvent } from '@/engine'
import { HatchingDayChipView, HatchingDayStripView, LiveSquare, LiveTag } from '@/screens/events/live'

const H = 3_600_000
const START = Date.parse('2026-11-14T10:00:00.000Z')
const NOW = START + 20 * H

const HATCH: LiveEvent = {
  ...newLiveEvent('ks-hatch', new Date(START).toISOString(), new Date(START + 3 * 24 * H).toISOString()),
  type: 'hatch',
  banner: '/backgrounds/live-hatch.png',
  minBadges: 0,
}

function Frame({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className={wide ? 'w-full max-w-[420px]' : ''}>{children}</div>
    </div>
  )
}

export function HatchingDayBits() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Frame name="Tag">
          <LiveTag e={HATCH} />
        </Frame>
        <Frame name="Day Care chip (×3, ×4)">
          <HatchingDayChipView speed={3} shiny={4} />
        </Frame>
        <Frame name="Two at once (×5, ×7)">
          <HatchingDayChipView speed={5} shiny={7} />
        </Frame>
      </div>
      <Frame name="Home's square (1d 4h left)" wide>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <LiveSquare live={HATCH} now={NOW} />
        </div>
      </Frame>
      <Frame name="Day Care strip (2d 4h left)" wide>
        <HatchingDayStripView e={HATCH} speed={3} shiny={4} ms={52 * H} onOpen={() => {}} />
      </Frame>
      <Frame name="Day Care strip (last hours: red)" wide>
        <HatchingDayStripView e={HATCH} speed={3} shiny={4} ms={2 * H + 12 * 60_000} onOpen={() => {}} />
      </Frame>
    </div>
  )
}
