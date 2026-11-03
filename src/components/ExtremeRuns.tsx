// Extreme mode as a speedrun (docs/48, docs/15 §19): a region's card on the Extreme page (locked, not started, on the
// clock, League won) with its team, badges, clock and best time, and the restart that asks twice. Every number comes
// from the engine (engine/extremeRuns.ts); the clock reads the server's time.
import { useState } from 'react'
import {
  liveBlock,
  regionCases,
  regionOf,
  runOf,
  runState,
  runTime,
  type Region,
  type SaveData,
} from '@/engine'
import { useT } from '@/i18n/react'
import { clockTo } from '@/lib/format'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { MiniSprite } from './SpriteImg'

/** A run's time: "1d 04:12:33", "4:12:33", "12:33". */
export const raceTime = (ms: number) => clockTo(ms)

/** The region's block in the Extreme save (live or parked), or null when its run was never started. */
function blockOf(x: SaveData | null, region: string) {
  if (!x) return null
  return regionOf(x) === region ? liveBlock(x) : (x.parked?.[region] ?? null)
}

/**
 * One region on the Extreme page. `x`: the Extreme save (null before the first run); `open`: the main save has beaten
 * this region's League; `playing`: this is the run the page is playing now; `now`: the real time.
 */
export function RunCard({
  region,
  x,
  open,
  playing,
  now,
  onStart,
  onPlay,
  onRestart,
}: {
  region: Region
  x: SaveData | null
  open: boolean
  playing: boolean
  now: number
  onStart: () => void
  onPlay: () => void
  onRestart: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const state = runState(x, region.id)
  const run = runOf(x, region.id)
  const block = blockOf(x, region.id)
  const team = block ? block.team.map((id) => block.box.find((p) => p.id === id)).filter((p) => !!p) : []
  const badges = x ? regionCases(x, data).find((r) => r.id === region.id) : null
  const best = run?.best
  return (
    <li
      className={cx(
        'pixel-panel flex min-w-0 flex-col gap-2 p-3',
        !open && 'opacity-70',
        playing && 'outline outline-[3px] outline-offset-2 outline-crimson',
      )}
    >
      <div className="flex items-center gap-2">
        <b className="text-[24px] font-normal leading-none">{region.name}</b>
        {playing && (
          <span className="light-scope ml-auto bg-crimson px-1.5 pb-0.5 pt-px font-pixel-sm text-[16px] leading-none text-white">
            {t('ui.xrun.here')}
          </span>
        )}
        {!open && <PixelIcon name="lock" size={18} className="ml-auto" />}
      </div>
      {!open ? (
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.xrun.locked', { region: region.name })}
        </p>
      ) : state === 'none' ? (
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.xrun.notStarted')}</p>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            {team.map((p) => (
              <MiniSprite
                key={p.id}
                dex={p.dex}
                size={36}
                className={p.currentHp <= 0 ? 'opacity-50 grayscale' : undefined}
              />
            ))}
            {badges && (
              <span className="ml-auto flex items-center gap-1 font-pixel-sm text-[16px] text-muted">
                <PixelIcon name="badge" size={12} />
                {t('ui.xrun.badges', { n: badges.earned, total: badges.badges.length })}
              </span>
            )}
          </div>
          <p
            className={cx(
              'm-0 font-mono text-[20px] leading-none',
              state === 'won' ? 'text-good' : 'text-ink',
            )}
          >
            {run?.untimed
              ? t('ui.xrun.untimed')
              : state === 'won'
                ? t('ui.xrun.won', { time: raceTime(runTime(run!, now)) })
                : t('ui.xrun.running', { time: raceTime(runTime(run!, now)) })}
          </p>
        </>
      )}
      {open && best != null && (
        <p className="m-0 flex items-center gap-1.5 font-pixel-sm text-[16px] leading-none text-muted">
          <PixelIcon name="trophy" size={14} />
          {t('ui.xrun.best', { time: raceTime(best) })}
        </p>
      )}
      {open && (
        <div className="mt-auto flex gap-2 pt-1">
          {state === 'none' ? (
            <PixelButton variant="primary" className="flex-1" onClick={onStart}>
              {t('ui.xrun.start')}
            </PixelButton>
          ) : (
            <>
              <PixelButton variant="primary" className="flex-1" onClick={onPlay}>
                {t('ui.xrun.play')}
              </PixelButton>
              <PixelButton onClick={onRestart}>{t('ui.xrun.restart')}</PixelButton>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Restarting a region asks twice (the run is erased for good): what goes and what stays, then once more. Only the
 * second CONFIRM calls `onConfirm`.
 */
export function RestartRunModal({
  region,
  onClose,
  onConfirm,
}: {
  region: Region | null
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useT()
  const [sure, setSure] = useState(false)
  const close = () => {
    setSure(false)
    onClose()
  }
  return (
    <Modal
      open={!!region}
      onClose={close}
      title={region ? t('ui.xrun.restartTitle', { region: region.name }) : ''}
      className="max-w-sm"
    >
      {region && (
        <div className="flex flex-col gap-3">
          <p className="copy m-0 text-lg">
            {sure ? t('ui.xrun.restartSure') : t('ui.xrun.restartBody', { region: region.name })}
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <PixelButton onClick={close}>{t('ui.common.cancel')}</PixelButton>
            <PixelButton
              variant="danger"
              onClick={() => {
                if (!sure) return setSure(true)
                setSure(false)
                onConfirm()
              }}
            >
              {t('ui.xrun.restart')}
            </PixelButton>
          </div>
        </div>
      )}
    </Modal>
  )
}
