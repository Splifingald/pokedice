import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dueBoss,
  dueGym,
  isAreaClosed,
  playerSideOf,
  progressOf,
  teamAverageLevel,
  type Area,
} from '@/engine'
import { useT } from '@/i18n/react'
import { AutoModeToggle } from '@/components/AutoModeToggle'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { countdown, trainerTitle } from '@/lib/format'
import { useGame } from '@/store/game'
import { useEnergy } from '@/store/hooks'
import { challenge, enterArea, outOfEnergy, rollNext } from '@/store/run'
import { cx } from '@/theme/util'

/** The run must be in this area before anything is rolled: arriving from another one starts it afresh. */
function ensureRun(area: Area) {
  const run = useGame.getState().run
  if (run.areaId !== area.id) enterArea(area.id)
}

/**
 * What CONTINUE does and says in an area: the next encounter (rollNext → its preview on /area), or the gym or legendary
 * waiting at the end of the rounds; back to the encounter when one is under way; nothing when the area is closed or the
 * energy is out.
 */
export function useContinue(area: Area) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const battle = useGame((s) => !!s.battle)
  const energy = useEnergy()

  const progress = progressOf(save, area.id)
  const side = playerSideOf(save)
  const gym = dueGym(area, progress, data, side)
  const boss = gym ? null : dueBoss(area, progress, teamAverageLevel(save))
  const closed = isAreaClosed(save, area.id, data)
  const busy = (run.areaId === area.id && run.phase !== 'idle') || battle
  // Re-checked every second (useEnergy ticks): a Center the game sends next is free even at 0.
  const empty = !!energy && energy.value < 1 && run.areaId === area.id && outOfEnergy()
  const need = area.roundsToClear
  const done = progress.roundsDone ?? 0

  const sub = busy
    ? t('ui.home.backToEncounter')
    : gym
      ? t('ui.home.gymReady', { name: trainerTitle(gym) })
      : boss
        ? t('ui.home.legendReady')
        : closed
          ? t('ui.home.closed')
          : empty && energy?.nextAt != null
            ? t('ui.area.outOfEnergy', { time: countdown(energy.nextAt - energy.now) })
            : progress.cleared
              ? t('ui.home.freePlay')
              : need != null
                ? t('ui.home.roundOf', { n: Math.min(done + 1, need), total: need })
                : t('ui.home.secretArea')

  const explore = () => {
    ensureRun(area)
    rollNext()
    if (useGame.getState().run.phase !== 'idle') navigate('/area')
  }
  const go = () => {
    if (busy) return navigate('/area')
    if (gym || boss) {
      ensureRun(area)
      challenge()
      if (useGame.getState().run.phase !== 'idle') navigate('/area')
      return
    }
    explore()
  }
  const off = !busy && !gym && !boss && (closed || empty)
  const label = gym
    ? t('ui.area.challenge', { name: gym.name.toUpperCase() })
    : boss
      ? t('ui.area.faceIt')
      : t('ui.common.continue')
  return { label, sub, go, explore, off, gym, boss, closed, empty, busy, cleared: progress.cleared }
}

/**
 * The Areas button and CONTINUE, the one big action (useContinue). When a gym or a legendary waits, "keep exploring"
 * sits under it; in a cleared area, auto-mode.
 */
export function ContinueBar({
  area,
  areasState,
  onAreas,
}: {
  area: Area
  /** plain, a NEW dot (a secret area opened), or gold: a new region is open. */
  areasState: 'plain' | 'new' | 'region'
  onAreas: () => void
}) {
  const { t } = useT()
  const { label, sub, go, explore, off, gym, boss, closed, empty, busy, cleared } = useContinue(area)
  const subId = useId()

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2.5">
        <button
          type="button"
          onClick={onAreas}
          aria-haspopup="dialog"
          aria-label={
            areasState === 'region'
              ? t('ui.home.areasNewRegion')
              : areasState === 'new'
                ? t('ui.home.areasNew')
                : t('ui.home.areasLabel')
          }
          className={cx(
            'pixel-btn relative flex min-h-[72px] flex-col items-center justify-center gap-0.5 px-0.5',
            areasState === 'region' && 'frame-gold sheen',
          )}
        >
          <PixelIcon name="map" size={24} />
          <span className="whitespace-normal text-center font-pixel-sm text-[15px] uppercase leading-none tracking-[0.04em]">
            {areasState === 'region' ? t('ui.home.newRegion') : t('ui.home.areas')}
          </span>
          {areasState === 'new' && (
            <span className="absolute -right-2 -top-2 z-[1] bg-gold px-1 pb-0.5 font-pixel-sm text-[13px] leading-none text-ink shadow-ring">
              {t('ui.common.new')}
            </span>
          )}
        </button>
        <PixelButton
          variant="primary"
          size="xl"
          className={cx('w-full', !off && 'sheen')}
          disabled={off}
          onClick={go}
          aria-label={label}
          aria-describedby={subId}
        >
          <span className="flex min-w-0 items-center gap-3">
            <PixelIcon
              name={gym || boss ? 'sword' : 'play'}
              size={24}
              color={gym || boss || off ? undefined : '#ffffff'}
            />
            <span className="grid min-w-0 gap-[3px] text-left">
              <span className="truncate leading-none">{label}</span>
              <span
                id={subId}
                className={cx(
                  'truncate font-pixel-sm text-[16px] normal-case leading-none tracking-[0.02em] [text-shadow:none]',
                  off ? 'text-muted' : 'text-[#ffe2db]',
                )}
              >
                {sub}
              </span>
            </span>
          </span>
        </PixelButton>
      </div>
      {(gym || boss || cleared) && !busy && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(gym || boss) && !closed && (
            <PixelButton size="sm" onClick={explore} disabled={empty}>
              {t('ui.home.keepExploring')}
            </PixelButton>
          )}
          {cleared && <AutoModeToggle />}
        </div>
      )}
    </div>
  )
}
