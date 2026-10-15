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
  openRaidIn,
  playerSideOf,
  portalModeOf,
  portalStateOf,
  progressOf,
  raidRules,
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
import { serverNow } from '@/store/serverTime'
import { challenge, enterArea, outOfEnergy, rollNext } from '@/store/run'
import { travelTo } from '@/store/travel'
import { cx } from '@/theme/util'
import { progressRaidPath } from '../events/progressRaids'

/** The run must be in this area before anything is rolled: arriving from another one starts it afresh. */
function ensureRun(area: Area) {
  const run = useGame.getState().run
  if (run.areaId !== area.id) enterArea(area.id)
}

/**
 * What CONTINUE does and says in an area: the next encounter (rollNext → its preview on /area), or the gym or legendary
 * waiting at the end of the rounds, or the area's progression raid once it's completed (docs/24: its page, like a gym
 * leader's challenge); back to the encounter when one is under way; nothing when the area is closed or the energy is out.
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
  // A portal area (docs/28): no gym or legendary; before its run, CONTINUE goes in (the breach, its pop-up); once won,
  // it is only its raid, then sealed.
  const mode = portalModeOf(area, data)
  const portal = mode ? portalStateOf(save, area.id) : null
  const gym = mode ? null : dueGym(area, progress, data, side)
  const boss = gym || mode ? null : dueBoss(area, progress, teamAverageLevel(save), data)
  const closed = isAreaClosed(save, area.id, data) || !!portal?.won
  const busy = (run.areaId === area.id && run.phase !== 'idle') || battle
  const raid = gym || boss || busy ? null : openRaidIn(save, data, area)
  const raidName = raid ? (data.species[raid.dex]?.name ?? '') : ''
  // Re-checked every second (useEnergy ticks): a Center the game sends next is free even at 0.
  const empty = !!energy && energy.value < 1 && run.areaId === area.id && outOfEnergy()
  const need = area.roundsToClear || null
  const done = progress.roundsDone ?? 0
  // Extreme mode (docs/22): nobody can fight and no Center will come — the team rests.
  const resting = !busy && !hasAbleTeam(save) && !centersOn(save, data)
  const back = resting ? firstComeback(save, data) : null

  const enter = !!mode && !portal?.active && !portal?.won && !busy
  const sub = busy
    ? t('ui.home.backToEncounter')
    : enter
      ? t('ui.portal.enterSub', { n: mode!.portals })
      : raid && portal?.won
        ? t('ui.raid.progress.continueSub', { level: raidRules(data, raid.dex, 'progress', raid.areaId).level })
      : portal?.won
        ? t('ui.portal.sealed')
      : portal?.active
        ? t('ui.portal.continueSub', { n: portal.closed, total: mode!.portals })
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
        : raid
          ? t('ui.raid.progress.continueSub', { level: raidRules(data, raid.dex, 'progress', raid.areaId).level })
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
    if (raid) return navigate(progressRaidPath(raid))
    if (enter || (portal?.active && portal.offers?.length)) {
      ensureRun(area)
      return navigate('/area')
    }
    if (gym || boss) {
      ensureRun(area)
      challenge()
      if (useGame.getState().run.phase !== 'idle') navigate('/area')
      return
    }
    explore()
  }
  const off = !busy && !raid && !enter && (resting || (!gym && !boss && (closed || empty)))
  // Under CONTINUE: the green GO TO when behind in the region's main chain (not mid-encounter), and "keep exploring"
  // when a gym or a legendary waits. Home sizes its scene around them.
  const latest = useGame((s) => (busy || !s.save ? null : latestOpenArea(s.save, s.data, serverNow())))
  const keepExploring = !!(gym || boss || raid) && !closed && !busy && !resting
  const label = enter
    ? t('ui.portal.enter')
    : gym
    ? t('ui.area.challenge', { name: gym.name.toUpperCase() })
    : boss
      ? t('ui.area.faceIt')
      : raid
        ? t('ui.raid.progress.continue', { name: raidName.toUpperCase() })
        : t('ui.common.continue')
  return { label, sub, go, explore, off, gym, boss, raid, closed, empty, busy, resting, cleared: progress.cleared, latest, keepExploring, enter }
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
  const { label, sub, go, explore, off, gym, boss, raid, empty, resting, latest, keepExploring } = useContinue(area)
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
              name={gym || boss || raid ? 'sword' : 'play'}
              size={24}
              color={gym || boss || raid || off ? undefined : '#ffffff'}
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
      {latest && (
        <PixelButton variant="success" size="lg" className="w-full" onClick={() => travelTo(latest)}>
          <PixelIcon name="map" size={20} />
          {t('ui.victory.goToArea', { name: latest.name })}
        </PixelButton>
      )}
      {keepExploring && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PixelButton size="sm" onClick={explore} disabled={empty}>
            {t('ui.home.keepExploring')}
          </PixelButton>
        </div>
      )}
    </div>
  )
}
