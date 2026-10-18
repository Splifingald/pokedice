// Kitchen sink (dev only): day and night in Johto (docs/32) — the top bar's chip by day and by night, the fights'
// indicator on a stage, the tags in an area's lists (its own half, the other half), the Pokédex locations' chips, and
// the rules (unlock and INFO).
import { useState, type ReactNode } from 'react'
import {
  BattleDayTime,
  DayNightChip,
  DayNightPill,
  DayNightRulesModal,
  DayNightTag,
  useDayNightLine,
} from '@/components/DayNight'
import { InfoButton } from '@/components/RulesModal'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import type { DayTime } from '@/engine'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[13px] text-muted">{name}</span>
      {children}
    </div>
  )
}

/** The top bar's left end, as it stands in Johto. */
function TopBar({ time }: { time: DayTime }) {
  const line = useDayNightLine(time)
  return (
    <Frame name={`Top bar · ${time} · “${line}”`}>
      <div className="flex h-14 w-[300px] items-center gap-2 bg-panel px-2.5 shadow-ring">
        <DayNightChip time={time} size={22} />
        <span className="pixel-corners inline-flex min-h-[36px] items-center bg-night px-2 text-[19px] leading-none text-gold-light light-scope">
          5/5
        </span>
      </div>
    </Frame>
  )
}

/** A fight's stage corner: the small chip over the drawn background. */
function Stage({ time }: { time: DayTime }) {
  return (
    <Frame name={`Battle stage · ${time}`}>
      <div className="relative h-[120px] w-[180px] bg-sky shadow-ring">
        <BattleDayTime time={time} />
      </div>
    </Frame>
  )
}

/** An area's list tile: a night Pokémon, by night (lit) and by day (greyed). */
function Tile({ dex, time, now }: { dex: number; time: DayTime; now: DayTime }) {
  return (
    <Frame name={`List tag · ${time} only · now ${now}`}>
      <div className="relative grid w-[102px] justify-items-center gap-[3px] bg-paper px-1 pb-2 pt-1 shadow-ring-line">
        <span className="absolute left-1.5 top-1.5">
          <DayNightTag time={time} now={now} size={12} />
        </span>
        <MiniSprite dex={dex} size={40} />
        <span className="whitespace-nowrap bg-sky px-1 pb-0.5 font-pixel-sm text-[13px] leading-none text-ink">
          Common · 25%
        </span>
      </div>
    </Frame>
  )
}

export function DayNightBits() {
  const { t } = useT()
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  return (
    <>
      <TopBar time="day" />
      <TopBar time="night" />
      <Stage time="day" />
      <Stage time="night" />
      <Tile dex={163} time="night" now="night" />
      <Tile dex={163} time="night" now="day" />
      <Tile dex={161} time="day" now="day" />
      <Tile dex={161} time="day" now="night" />
      <Frame name="Pokédex location · day only / night only">
        <div className="flex gap-2">
          <DayNightPill time="day" />
          <DayNightPill time="night" />
        </div>
      </Frame>
      <Frame name="Rules">
        <div className="flex flex-col gap-2">
          <PixelButton onClick={() => setRules('unlock')}>Day and night: its pop-up, once</PixelButton>
          <InfoButton name={t('ui.dayNight.title')} onClick={() => setRules('info')} />
        </div>
      </Frame>
      <DayNightRulesModal
        open={rules !== null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </>
  )
}
