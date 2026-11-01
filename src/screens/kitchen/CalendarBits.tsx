// Kitchen sink (dev only): the gift calendar (docs/55) — a door in every state (shut, today's, yesterday's last
// chance, opened with an item, ₽, a Pokémon, several Pokémon and a shiny one, missed), a 24-day calendar on its 10th
// day, Home's card (a door to open: gold; the next one later; every door done), the rules card and INFO, and a door's
// opening (the gifts' own, its first line the day's).
import { useState, type ReactNode } from 'react'
import {
  calendarDoors,
  calendarEnd,
  GIFT_CURRENT,
  newLiveEvent,
  newSave,
  type CalendarDoor,
  type CalendarReward,
  type GiftLanded,
  type LiveEvent,
  type SaveData,
} from '@/engine'
import { CalendarDoorTile, CalendarGrid, CalendarRulesModal, useCalendarRules } from '@/components/Calendar'
import { GiftMoment } from '@/components/Gifts'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { RulesCard } from '@/components/RulesCard'
import { useT } from '@/i18n/react'
import { LiveFx, LiveGauge, LivePicture, LiveTag, calendarSub, liveName } from '@/screens/events/live'
import { HomeCard } from '@/screens/home/Widget'
import { useGame } from '@/store/game'

const D = 24 * 3_600_000
const START = Date.parse('2026-12-01T00:00:00.000Z')
const NOW = START + 9 * D + 7 * 3_600_000

const REWARDS: CalendarReward[] = [
  { kind: 'gold', amount: 2000 },
  { kind: 'item', key: 'rare-candy', qty: 3 },
  { kind: 'pokemon', dex: 225, level: 15, qty: 1 },
  { kind: 'item', key: 'ultra-ball', qty: 10 },
  { kind: 'gold', amount: 5000 },
  { kind: 'pokemon', dex: 220, level: 10, qty: 2 },
  { kind: 'item', key: 'ice-stone', qty: 1 },
  { kind: 'pokemon', dex: 25, level: 20, shiny: true, qty: 1 },
]
const DAYS = Array.from({ length: 24 }, (_, i) => REWARDS[i % REWARDS.length]!)

const CAL: LiveEvent = {
  ...newLiveEvent('ks-advent', new Date(START).toISOString(), calendarEnd(new Date(START).toISOString(), 24)),
  type: 'calendar',
  banner: '/backgrounds/live-winter.png',
  title: { en: 'Advent Calendar', fr: 'Calendrier de l’Avent' },
  minBadges: 0,
  calendar: { days: DAYS },
}

/** A save that opened days 1–7 but 3 and 5, so day 9 is yesterday's (last chance) and day 10 today's. */
function sampleSave(opened: number[]): SaveData {
  const data = useGame.getState().data
  const s = newSave(4, data, 0, () => 'ks-mon')
  return { ...s, events: { calendarOpened: { [CAL.id]: opened } } }
}

const door = (
  day: number,
  state: CalendarDoor['state'],
  reward: CalendarReward = DAYS[day - 1]!,
): CalendarDoor => ({
  day,
  state,
  reward,
  opensAt: START + (day - 1) * D,
})

function Frame({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className={wide ? 'w-full max-w-[560px]' : 'w-[96px]'}>{children}</div>
    </div>
  )
}

const landed = (gifts: GiftLanded['gift'][]): GiftLanded[] =>
  gifts.map((gift) => ({ gift, region: 'kanto', moved: false, isNew: gift.kind === 'pokemon' }))

export function CalendarBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [info, setInfo] = useState(false)
  const [moment, setMoment] = useState(false)
  const [rulesSeen, setRulesSeen] = useState(false)
  const rules = useCalendarRules(CAL)
  const midway = sampleSave([1, 2, 4, 6, 7, 8])
  const done = sampleSave(Array.from({ length: 24 }, (_, i) => i + 1))
  const name = liveName(CAL)
  const card = (save: SaveData, now: number, gold: boolean) => (
    <HomeCard
      tone={gold ? 'gold' : undefined}
      picture={
        <LivePicture e={CAL} className="absolute inset-0">
          <LiveFx e={CAL} data={data} />
        </LivePicture>
      }
      name={name}
      tag={<LiveTag e={CAL} />}
      status={`${calendarSub(save, CAL, now)} · ${t('ui.live.endsIn', { time: '14d 17h' })}`}
      meter={<LiveGauge share={0.6} hot={false} className="lv-gauge-light" />}
      label={name}
      onClick={() => {}}
    />
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Frame name="Shut (opens in 3d 2h)">
          <CalendarDoorTile door={door(13, 'shut')} now={NOW} />
        </Frame>
        <Frame name="Today's">
          <CalendarDoorTile door={door(10, 'today')} now={NOW} onOpen={() => {}} />
        </Frame>
        <Frame name="Yesterday's: last chance">
          <CalendarDoorTile door={door(9, 'late')} now={NOW} onOpen={() => {}} />
        </Frame>
        <Frame name="Opened: ₽">
          <CalendarDoorTile door={door(1, 'opened')} now={NOW} />
        </Frame>
        <Frame name="Opened: an item ×3">
          <CalendarDoorTile door={door(2, 'opened')} now={NOW} />
        </Frame>
        <Frame name="Opened: a Pokémon">
          <CalendarDoorTile door={door(3, 'opened')} now={NOW} />
        </Frame>
        <Frame name="Opened: 2 Pokémon">
          <CalendarDoorTile door={door(6, 'opened')} now={NOW} />
        </Frame>
        <Frame name="Opened: a shiny">
          <CalendarDoorTile door={door(8, 'opened')} now={NOW} />
        </Frame>
        <Frame name="Missed">
          <CalendarDoorTile door={door(5, 'missed')} now={NOW} />
        </Frame>
        <Frame name="Busy (a door opening)">
          <CalendarDoorTile door={door(10, 'today')} now={NOW} busy onOpen={() => {}} />
        </Frame>
      </div>
      <Frame
        name="A 24-day calendar on its 10th day: 6 opened, 2 missed, yesterday's and today's to open"
        wide
      >
        <CalendarGrid doors={calendarDoors(midway, CAL, NOW)} now={NOW} onOpen={() => {}} />
      </Frame>
      <Frame name="Home's card: doors to open (gold)" wide>
        {card(midway, NOW, true)}
      </Frame>
      <Frame name="Home's card: the next door later" wide>
        {card(sampleSave([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), NOW, false)}
      </Frame>
      <Frame name="Home's card: every door opened" wide>
        {card(done, START + 24 * D + 5, false)}
      </Frame>
      <Frame name="The rules card (the page's first visit), then INFO" wide>
        {!rulesSeen ? (
          <RulesCard title={name} icon="calendar" rules={rules} onDone={() => setRulesSeen(true)} />
        ) : (
          <PixelButton size="sm" onClick={() => setRulesSeen(false)}>
            Show the card again
          </PixelButton>
        )}
        <div className="mt-2 flex gap-2">
          <InfoButton compact name={name} onClick={() => setInfo(true)} />
          <PixelButton size="sm" onClick={() => setMoment(true)}>
            Open day 10 (the gift's opening)
          </PixelButton>
        </div>
      </Frame>
      <CalendarRulesModal open={info} onClose={() => setInfo(false)} e={CAL} name={name} />
      {moment && (
        <GiftMoment
          landed={landed([
            { kind: 'pokemon', dex: 220, level: 10, region: GIFT_CURRENT },
            { kind: 'pokemon', dex: 220, level: 10, region: GIFT_CURRENT },
          ])}
          source="calendar"
          day={10}
          onDone={() => setMoment(false)}
        />
      )}
    </div>
  )
}
