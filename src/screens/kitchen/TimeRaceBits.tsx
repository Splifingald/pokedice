// Kitchen sink: the race of time and space (docs/64 §4.4, docs/15 §48) in every state — Spear Pillar's clock and rift on
// the pixel engine (moving and still), the countdown (plenty of time, under a minute, the last 30 seconds, out), the
// gauge of fights (fresh, under way across forks, all won), a fork (the first, the last with its legends, the replay's
// gate alone, a shard and an item behind the gates), the way in (the intro full screen, held at its end with "Tap to
// continue ▼", then its pop-up; the pop-up at once, back from TEAM; the pop-up on its own, the first race and the
// replay), the rules pop-up (INFO), the result cards (a fight, the last), the cards of a lost try (out of time, a K.O.)
// and the win (Dialga's and Palkia's). Every scene also plays on /kitchen-sink/fx.
import { useState } from 'react'
import { DEFAULT_TIME_RACE, type TimeRaceGate, type TimeRacePlan } from '@/engine'
import {
  DIALGA,
  ForkView,
  PALKIA,
  RaceClock,
  RaceGauge,
  RaceScene,
  TimeRaceEntry,
  TimeRaceEntryDialog,
  TimeRaceRulesModal,
  TimeRaceVictoryView,
} from '@/components/TimeRace'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

const mode = DEFAULT_TIME_RACE
const FIRST: TimeRacePlan = {
  replay: false,
  forks: [...mode.forks, ['water', 'steel']],
  seconds: mode.seconds,
  levelBonus: 0,
  total: 15,
}
const REPLAY: TimeRacePlan = {
  replay: true,
  forks: [...mode.replay.forks, ['steel']],
  seconds: mode.replay.seconds,
  levelBonus: mode.replay.levelBonus,
  total: 15,
}

export function TimeRaceBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState<
    null | 'intro' | 'held' | 'entry' | 'replay' | 'info' | 'dialga' | 'palkia'
  >(null)
  const [picked, setPicked] = useState<string | null>(null)
  const close = () => setOpen(null)
  const first: TimeRaceGate[] = [
    { type: 'fire', find: { kind: 'shard', seconds: 30 } },
    { type: 'grass', find: { kind: 'item', key: 'hyper-potion', qty: 2 } },
  ]
  const last: TimeRaceGate[] = [
    { type: 'water', find: { kind: 'item', key: 'revive', qty: 1 } },
    { type: 'steel', find: { kind: 'shard', seconds: 30 } },
  ]
  const only: TimeRaceGate[] = [{ type: 'steel', find: { kind: 'item', key: 'max-revive', qty: 1 } }]
  const legends = {
    water: data.species[PALKIA]?.name ?? 'Palkia',
    steel: data.species[DIALGA]?.name ?? 'Dialga',
  }
  const card =
    'light-scope flex items-center justify-center gap-2 bg-[#0b0f2e] p-2 text-center text-white shadow-[inset_0_3px_0_#a8c8ff,0_0_0_2px_#24304f]'
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap gap-2 [&>*]:max-w-full [&>*]:whitespace-normal">
        <PixelButton size="sm" onClick={() => setOpen('intro')}>
          The intro (the clock and the rift, tap to continue, then its pop-up over its end)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('held')}>
          The pop-up over the intro&apos;s end (back from TEAM)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('entry')}>
          Its pop-up on its own (TEAM / NOT NOW / READY!)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('replay')}>
          The replay&apos;s pop-up (other types, 10:00)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('info')}>
          Rules pop-up (INFO)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('dialga')}>
          The win: shiny Dialga (Steel gate)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('palkia')}>
          The win: shiny Palkia (Water gate)
        </PixelButton>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative h-[150px] overflow-hidden">
          <RaceScene />
        </div>
        <div className="relative h-[150px] overflow-hidden">
          <RaceScene still />
        </div>
      </div>
      {/* The countdown: plenty of time, under a minute (gold), the last 30 seconds (red, blinking), out. */}
      <div className="flex flex-wrap items-center gap-3">
        <RaceClock left={7 * 60_000 + 32_000} />
        <RaceClock left={48_000} />
        <RaceClock left={12_000} />
        <RaceClock left={0} />
        <RaceClock left={7 * 60_000 + 32_000} size="small" />
      </div>
      <div className="grid max-w-xl gap-2">
        <RaceGauge fights={0} total={15} perFork={3} path={[]} />
        <RaceGauge fights={7} total={15} perFork={3} path={['fire', 'psychic', 'ice']} />
        <RaceGauge
          fights={15}
          total={15}
          perFork={3}
          path={['grass', 'dark', 'dragon', 'electric', 'water']}
        />
      </div>
      <div className="grid max-w-xl gap-3">
        <ForkView
          gates={first}
          fork={1}
          forks={5}
          perFork={3}
          data={data}
          onPick={(i) => setPicked(first[i]!.type)}
        />
        <ForkView
          gates={last}
          fork={5}
          forks={5}
          perFork={3}
          legends={legends}
          data={data}
          onPick={(i) => setPicked(last[i]!.type)}
        />
        <ForkView
          gates={only}
          fork={5}
          forks={5}
          perFork={3}
          legends={legends}
          data={data}
          onPick={() => setPicked('steel')}
        />
        {picked && <p className="m-0 font-pixel-sm text-[16px] text-muted">Picked: {picked}</p>}
      </div>
      {/* The result cards, as VictoryView shows them, and a lost try's card bodies. */}
      <div className="grid max-w-xl gap-2">
        <div className={card}>
          <PixelIcon name="clock" size={22} />
          <span className="text-xl leading-tight">{t('ui.timeRace.fightWon', { n: 4, total: 15 })}</span>
        </div>
        <div className={card}>
          <PixelIcon name="clock" size={22} />
          <span className="text-xl leading-tight">{t('ui.timeRace.lastFightWon')}</span>
        </div>
        <div className="pixel-panel grid gap-1 p-3">
          <h3 className="m-0 text-[28px] font-normal leading-none">{t('ui.timeRace.timeUpTitle')}</h3>
          <p className="copy m-0 text-lg">{t('ui.timeRace.timeUpBody', { n: 11, total: 15 })}</p>
        </div>
        <div className="pixel-panel grid gap-1 p-3">
          <h3 className="m-0 text-[28px] font-normal leading-none">{t('ui.wipe.title')}</h3>
          <p className="copy m-0 text-lg">{t('ui.timeRace.wipeBody', { n: 6, total: 15 })}</p>
        </div>
        <p className="m-0 flex items-start gap-2 bg-well p-2 font-pixel-sm text-[16px] leading-tight text-muted shadow-ring-line">
          <PixelIcon name="lock" size={16} className="mt-px shrink-0" />
          <span>{t('ui.timeRace.locked')}</span>
        </p>
      </div>
      {(open === 'intro' || open === 'held') && (
        <TimeRaceEntry
          mode={mode}
          plan={FIRST}
          data={data}
          picture={artUrl('lair-summit')}
          popup={open === 'held'}
          onReady={close}
          onNotNow={close}
          onTeam={close}
        />
      )}
      <TimeRaceEntryDialog
        open={open === 'entry' || open === 'replay'}
        mode={mode}
        plan={open === 'replay' ? REPLAY : FIRST}
        data={data}
        onReady={close}
        onNotNow={close}
        onTeam={close}
      />
      <TimeRaceRulesModal open={open === 'info'} onClose={close} mode={mode} plan={FIRST} data={data} />
      {(open === 'dialga' || open === 'palkia') && (
        <TimeRaceVictoryView
          dex={open === 'dialga' ? DIALGA : PALKIA}
          name={data.species[open === 'dialga' ? DIALGA : PALKIA]?.name ?? ''}
          level={mode.raid.level}
          left={95_000}
          onDone={close}
          onRaid={close}
        />
      )}
    </div>
  )
}
