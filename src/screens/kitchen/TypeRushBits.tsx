// Kitchen sink (dev only): Type Rush (docs/71 §3) — its tag and art, Home's square, the reward gauge (empty, partway
// with two given, a reward popping, full), a quest card in each state (to do, ready, ticking green, done, a combo's,
// damage's big numbers), the recap's ×1.2, and its rules behind INFO.
import { useState, type ReactNode } from 'react'
import { newLiveEvent, type LiveEvent, type RushCard } from '@/engine'
import { InfoButton } from '@/components/RulesModal'
import { LivePicture, LiveSquare, LiveTag } from '@/screens/events/live'
import { RushArt, RushBoostChip, RushGauge, RushQuestCard, RushRulesModal } from '@/screens/events/rush'

const H = 3_600_000
const START = Date.parse('2027-03-12T18:00:00.000Z')
const NOW = START + 30 * H

const FIRE: LiveEvent = {
  ...newLiveEvent('ks-rush', new Date(START).toISOString(), new Date(START + 3 * 24 * H).toISOString()),
  type: 'rush',
  banner: 'gym-fire',
  minBadges: 0,
}
const Q = FIRE.rush.quests
const card = (i: number, patch: Partial<RushCard>): RushCard => ({
  quest: Q[i]!,
  step: 0,
  count: 0,
  target: Q[i]!.steps[0]!.target,
  points: Q[i]!.steps[0]!.points,
  ready: false,
  finished: false,
  ...patch,
})

function Frame({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className={wide ? 'w-full max-w-[420px]' : ''}>{children}</div>
    </div>
  )
}

export function TypeRushBits() {
  const [info, setInfo] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Frame name="Tag">
          <LiveTag e={FIRE} />
        </Frame>
        <Frame name="Recap's ×1.2">
          <RushBoostChip type="fire" n={1.2} />
        </Frame>
        <Frame name="Its art over the picture" wide>
          <span className="relative block h-[112px] w-[360px]">
            <LivePicture e={FIRE} className="absolute inset-0">
              <RushArt e={FIRE} big />
            </LivePicture>
          </span>
        </Frame>
      </div>
      <Frame name="Home's square (a red dot when something waits)" wide>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <LiveSquare live={FIRE} now={NOW} />
        </div>
      </Frame>
      <Frame name="Gauge: empty" wide>
        <RushGauge e={FIRE} points={0} given={0} />
      </Frame>
      <Frame name="Gauge: 120 points, two rewards given" wide>
        <RushGauge e={FIRE} points={120} given={2} />
      </Frame>
      <Frame name="Gauge: a reward popping out" wide>
        <RushGauge e={FIRE} points={180} given={3} popping={[2]} />
      </Frame>
      <Frame name="Gauge: full" wide>
        <RushGauge e={FIRE} points={330} given={5} />
      </Frame>
      <Frame name="Quest cards: to do, ready, ticking, a later step, done, a damage one" wide>
        <ul className="m-0 grid list-none gap-1.5 p-0">
          <RushQuestCard card={card(0, { count: 3 })} type="fire" />
          <RushQuestCard card={card(1, { count: 12, ready: true })} type="fire" />
          <RushQuestCard card={card(2, { count: 1, ready: true })} type="fire" ticked />
          <RushQuestCard card={card(0, { step: 1, count: 7, target: 10, points: 15 })} type="fire" />
          <RushQuestCard
            card={card(4, { step: 1, count: 3, target: 3, points: 25, finished: true })}
            type="fire"
          />
          <RushQuestCard card={card(3, { count: 1240 })} type="fire" />
        </ul>
      </Frame>
      <Frame name="INFO">
        <InfoButton compact name="Fire Rush" onClick={() => setInfo(true)} />
        <RushRulesModal e={FIRE} open={info} onClose={() => setInfo(false)} />
      </Frame>
    </div>
  )
}
