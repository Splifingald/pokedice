// Kitchen sink: Extreme mode as a speedrun (docs/48) — a region's card in every state (locked, not started, on the
// clock, played now, League won with its best time, won before the clock), the restart that asks twice, and the board
// with best times and runs going.
import { useMemo, useState } from 'react'
import { RestartRunModal, RunCard } from '@/components/ExtremeRuns'
import { ExtremeBoard } from '@/components/ExtremeBoard'
import { PixelButton } from '@/components/PixelButton'
import { beginRun, getRegion, progressOf, type Region, type SaveData } from '@/engine'
import type { ExtremeBoardRow } from '@/lib/extremeBoard'
import { useGame } from '@/store/game'

const H = 3_600_000

export function ExtremeRunBits() {
  const data = useGame((s) => s.data)
  const [restart, setRestart] = useState<Region | null>(null)
  const now = Date.now()
  const sample = useMemo(() => {
    let n = 0
    const id = () => `k-${++n}`
    const kanto = getRegion(data, 'kanto')!
    const johto = getRegion(data, 'johto') ?? kanto
    const hoenn = getRegion(data, 'hoenn') ?? kanto
    const start = Date.now() - 26 * H - 754_000
    const running = beginRun(null, data, kanto.id, kanto.starters[0]!, start, id)!
    // Johto's League won in 7 h 12 m, on a second run; its best is 6 h 40 m.
    const johtoRun = beginRun(running, data, johto.id, johto.starters[1]!, start, id)!
    const won: SaveData = {
      ...johtoRun,
      areaProgress: {
        ...johtoRun.areaProgress,
        [johto.leagueAreaId]: { ...progressOf(johtoRun, johto.leagueAreaId), cleared: true },
      },
      extreme: {
        ...johtoRun.extreme,
        runs: {
          ...johtoRun.extreme!.runs,
          [johto.id]: {
            id: 'j',
            startedAt: start,
            finishedAt: start + 7 * H + 12 * 60_000,
            best: 6 * H + 40 * 60_000,
          },
        },
      },
    }
    const untimed: SaveData = {
      ...won,
      extreme: {
        ...won.extreme,
        runs: {
          ...won.extreme!.runs,
          [johto.id]: { id: 'u', startedAt: now, finishedAt: now, untimed: true },
        },
      },
    }
    return { kanto, johto, hoenn, running, won, untimed }
  }, [data, now])
  const rows: ExtremeBoardRow[] = [
    {
      region: 'kanto',
      isMe: false,
      name: 'Lea',
      avatar: 'leaf',
      team: [{ dex: 6, level: 62, shiny: false }],
      badges: 8,
      bestMs: 5 * H + 2 * 60_000,
      running: false,
      runSince: null,
      friendId: 'f',
      rich: false,
    },
    {
      region: 'kanto',
      isMe: true,
      name: 'Sam',
      avatar: 'red',
      team: [{ dex: 9, level: 58, shiny: true }],
      badges: 8,
      bestMs: 6 * H + 40 * 60_000,
      running: true,
      runSince: now - H,
      friendId: null,
      rich: false,
    },
    {
      region: 'kanto',
      isMe: false,
      name: 'Kai',
      avatar: 'ethan',
      team: [{ dex: 3, level: 40, shiny: false }],
      badges: 5,
      bestMs: null,
      running: true,
      runSince: now - 9 * H,
      friendId: null,
      rich: true,
    },
    {
      region: 'kanto',
      isMe: false,
      name: 'Noor',
      avatar: 'may',
      team: [{ dex: 25, level: 22, shiny: false }],
      badges: 2,
      bestMs: null,
      running: true,
      runSince: now - 2 * H,
      friendId: null,
      rich: false,
    },
  ]
  const noop = () => {}
  return (
    <div className="grid w-full gap-3">
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
        <RunCard
          region={sample.hoenn}
          x={null}
          open={false}
          playing={false}
          now={now}
          onStart={noop}
          onPlay={noop}
          onRestart={noop}
        />
        <RunCard
          region={sample.hoenn}
          x={null}
          open
          playing={false}
          now={now}
          onStart={noop}
          onPlay={noop}
          onRestart={noop}
        />
        <RunCard
          region={sample.kanto}
          x={sample.running}
          open
          playing
          now={now}
          onStart={noop}
          onPlay={noop}
          onRestart={() => setRestart(sample.kanto)}
        />
        <RunCard
          region={sample.johto}
          x={sample.won}
          open
          playing={false}
          now={now}
          onStart={noop}
          onPlay={noop}
          onRestart={() => setRestart(sample.johto)}
        />
        <RunCard
          region={sample.johto}
          x={sample.untimed}
          open
          playing={false}
          now={now}
          onStart={noop}
          onPlay={noop}
          onRestart={noop}
        />
      </ul>
      <PixelButton size="sm" className="self-start" onClick={() => setRestart(sample.kanto)}>
        Restart (asks twice)
      </PixelButton>
      <ExtremeBoard regions={[sample.kanto, sample.johto]} rows={rows} />
      <RestartRunModal region={restart} onClose={() => setRestart(null)} onConfirm={() => setRestart(null)} />
    </div>
  )
}
