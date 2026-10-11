import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  centersOn,
  dueBoss,
  dueGym,
  firstComeback,
  hasAbleTeam,
  isAreaClosed,
  latestOpenArea,
  playerSideOf,
  progressOf,
  teamAverageLevel,
  type Area,
} from '@/engine'
import { useT } from '@/i18n/react'
import { RestingPanel } from '@/components/Extreme'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { countdown, trainerTitle } from '@/lib/format'
import { useGame } from '@/store/game'
import { useEnergy } from '@/store/hooks'
import { challenge, enterArea, outOfEnergy, rollNext } from '@/store/run'
import { travelTo } from '@/store/travel'
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
  // Extreme mode (docs/22): nobody can fight and no Center will come — the team rests.
  const resting = !busy && !hasAbleTeam(save) && !centersOn(save, data)
  const back = resting ? firstComeback(save, data) : null

  const sub = busy
    ? t('ui.home.backToEncounter')
    : resting
      ? back
        ? t('ui.extreme.card.resting', {
            name: data.species[back.inst.dex]?.name ?? '',
            time: countdown(back.at - (energy?.now ?? Date.now())),
          })
        : t('ui.extreme.resting.title')
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
  const off = !busy && (resting || (!gym && !boss && (closed || empty)))
  const label = gym
    ? t('ui.area.challenge', { name: gym.name.toUpperCase() })
    : boss
      ? t('ui.area.faceIt')
      : t('ui.common.continue')
  return { label, sub, go, explore, off, gym, boss, closed, empty, busy, resting, cleared: progress.cleared }
}

/**
 * The Areas button and CONTINUE, the one big action (useContinue). Under it, when the player is behind in the region's
 * main chain, the green GO TO its furthest open area; when a gym or a legendary waits, "keep exploring". (Auto-mode is switched in the area itself, on the encounter screens.)
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
  const { label, sub, go, explore, off, gym, boss, closed, empty, busy, resting } = useContinue(area)
  const subId = useId()
  // Behind in the region's main chain: one tap to its furthest open area (not mid-encounter).
  const latest = useGame((s) => (s.save ? latestOpenArea(s.save, s.data) : null))

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
      {resting && <RestingPanel />}
      {latest && !busy && (
        <PixelButton variant="success" size="lg" className="w-full" onClick={() => travelTo(latest)}>
          <PixelIcon name="map" size={20} />
          {t('ui.victory.goToArea', { name: latest.name })}
        </PixelButton>
      )}
      {(gym || boss) && !closed && !busy && !resting && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PixelButton size="sm" onClick={explore} disabled={empty}>
            {t('ui.home.keepExploring')}
          </PixelButton>
        </div>
      )}
    </div>
  )
}
