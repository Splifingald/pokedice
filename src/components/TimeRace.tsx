// The race of time and space (docs/61 §4.4, docs/15 §48): its way in (the intro: a clock face and a rift of space over
// Spear Pillar, "Tap to continue ▼", then its pop-up: the short rules, TEAM, NOT NOW / READY!), the big countdown, the
// gauge of fights with each fork's type, a fork's two gates (their type colours and finds), its rules from INFO, and the
// win (the legend's roar, time and space settling). The scenes are the pixel engine's (src/fx/timelines/timeRace.ts).
// Every number comes from the engine (the area's mode, the try's plan, the clock); these pieces only show them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameData, PokeType, TimeRaceGate, TimeRaceMode, TimeRacePlan } from '@/engine'
import { fxSound } from '@/audio/sfx'
import { playCry } from '@/audio/cries'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { raceIntroTimeline, raceLoop, raceWinTimeline, TR, type RaceSide } from '@/fx/timelines/timeRace'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { typeName } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { badgeColors, cx, typeColor } from '@/theme/util'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useBoxSize, useFullStage, useLoop } from './PortalFx'
import { RulesModal, RuleList, type RuleRow } from './RulesModal'
import { StageCanvas } from './StageCanvas'
import { TypeBadge } from './TypeBadge'

/** Dialga and Palkia: the legends of time and space (their scenes' colours go by them). */
export const DIALGA = 483
export const PALKIA = 484
export const raceSideOf = (dex: number): RaceSide => (dex === PALKIA ? 'space' : 'time')

/** m:ss, from milliseconds (rounded up, so the clock reads 0:00 only once time is out). */
export function raceTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ------------------------------------------------------------------ the scene on a loop

/** Spear Pillar's clock and rift filling its box (the rules' banner, the way-in pop-up): 2 CSS pixels per art pixel. */
export function RaceScene({ className, still }: { className?: string; still?: boolean }) {
  const { level } = useMotion()
  const hold = still ?? level === 'off'
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = useBoxSize(box)
  const w = size ? Math.max(16, Math.ceil(size.w / 2)) : 0
  const h = size ? Math.max(16, Math.ceil(size.h / 2)) : 0
  useLoop(ref, () => (w && h ? raceLoop(w, h, { still: hold }) : null), hold, [w, h])
  return (
    <div
      ref={box}
      aria-hidden
      className={cx('absolute inset-0 overflow-hidden', className)}
      style={{ background: TR.night }}
    >
      {w > 0 && (
        <canvas
          ref={ref}
          width={w}
          height={h}
          className="pixelated absolute left-0 top-0"
          style={{ width: w * 2, height: h * 2, imageRendering: 'pixelated' }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ the clock

/**
 * The race's countdown: big pixel digits on a night plate with a clock icon. Gold under a minute, red and blinking in its
 * last 30 seconds (still when calm: the colour and a "!" say it). `left`: milliseconds on the clock. A timer for screen
 * readers, its name saying the time; it doesn't announce every second.
 */
export function RaceClock({
  left,
  size = 'big',
  className,
}: {
  left: number
  size?: 'big' | 'small'
  className?: string
}) {
  const { t } = useT()
  const { calm } = useMotion()
  const low = left <= 30_000
  const warn = left <= 60_000
  const text = raceTime(left)
  return (
    <div
      role="timer"
      aria-label={t('ui.timeRace.clock', { time: text })}
      className={cx(
        'inline-flex items-center gap-2 px-3 tabular-nums shadow-ring-line',
        size === 'big' ? 'py-1.5 text-[40px] leading-none' : 'py-1 text-[24px] leading-none',
        className,
      )}
      style={{ background: TR.night, color: low ? '#ff6b6b' : warn ? TR.gold : TR.timeLit }}
      data-race-clock
    >
      <PixelIcon name="clock" size={size === 'big' ? 24 : 16} />
      <span aria-hidden className={cx('font-mono', low && !calm && 'blink')}>
        {text}
      </span>
      {low && (
        <span aria-hidden className="font-pixel-sm text-[18px]">
          !
        </span>
      )}
    </div>
  )
}

/** The clock's tick each second in its last 10 seconds (docs/15 §48), louder than the minutes before. */
export function useRaceTicks(left: number | null) {
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (left == null) return
    const s = Math.ceil(left / 1000)
    if (s !== last.current && s > 0 && s <= 10) fxSound('race.tick', 1)
    last.current = s
  }, [left])
}

// ------------------------------------------------------------------ the gauge

/**
 * The gauge of fights (in the round gauge's place): a tile per fight, grouped by fork, each group in its gate's type
 * colour once taken (grey ahead), the won ones filled, the next one with the gold edge; then "4/15".
 */
export function RaceGauge({
  fights,
  total,
  perFork,
  path,
  className,
}: {
  fights: number
  total: number
  perFork: number
  path: readonly PokeType[]
  className?: string
}) {
  const { t } = useT()
  const done = Math.min(fights, total)
  return (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={t('ui.timeRace.gauge', { done, total })}
    >
      <PixelIcon name="clock" size={16} />
      <ol className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => {
          const type = path[Math.floor(i / perFork)]
          const col = type ? typeColor(type) : '#3a3f5c'
          return (
            <li
              key={i}
              className={cx(
                'h-6 min-w-0 flex-1 border-2',
                i === done ? 'border-gold' : 'border-edge',
                i % perFork === 0 && i > 0 && 'ml-1',
              )}
              style={{ borderRadius: 2, background: i < done ? col : `${col}55` }}
            />
          )
        })}
      </ol>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {done}/{total}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ a fork

/** What a gate holds, in words (the toast's and the button's name). */
function useFindText() {
  const { t } = useT()
  return (find: TimeRaceGate['find'], data: GameData) =>
    !find
      ? ''
      : find.kind === 'shard'
        ? t('ui.timeRace.shard', { s: find.seconds })
        : `${data.items[find.key]?.name ?? find.key}${find.qty > 1 ? ` ×${find.qty}` : ''}`
}

/** A time shard: a small pixel hourglass of light (the find a gate shows). */
function ShardIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      <path d="M1 0h5v1h-1v1h-1v1h-1v-1h-1v-1h-1zM3 4h1v1h1v1h1v1h-5v-1h1v-1h1z" fill={TR.timeLit} />
      <path d="M2 1h3v1h-3zM2 5h3v1h-3z" fill={TR.white} />
      <path d="M3 3h1v1h-1z" fill={TR.gold} />
    </svg>
  )
}

/**
 * A fork (docs/15 §48): two gates side by side (one alone for the replay's last), each an archway in its type's colour
 * with the type, what's behind it (an item, or a time shard and its seconds), the next foes' type, and on the last fork
 * the legend whose raid it opens. A gate is one button, its name saying all of that. The clock runs on above it.
 */
export function ForkView({
  gates,
  fork,
  forks,
  perFork,
  legends,
  data,
  onPick,
}: {
  gates: readonly TimeRaceGate[]
  /** This fork's number (1-based) and how many there are. */
  fork: number
  forks: number
  perFork: number
  /** On the last fork: each gate type's legend name. */
  legends?: Partial<Record<PokeType, string>>
  data: GameData
  onPick: (index: number) => void
}) {
  const { t } = useT()
  const findText = useFindText()
  const last = fork >= forks
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus({ preventScroll: true }), [fork])
  return (
    <section className="pixel-panel flex flex-col gap-3 p-3" aria-labelledby="race-fork" data-race-fork>
      <div className="grid gap-1">
        <h2 id="race-fork" className="m-0 text-[28px] font-normal leading-none">
          {last
            ? gates.length > 1
              ? t('ui.timeRace.forkLast')
              : t('ui.timeRace.forkOnly')
            : t('ui.timeRace.forkTitle', { n: fork, total: forks })}
        </h2>
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.timeRace.forkBody', { n: perFork })}
        </p>
      </div>
      <div className={cx('grid gap-3', gates.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {gates.map((g, i) => {
          const col = typeColor(g.type)
          const { bg, fg } = badgeColors(col)
          const legend = legends?.[g.type]
          const find = findText(g.find, data)
          return (
            <button
              key={`${g.type}-${i}`}
              ref={i === 0 ? first : undefined}
              type="button"
              onClick={() => {
                fxSound(g.find?.kind === 'shard' ? 'race.shard' : 'race.gate')
                onPick(i)
              }}
              aria-label={
                t('ui.timeRace.gateLabel', { type: typeName(g.type), find: find || '—' }) +
                (legend ? ` · ${t('ui.timeRace.gateFor', { name: legend })}` : '')
              }
              className="group relative flex min-h-[188px] flex-col items-center gap-2 overflow-hidden px-2 pb-3 pt-4 text-center shadow-ring-line outline-offset-4"
              style={{ background: TR.deep }}
              data-gate={g.type}
            >
              {/* The archway: two pillars of the type's colour and a lintel, its light inside. */}
              <span aria-hidden className="absolute inset-x-3 top-2 h-[10px]" style={{ background: col }} />
              <span
                aria-hidden
                className="absolute bottom-0 left-3 top-2 w-[10px]"
                style={{ background: col }}
              />
              <span
                aria-hidden
                className="absolute bottom-0 right-3 top-2 w-[10px]"
                style={{ background: col }}
              />
              <span
                aria-hidden
                className="absolute inset-x-[22px] bottom-0 top-[12px] opacity-40 group-hover:opacity-60"
                style={{ background: `repeating-linear-gradient(0deg, ${col} 0 2px, transparent 2px 4px)` }}
              />
              <span className="relative mt-2">
                <TypeBadge type={g.type} />
              </span>
              <span className="relative grid min-h-[44px] place-items-center" aria-hidden>
                {g.find?.kind === 'shard' ? (
                  <ShardIcon size={36} />
                ) : g.find?.kind === 'item' ? (
                  <ItemSprite item={data.items[g.find.key]} size={36} />
                ) : null}
              </span>
              <span
                className="relative px-1.5 font-pixel-sm text-[16px] leading-tight"
                style={{ background: bg, color: fg }}
                aria-hidden
              >
                {find}
              </span>
              {legend && (
                <span
                  className="relative font-pixel-sm text-[16px] leading-tight"
                  style={{ color: TR.gold }}
                  aria-hidden
                >
                  {t('ui.timeRace.gateFor', { name: legend })}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ its rules

/**
 * The race's rules, short (as the nightmare's): four one-line rows from the try's plan and the area's numbers: the
 * fights and the clock, the forks and their finds, the last gate's legends, the rest (no Center, no catch, one speed,
 * back to the start).
 */
export function useTimeRaceRules(mode: TimeRaceMode, plan: TimeRacePlan, data: GameData): RuleRow[] {
  const { t } = useT()
  const name = (dex: number) => data.species[dex]?.name ?? `#${dex}`
  const lastTypes = plan.forks[plan.forks.length - 1] ?? []
  const legends = mode.legends.filter((l) => lastTypes.includes(l.type))
  return [
    {
      icon: 'clock',
      title: t('ui.timeRace.rule.clock', { n: plan.total, time: raceTime(plan.seconds * 1000) }),
      text: plan.replay ? t('ui.timeRace.rule.replay', { n: plan.levelBonus }) : '',
    },
    {
      icon: 'map',
      title: t('ui.timeRace.rule.forks', { n: mode.perFork }),
      text: t('ui.timeRace.rule.finds', { s: mode.shard.seconds }),
    },
    {
      icon: 'star',
      title:
        legends.length > 1
          ? t('ui.timeRace.rule.legends', {
              a: typeName(legends[0]!.type),
              aName: name(legends[0]!.dex),
              b: typeName(legends[1]!.type),
              bName: name(legends[1]!.dex),
            })
          : t('ui.timeRace.rule.legend', {
              a: typeName(legends[0]?.type ?? 'normal'),
              aName: name(legends[0]?.dex ?? 0),
            }),
      text: '',
    },
    { icon: 'lock', title: t('ui.timeRace.rule.lock'), text: t('ui.timeRace.rule.lockText') },
  ]
}

/** The rules pop-up from INFO (OK): the same rows as the way in's pop-up. */
export function TimeRaceRulesModal({
  open,
  onClose,
  mode,
  plan,
  data,
}: {
  open: boolean
  onClose: () => void
  mode: TimeRaceMode
  plan: TimeRacePlan
  data: GameData
}) {
  const { t } = useT()
  const rules = useTimeRaceRules(mode, plan, data)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.timeRace.title')}
      picture={<RaceScene />}
      icon="clock"
      rules={rules}
    />
  )
}

// ------------------------------------------------------------------ the way in

/**
 * The way in's pop-up (as the Distortion World's, PortalEntryDialog): the short rules, TEAM (healed as at a Pokémon
 * Center, the team can still change), NOT NOW and READY!. Over the intro's held end, at the bottom of the screen and up
 * to 92 % of its height; on its own (`banner`, the kitchen sink), the scene as its picture.
 */
export function TimeRaceEntryDialog({
  open,
  mode,
  plan,
  data,
  onReady,
  onNotNow,
  onTeam,
  banner = true,
}: {
  open: boolean
  mode: TimeRaceMode
  plan: TimeRacePlan
  data: GameData
  onReady: () => void
  onNotNow: () => void
  onTeam?: () => void
  banner?: boolean
}) {
  const { t } = useT()
  const rules = useTimeRaceRules(mode, plan, data)
  return (
    <Modal
      open={open}
      onClose={onNotNow}
      title={t(plan.replay ? 'ui.timeRace.enterReplayTitle' : 'ui.timeRace.enterTitle')}
      bottom={!banner}
      className={cx('max-w-md', !banner && 'flex !max-h-[92dvh] flex-col')}
    >
      <div className={cx('flex flex-col gap-3', !banner && 'min-h-0 flex-1')}>
        {banner && (
          <div className="relative -mx-4 h-[150px] overflow-hidden" aria-hidden>
            <RaceScene />
          </div>
        )}
        <div className={cx(!banner && 'pixel-scroll -mr-2 min-h-0 flex-1 overflow-y-auto pr-2')}>
          <RuleList rules={rules} />
        </div>
        {onTeam && (
          <div className="flex items-center gap-2.5 bg-well p-2.5 shadow-ring-line">
            <PixelIcon name="heart" size={20} className="shrink-0" />
            <p className="m-0 min-w-0 flex-1 text-[18px] leading-tight">{t('ui.timeRace.teamHint')}</p>
            <PixelButton className="shrink-0" onClick={onTeam}>
              {t('ui.portal.team')}
            </PixelButton>
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton onClick={onNotNow}>{t('ui.portal.notNow')}</PixelButton>
          <PixelButton variant="primary" onClick={onReady}>
            {t('ui.portal.ready')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/** The line under a full-screen scene: a card in the scene's colours (the night, time's blue, space's pink). */
const LINE_CARD =
  'm-0 max-w-md px-4 py-3 text-center leading-tight text-white shadow-[inset_0_3px_0_#a8c8ff,inset_0_-3px_0_#e88ac0,0_0_0_3px_#05061a]'

/**
 * The intro, full screen (raceIntroTimeline): the area darkens into Spear Pillar's night, the clock appears, its hands
 * racing backwards, and the rift of space tears open; the line from then. It holds its end and waits for the player:
 * "Tap to continue ▼" blinks, a tap, a click, Enter or Space calls `onContinue`. No skip (as the breach): `short` in half
 * the time; motion off: its end at once, still, waiting too. `under`: its pop-up is up over it.
 */
export function TimeRaceIntro({
  onContinue,
  picture,
  instant = false,
  under = false,
}: {
  onContinue: () => void
  picture?: string | null
  instant?: boolean
  under?: boolean
}) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(200)
  const prompt = useRef<HTMLButtonElement>(null)
  const [line, setLine] = useState(instant)
  const [end, setEnd] = useState(false)
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: Promise.all(picture ? [loadItemSprite(picture)] : []),
      timeline: raceIntroTimeline({
        ...size,
        picture: picture ? `item|${picture}` : null,
        short: level === 'short',
      }),
    }),
    // One scene per intro; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    if (end && !under) prompt.current?.focus()
  }, [end, under])
  return (
    <div
      className={cx('fixed inset-0 overflow-hidden', under ? 'z-[89]' : 'z-[95]')}
      style={{ background: TR.night }}
      role={under ? undefined : 'dialog'}
      aria-modal={under ? undefined : true}
      aria-hidden={under || undefined}
      aria-label={under ? undefined : t('ui.timeRace.title')}
      onClick={under || !end ? undefined : onContinue}
      data-race-intro
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        instant={instant}
        size={{ w: size.w, h: size.h }}
        hud={{ beat: (b) => b === 'line' && setLine(true) }}
        onEnd={() => setEnd(true)}
        label={t('ui.timeRace.intro')}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6">
        <p
          className={cx(LINE_CARD, 'text-[24px]', !line && 'invisible')}
          style={{ background: TR.deep }}
          aria-live="polite"
        >
          {t('ui.timeRace.intro')}
        </p>
        {!under && end && (
          <button
            ref={prompt}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onContinue()
            }}
            className="flex min-h-[44px] items-center gap-2 px-3 font-pixel-sm text-[20px] uppercase tracking-[0.04em] text-white outline-offset-4"
          >
            {t('ui.portal.tapContinue')}
            <span aria-hidden className="blink" style={{ color: TR.timeLit }}>
              ▼
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Opening the area before a try, as the Distortion World's breach (PortalEntry): the intro full screen, held at its end
 * until the player taps, then its pop-up over that end. `popup`: the pop-up was already up (back from the Team screen):
 * the end and the pop-up at once.
 */
export function TimeRaceEntry({
  mode,
  plan,
  data,
  picture,
  popup = false,
  onPopup,
  onReady,
  onNotNow,
  onTeam,
}: {
  mode: TimeRaceMode
  plan: TimeRacePlan
  data: GameData
  picture?: string | null
  popup?: boolean
  onPopup?: () => void
  onReady: () => void
  onNotNow: () => void
  onTeam?: () => void
}) {
  const [open, setOpen] = useState(popup)
  const show = useCallback(() => {
    setOpen(true)
    onPopup?.()
  }, [onPopup])
  return (
    <>
      <TimeRaceIntro onContinue={show} picture={picture} instant={popup} under={open} />
      <TimeRaceEntryDialog
        open={open}
        banner={false}
        mode={mode}
        plan={plan}
        data={data}
        onReady={onReady}
        onNotNow={onNotNow}
        onTeam={onTeam}
      />
    </>
  )
}

// ------------------------------------------------------------------ the win

/**
 * The last fight won in time, full screen (raceWinTimeline): the legend's silhouette rising between the clock and the
 * rift, its reveal with its cry, time and space settling, the name card; then "Time and space settle", the raid line, the
 * time it was won with, HEAL & START RAID (the main action, its focus) over the green BACK TO THE WORLD. It can't be
 * skipped; with motion off it is there at once.
 */
export function TimeRaceVictoryView({
  dex,
  name,
  level: lv,
  left,
  onDone,
  onRaid,
}: {
  dex: number
  name: string
  level?: number
  /** Time still on the clock when the last fight was won (ms). */
  left?: number | null
  onDone: () => void
  onRaid?: () => void
}) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(320)
  const [card, setCard] = useState(level === 'off')
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: Promise.all([loadSprite(dex, false, true)]),
      timeline: raceWinTimeline({
        ...size,
        mon: spriteKey(dex, false, true),
        side: raceSideOf(dex),
        name,
        subs: [t('ui.mon.shinyTag'), ...(lv ? [t('ui.common.level.short', { n: lv })] : [])],
        short: level === 'short',
      }),
    }),
    // One scene per win; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return (
    <div
      className="fixed inset-0 z-[95] overflow-hidden"
      style={{ background: TR.night }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="race-won"
      data-race-victory
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        size={{ w: size.w, h: size.h }}
        hud={{
          beat: (b) => {
            if (b === 'roar') playCry(dex)
            if (b === 'card') setCard(true)
          },
        }}
        label={t('ui.portal.shinyName', { name })}
        className="absolute inset-0 h-full w-full"
      />
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6',
          !card && 'invisible',
        )}
      >
        <div className={cx(LINE_CARD, 'grid gap-2')} style={{ background: TR.deep }}>
          <h2
            id="race-won"
            className="m-0 text-[30px] font-normal leading-none"
            style={{ color: TR.timeLit }}
          >
            {t('ui.timeRace.victoryTitle')}
          </h2>
          <p className="m-0 text-[20px] leading-tight" aria-live="polite">
            {t('ui.timeRace.victoryBody', { name })}
          </p>
          {left != null && (
            <p className="m-0 font-pixel-sm text-[16px] leading-tight" style={{ color: TR.gold }}>
              {t('ui.timeRace.victoryLeft', { time: raceTime(left) })}
            </p>
          )}
        </div>
        <div className="grid w-full max-w-sm gap-2.5">
          {onRaid && (
            <PixelButton variant="primary" size="lg" className="w-full" onClick={onRaid} autoFocus={card}>
              {t('ui.portal.victoryRaid')}
            </PixelButton>
          )}
          <PixelButton
            variant="success"
            size="lg"
            className="w-full"
            onClick={onDone}
            autoFocus={card && !onRaid}
          >
            {t('ui.portal.victoryOk')}
          </PixelButton>
        </div>
      </div>
    </div>
  )
}
