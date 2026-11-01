import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  centersOn,
  wipeCenterDue,
  dueBoss,
  dueGym,
  firstComeback,
  hasAbleTeam,
  isAreaClosed,
  isAreaSealed,
  latestOpenArea,
  heldIn,
  nightmareModeOf,
  nightmareStateOf,
  whiteoutModeOf,
  whiteoutStateOf,
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
import { NewTag } from '@/components/Chip'
import { RestingPanel } from '@/components/Extreme'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { countdown, trainerTitle } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { serverNow } from '@/store/serverTime'
import { challenge, enterArea, rollNext } from '@/store/run'
import { travelTo } from '@/store/travel'
import { cx } from '@/theme/util'
import { progressRaidPath } from '../events/progressRaids'
import { ShinyParadeChip, useParadeLabel } from '../events/live'
import { levelText, useLevelSpan } from './AreaPlate'
import { RoundGauge } from '@/screens/area/RoundGauge'

/** The run must be in this area before anything is rolled: arriving from another one starts it afresh. */
function ensureRun(area: Area) {
  const run = useGame.getState().run
  if (run.areaId !== area.id) enterArea(area.id)
}

/**
 * What CONTINUE does and says in an area: the next encounter (rollNext → its preview on /area), or the gym or legendary
 * waiting at the end of the rounds, or the area's progression raid once it's completed (docs/24: its page, like a gym
 * leader's challenge); back to the encounter when one is under way; nothing when the area is closed.
 */
export function useContinue(area: Area) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const battle = useGame((s) => !!s.battle)
  const now = useNow()

  const progress = progressOf(save, area.id)
  const side = playerSideOf(save)
  // A portal area (docs/28): no gym or legendary; before its run, CONTINUE goes in (the breach, its pop-up); once won,
  // it is only its raid, then sealed.
  const mode = portalModeOf(area, data)
  const portal = mode ? portalStateOf(save, area.id) : null
  // A nightmare area (docs/30): the same way: before it, CONTINUE goes to its way in; once over, only its raid.
  const dreamMode = nightmareModeOf(area, data)
  const dream = dreamMode ? nightmareStateOf(save, area.id) : null
  // The whiteout's area (docs/61 §4.3): before it, CONTINUE goes to its way in; its boss is its own last step.
  const whiteMode = whiteoutModeOf(area, data)
  const white = whiteMode ? whiteoutStateOf(save, area.id) : null
  const gym = mode || dreamMode || whiteMode ? null : dueGym(area, progress, data, side)
  const boss = gym || mode || dreamMode || whiteMode ? null : dueBoss(area, progress, teamAverageLevel(save), data)
  const closed = isAreaClosed(save, area.id, data) || isAreaSealed(save, data, area.id)
  const busy = (run.areaId === area.id && run.phase !== 'idle') || battle
  const raid = gym || boss || busy ? null : openRaidIn(save, data, area)
  const raidName = raid ? (data.species[raid.dex]?.name ?? '') : ''
  const need = area.roundsToClear || null
  const done = progress.roundsDone ?? 0
  // Extreme mode (docs/22): nobody can fight and no Center will come — the team rests.
  // With its boon Centers (docs/47), a K.O. here sends the Center that swaps instead.
  const resting = !busy && !hasAbleTeam(save) && !centersOn(save, data) && !wipeCenterDue(save, area.id, data)
  const back = resting ? firstComeback(save, data) : null

  const enterPortal = !!mode && !portal?.active && !portal?.won && !busy
  const enterDream = !!dreamMode && !dream?.active && !dream?.won && !busy
  const enterWhite = !!whiteMode && !white?.active && !white?.won && !busy
  const enter = enterPortal || enterDream || enterWhite
  // Darkrai's strike waits on the area's page after a round (docs/30); so does a bonfire after a wave (docs/61).
  const struck =
    (!!dream?.active && (!!dream.strike || (run.areaId === area.id && !!run.nightmareStruck))) ||
    (!!white?.active && !!white.bonfire)
  const sub = busy
    ? t('ui.home.backToEncounter')
    : enterWhite
      ? t('ui.whiteout.enterSub', { n: whiteMode!.waves.length })
    : white?.won
      ? t('ui.whiteout.sealed')
    : white?.active
      ? white.bonfire
        ? t('ui.whiteout.bonfireSub')
        : white.boss
          ? t('ui.whiteout.bossSub')
          : t('ui.whiteout.continueSub', { n: Math.min(white.wave + 1, whiteMode!.waves.length), total: whiteMode!.waves.length })
    : enterDream
      ? t('ui.nightmare.enterSub', { n: dreamMode!.foes.length })
      : enter
      ? t('ui.portal.enterSub', { n: mode!.portals })
      : raid && dream?.won
        ? t('ui.raid.progress.continueSub', { level: raidRules(data, raid.dex, 'progress', raid.areaId).level })
      : dream?.won
        ? t('ui.nightmare.sealed')
      : dream?.active
        ? t('ui.nightmare.continueSub', { n: Math.min(dream.round + 1, dreamMode!.foes.length), total: dreamMode!.foes.length })
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
            time: countdown(back.at - now),
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
          : progress.cleared
            ? t('ui.home.freePlay')
            : need != null
              ? t('ui.home.roundOf', { n: Math.min(done + 1, need), total: need })
              : t('ui.home.secretArea')

  const off = !busy && !raid && !enter && (resting || (!gym && !boss && closed))
  /** What waits in another area of the chain: its gym leader, its legend, or the round to play. */
  const waitsIn = (to: Area) => {
    const p = progressOf(save, to.id)
    const leader = dueGym(to, p, data, side)
    const rounds = to.roundsToClear || null
    if (leader) return t('ui.home.gymReady', { name: trainerTitle(leader) })
    if (dueBoss(to, p, teamAverageLevel(save), data)) return t('ui.home.legendReady')
    return rounds != null
      ? t('ui.home.roundOf', { n: Math.min((p.roundsDone ?? 0) + 1, rounds), total: rounds })
      : t('ui.home.secretArea')
  }
  const explore = () => {
    ensureRun(area)
    rollNext()
    if (useGame.getState().run.phase !== 'idle') navigate('/area')
  }
  const go = () => {
    if (busy) return navigate('/area')
    // Shut (sealed, resting): CONTINUE is greyed out, and the map's CONTINUE HERE says why instead.
    if (off) return pushToast(sub, 'info')
    if (raid) return navigate(progressRaidPath(raid))
    if (enter || (portal?.active && portal.offers?.length) || struck) {
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
  // Behind in the region's main chain (not mid-encounter): the furthest open area, where the story goes on.
  const latest = useGame((s) => (busy || !s.save ? null : latestOpenArea(s.save, s.data, serverNow())))
  // With nothing of its own waiting here (a cleared area's free play), CONTINUE itself becomes GO TO that area: the red
  // button moved nothing on, and the green one under it did. "Stay here" keeps the free play. Anything else here (a gym,
  // a legend, a raid, a secret area's rounds, a portal, the nightmare, or a closed area's shut CONTINUE saying why)
  // keeps CONTINUE, with the green GO TO under it. Home sizes its scene around what sits under the button.
  const behind =
    !!latest &&
    !busy &&
    !resting &&
    !gym &&
    !boss &&
    !raid &&
    !enter &&
    !struck &&
    !portal?.active &&
    !dream?.active &&
    !white?.active &&
    !closed &&
    progress.cleared
  // GO TO's two lines: the area, and what waits for the player there (the gym, the legend, the round).
  const goTo =
    behind && latest
      ? { area: latest, label: t('ui.victory.goToArea', { name: latest.name }), sub: waitsIn(latest) }
      : null
  const keepExploring = !!(gym || boss || raid) && !closed && !busy && !resting
  const label = enterWhite
    ? t('ui.whiteout.enter')
    : enterDream
    ? t('ui.nightmare.enter')
    : enter
    ? t('ui.portal.enter')
    : gym
    ? t('ui.area.challenge', { name: gym.name.toUpperCase() })
    : boss
      ? t('ui.area.faceIt')
      : raid
        ? t('ui.raid.progress.continue', { name: raidName.toUpperCase() })
        : t('ui.common.continue')
  return {
    label,
    sub,
    go,
    explore,
    off,
    gym,
    boss,
    raid,
    closed,
    busy,
    resting,
    cleared: progress.cleared,
    latest,
    goTo,
    keepExploring,
    enter,
  }
}

/**
 * The one big action: its label (CONTINUE, the challenge waiting, GO TO), and under it what comes next. Greyed out
 * (`off`) when it can't start, and a tap says why.
 */
export function ContinueButton({
  label,
  sub,
  icon,
  off = false,
  onClick,
}: {
  label: string
  sub: string
  icon: 'play' | 'sword' | 'map'
  off?: boolean
  onClick: () => void
}) {
  const subId = useId()
  return (
    <PixelButton
      variant="primary"
      size="xl"
      className={cx('w-full', !off && 'sheen')}
      disabled={off}
      onClick={onClick}
      aria-label={label}
      aria-describedby={subId}
    >
      <span className="flex min-w-0 items-center gap-3">
        {/* The play arrow in white on the red; the sword and the map keep their own colours. */}
        <PixelIcon name={icon} size={24} color={icon === 'play' && !off ? '#ffffff' : undefined} />
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
  )
}

/**
 * The green map square left of the big action (the user's call, 2026-11-01): the Areas sheet in the thumb's reach, the
 * same one the area button on the scene opens. Shut by Darkrai's nightmare: a tap says why.
 */
export function MapButton({ heldWhy, onOpen }: { heldWhy: string | null; onOpen: () => void }) {
  const { t } = useT()
  return (
    <PixelButton
      variant={heldWhy ? 'secondary' : 'success'}
      size="xl"
      // As tall as CONTINUE (xl, 72px), narrow: the label under the icon.
      className={cx('h-full w-[76px] shrink-0 !px-1 !py-1.5', heldWhy && 'hatched')}
      shut={heldWhy}
      onClick={onOpen}
      aria-label={t('ui.home.areas')}
      aria-haspopup={heldWhy ? undefined : 'dialog'}
      data-map-button
    >
      <span className="flex flex-col items-center gap-1">
        <PixelIcon name={heldWhy ? 'lock' : 'map'} size={28} />
        <span className="font-pixel-sm text-[16px] leading-none tracking-[0.04em]">{t('ui.home.areas')}</span>
      </span>
    </PixelButton>
  )
}

/** Under GO TO: the free play where the player stands, as CONTINUE gave it (`sub` says what it is, for screen readers). */
export function StayHere({ sub, onClick }: { sub: string; onClick: () => void }) {
  const { t } = useT()
  return (
    // A real button, the secondary beside GO TO's red (the user's call, 2026-10-27: an underlined word read as a link).
    <PixelButton size="md" className="w-full" onClick={onClick} aria-label={`${t('ui.home.stayHere')} · ${sub}`}>
      {t('ui.home.stayHere')}
    </PixelButton>
  )
}


/** What the area button's tag says: nothing, a secret area opened (NEW), or a new region open. */
export type AreasState = 'plain' | 'new' | 'region'

/** The area's rounds as pips: done gold, the next one pale gold, the rest empty (none for a secret area or a league). */
export function RoundPips({ need, done, className }: { need: number; done: number; className?: string }) {
  return (
    <span className={cx('flex min-w-0 gap-[3px]', className)} aria-hidden>
      {Array.from({ length: Math.min(need, 12) }, (_, i) => (
        <i
          key={i}
          className={cx(
            'h-2 max-w-[28px] flex-1',
            i < done ? 'bg-gold shadow-ring' : i === done ? 'bg-gold-light shadow-ring' : 'bg-line shadow-ring-line',
          )}
        />
      ))}
    </span>
  )
}

/**
 * The area button (docs/43 §5.2): where the player is — the area's name, its levels and its rounds as pips — and the
 * way to the Areas sheet (the area's details first, then the region's list). It took the plate's place over the scene.
 * Shut by Darkrai's nightmare: a tap says why.
 */
export function AreaButton({
  area,
  areasState,
  heldWhy,
  onOpen,
}: {
  area: Area
  areasState: AreasState
  /** Why the player can't leave (the nightmare), or null. */
  heldWhy: string | null
  onOpen: () => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const heldBy = useGame((s) => heldIn(s.save, s.data)?.by ?? 'nightmare')
  // The round's own steps when the encounters are dealt from a deck (the area's gauge), its rounds as pips otherwise.
  const steps = useGame((s) => s.data.config.showRoundGauge && s.data.config.encounterMode === 'deck')
  const p = progressOf(save, area.id)
  const span = useLevelSpan(area)
  const need = area.roundsToClear || null
  const done = p.cleared && need != null ? need : Math.min(p.roundsDone ?? 0, need ?? 0)
  const levels = levelText(span)
  const rounds =
    need != null
      ? t('ui.home.roundsDone', { done, total: need })
      : area.roundsToClear === 0
        ? t('ui.home.league')
        : t('ui.home.secretArea')
  const parade = useParadeLabel(area)
  const news =
    areasState === 'region' ? t('ui.home.areasNewRegion') : areasState === 'new' ? t('ui.home.areasNew') : ''
  return (
    <button
      type="button"
      // Shut by the nightmare: a tap says why instead of opening the sheet (still a button, for its reason).
      onClick={heldWhy ? () => pushToast(heldWhy, 'info') : onOpen}
      aria-haspopup={heldWhy ? undefined : 'dialog'}
      aria-disabled={heldWhy ? true : undefined}
      aria-label={
        heldWhy
          ? `${area.name} · ${t(`ui.${heldBy}.areasLocked`)}`
          : [t('ui.home.areaButton', { area: area.name, levels, rounds }), news].filter(Boolean).join('. ') + parade
      }
      data-area-button
      className={cx(
        'pixel-btn relative flex min-h-[56px] w-full min-w-0 items-center gap-2.5 py-1.5 pl-2.5 pr-3 text-left',
        heldWhy && 'hatched',
      )}
    >
      <PixelIcon name={heldWhy ? 'lock' : 'map'} size={24} className="shrink-0" />
      <span className="grid min-w-0 flex-1 gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[22px] leading-none">{area.name}</span>
          <ShinyParadeChip area={area} />
          {/* A new region on offer has its notice on Home; the button only says so to screen readers. */}
          {!heldWhy && areasState === 'new' && <NewTag />}
          {/* The levels in the top right corner, the round's steps across the width under them (the user, 2026-10-27). */}
          <span className="whitespace-nowrap font-pixel-sm text-[16px] leading-none text-muted">{levels}</span>
        </span>
        {need != null && steps ? (
          <RoundGauge area={area} progress={p} banner />
        ) : need != null ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <RoundPips need={need} done={done} className="flex-1" />
            {/* The pips in words too: colour is never alone. */}
            <span className="whitespace-nowrap font-pixel-sm text-[16px] leading-none tabular-nums" aria-hidden>
              {done}/{need}
            </span>
          </span>
        ) : (
          <span className="truncate font-pixel-sm text-[16px] leading-none text-muted">{rounds}</span>
        )}
      </span>
    </button>
  )
}

/**
 * Home's PLAY dock (docs/43 §5.2): the area button, then the one big action (useContinue). Behind in the region's main
 * chain with nothing waiting here, the big action is GO TO the furthest open area, with "Stay here" (the free play)
 * under it; otherwise CONTINUE, with the green GO TO and "keep exploring" (when a gym or a legendary waits) under it in
 * one row. The green map square (`MapButton`, the Areas sheet) stands left of the big action. Phones pin it over the
 * tab bar; on PC it heads the column beside the scene. (Auto-mode is switched in the area itself, on the encounter
 * screens.)
 */
export function PlayDock({ area, onAreas }: { area: Area; onAreas?: () => void }) {
  const { t } = useT()
  const { label, sub, go, explore, off, gym, boss, raid, resting, latest, goTo, keepExploring } = useContinue(area)
  // Darkrai's nightmare (docs/30) or the whiteout (docs/61 §4.3) holds the player in its area: the area button is
  // shut, and says why.
  const held = useGame((s) => heldIn(s.save, s.data)?.area ?? null)
  const heldBy = useGame((s) => heldIn(s.save, s.data)?.by ?? 'nightmare')
  const heldWhy = held ? t(`ui.${heldBy}.locked`, { area: held.name }) : null
  const ahead = heldWhy ? null : goTo
  const green = latest && !heldWhy && !ahead ? latest : null

  return (
    <div className="flex flex-col gap-2">
      {/* The area's banner stands on the scene (the user's call, 2026-10-27); the dock keeps what is played. */}
      {heldWhy && (
        <p
          className="m-0 flex items-start gap-2 bg-well p-2 font-pixel-sm text-[16px] leading-tight text-muted shadow-ring-line"
        >
          <PixelIcon name="lock" size={16} className="mt-px shrink-0" />
          <span>{heldWhy}</span>
        </p>
      )}
      {resting && <RestingPanel />}
      {/* The green map square beside the big action opens the Areas sheet, as the area button on the scene does. */}
      <div className="flex items-stretch gap-2">
        {onAreas && <MapButton heldWhy={heldWhy} onOpen={onAreas} />}
        <div className="min-w-0 flex-1">
          {ahead ? (
            <ContinueButton label={ahead.label} sub={ahead.sub} icon="map" onClick={() => travelTo(ahead.area)} />
          ) : (
            <ContinueButton
              label={label}
              sub={sub}
              icon={gym || boss || raid ? 'sword' : 'play'}
              off={off}
              onClick={go}
            />
          )}
        </div>
      </div>
      {/* The free play stays a tap away under GO TO. */}
      {ahead && <StayHere sub={sub} onClick={go} />}
      {(green || keepExploring) && (
        <div className={cx('grid gap-2', green && keepExploring && 'grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]')}>
          {keepExploring && (
            <PixelButton size="sm" className="w-full" onClick={explore}>
              {t('ui.home.keepExploring')}
            </PixelButton>
          )}
          {green && (
            <PixelButton variant="success" size="sm" className="w-full" onClick={() => travelTo(green)}>
              <PixelIcon name="map" size={18} />
              {t('ui.victory.goToArea', { name: green.name })}
            </PixelButton>
          )}
        </div>
      )}
    </div>
  )
}
