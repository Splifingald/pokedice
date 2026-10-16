// Darkrai's nightmare (docs/30, docs/15 §29): its way in (healed, TEAM, NOT NOW / BEGIN THE NIGHTMARE), the intro that
// plays as it begins (Darkrai's silhouette across the full moon, "Tap to continue ▼"), its rules, the gauge of rounds,
// Darkrai's strike after a round, and the waking (shiny Darkrai, HEAL & START RAID). The scenes are the pixel engine's
// (src/fx/timelines/nightmare.ts), hosted with the moon and the screen's vignette in NightmareFx.tsx.
// Every number comes from the engine (the area's mode, the nightmare's state); these pieces only show them.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GameData, NightmareMode } from '@/engine'
import { playCry } from '@/audio/cries'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import {
  nightmareIntroTimeline,
  nightmareStrikeTimeline,
  nightmareWakeTimeline,
} from '@/fx/timelines/nightmare'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { RulesModal, RuleList, type RuleRow } from './RulesModal'
import { useFullStage } from './PortalFx'
import { StageCanvas } from './StageCanvas'
import { DARKRAI, MoonScene } from './NightmareFx'

export {
  DARKRAI,
  MoonScene,
  NightGround,
  NightmareFx,
  NightStageArt,
  StageShadow,
  useShadowIn,
} from './NightmareFx'

// ------------------------------------------------------------------ the gauge

/** One tile's moon: a pixel disc, lit (a round survived), half in shadow (the one under way), or dark (to come). */
function MoonTile({ state }: { state: 'done' | 'next' | 'todo' }) {
  const lit = state === 'done' ? '#f3efd6' : state === 'next' ? '#9c86e8' : '#2c3a80'
  return (
    <svg width="14" height="14" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      <path d="M2 0h3v1h1v1h1v3h-1v1h-1v1h-3v-1h-1v-1h-1v-3h1v-1h1z" fill={lit} />
      {state === 'next' && <path d="M4 0h1v1h1v1h1v3h-1v1h-1v1h-1z" fill="#080b1f" />}
      {state === 'done' && <path d="M2 2h1v1h-1zM4 4h1v1h-1z" fill="#c9c09a" />}
    </svg>
  )
}

/**
 * The gauge of rounds (in place of the round gauge): one tile per round with its moon, the won ones lit with a check,
 * the one under way with the gold edge, then "3/7".
 */
export function NightmareGauge({
  round,
  total,
  className,
}: {
  round: number
  total: number
  className?: string
}) {
  const { t } = useT()
  const done = Math.min(round, total)
  return (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={t('ui.nightmare.gauge', { done, total })}
    >
      <PixelIcon name="moon" size={16} />
      <ol className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={cx(
              'flex h-6 min-w-0 flex-1 items-center justify-center gap-0.5 border-2 bg-[#080b1f]',
              i < done ? 'border-edge' : i === done ? 'border-gold' : 'border-edge',
            )}
            style={{ borderRadius: 2 }}
          >
            <MoonTile state={i < done ? 'done' : i === done ? 'next' : 'todo'} />
          </li>
        ))}
      </ol>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {done}/{total}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ its rules

/** The nightmare's rules, from the area's numbers: its foes in order, the strike and the gifts, the lock, the waking. */
export function useNightmareRules(mode: NightmareMode, data: GameData): RuleRow[] {
  const { t } = useT()
  const name = data.species[DARKRAI]?.name ?? 'Darkrai'
  const foes = joinList(mode.foes.map((f) => data.species[f.dex]?.name ?? `#${f.dex}`))
  const levels = mode.foes.map((f) => f.level)
  const gifts = mode.gifts.filter((g) => data.items[g.key])
  const giftLine = joinList(
    gifts.map((g) =>
      t('ui.nightmare.rule.gift', {
        n: g.round,
        item: `${data.items[g.key]!.name}${g.qty > 1 ? ` ×${g.qty}` : ''}`,
      }),
    ),
  )
  return [
    {
      icon: 'moon',
      title: t('ui.nightmare.rule.rounds.title', { n: mode.foes.length }),
      text: t('ui.nightmare.rule.rounds.text', {
        foes,
        min: Math.min(...levels),
        max: Math.max(...levels),
      }),
    },
    {
      icon: 'skull',
      title: t('ui.nightmare.rule.strike.title', { name }),
      text:
        t('ui.nightmare.rule.strike.text', { percent: mode.strikePercent }) +
        (giftLine ? ` ${t('ui.nightmare.rule.gifts', { gifts: giftLine })}` : ''),
    },
    { icon: 'lock', title: t('ui.nightmare.rule.lock.title'), text: t('ui.nightmare.rule.lock.text') },
    {
      icon: 'star',
      title: t('ui.nightmare.rule.wake.title'),
      text: t('ui.nightmare.rule.wake.text', { name, level: mode.raid.level }),
    },
  ]
}

/** The rules pop-up (docs/15 §20): once, after the intro the first time; then from INFO (OK). */
export function NightmareRulesModal({
  open,
  onClose,
  mode,
  data,
}: {
  open: boolean
  onClose: () => void
  mode: NightmareMode
  data: GameData
}) {
  const { t } = useT()
  const rules = useNightmareRules(mode, data)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.nightmare.title')}
      picture={<MoonScene />}
      icon="moon"
      rules={rules}
    />
  )
}

// ------------------------------------------------------------------ the way in

/**
 * The way in, on the area's page while the nightmare hasn't begun: the moon as its banner, what waits, the heal (as at
 * a Pokémon Center, so the team can still change: TEAM), the warning that travel shuts once it begins (the Mart stays
 * open), NOT NOW (Home) and BEGIN THE NIGHTMARE.
 */
export function NightmareWayInView({
  mode,
  data,
  onBegin,
  onNotNow,
  onTeam,
}: {
  mode: NightmareMode
  data: GameData
  onBegin: () => void
  onNotNow: () => void
  onTeam?: () => void
}) {
  const { t } = useT()
  const rules = useNightmareRules(mode, data)
  return (
    <section className="pixel-panel nm-panel flex flex-col gap-3 p-3 pt-0" aria-labelledby="nm-way-in">
      <div className="relative -mx-3 h-[132px] overflow-hidden" aria-hidden>
        <MoonScene />
      </div>
      <div className="grid gap-1">
        <h2 id="nm-way-in" className="m-0 text-[28px] font-normal leading-none">
          {t('ui.nightmare.wayInTitle')}
        </h2>
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.nightmare.wayInBody', { n: mode.foes.length })}
        </p>
      </div>
      <RuleList rules={rules} />
      {onTeam && (
        <div className="flex items-center gap-2.5 bg-well p-2.5 shadow-ring-line">
          <PixelIcon name="heart" size={20} className="shrink-0" />
          <p className="m-0 min-w-0 flex-1 text-[18px] leading-tight">{t('ui.nightmare.teamHint')}</p>
          <PixelButton className="shrink-0" onClick={onTeam}>
            {t('ui.portal.team')}
          </PixelButton>
        </div>
      )}
      <p
        role="note"
        className="m-0 flex items-start gap-2 bg-rose p-2.5 text-[18px] leading-tight text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-danger))]"
      >
        <PixelIcon name="warning" size={20} className="mt-0.5 shrink-0" />
        <span>{t('ui.nightmare.sure')}</span>
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
        <PixelButton onClick={onNotNow}>{t('ui.portal.notNow')}</PixelButton>
        <PixelButton variant="primary" onClick={onBegin}>
          {t('ui.nightmare.begin')}
        </PixelButton>
      </div>
    </section>
  )
}

/** The line under a full-screen scene: a card in the name card's colours (the night, the moon's cream, Darkrai's red). */
const LINE_CARD =
  'm-0 max-w-md bg-[#080b1f] px-4 py-3 text-center leading-tight text-[#eef0ff] shadow-[inset_0_3px_0_#f3efd6,inset_0_-3px_0_#e0304a,0_0_0_3px_#03040c]'

/**
 * The intro, full screen, as the nightmare begins (nightmareIntroTimeline): the area sinks into the night, the full
 * moon rises, smoke creeps up, Darkrai's silhouette passes across the moon; the line ("You feel a shadow breathing down
 * your neck, the nightmare begins") from the moment it slows in front of it. Then it holds its end and waits for the
 * player: "Tap to continue ▼" blinks, and a tap, a click, Enter or Space calls `onContinue`. No skip, as the Distortion
 * World's breach: it plays out (`short` in half the time; motion off: its end at once, still, waiting too). `under`: a
 * pop-up is up over it (its rules), its end the backdrop (no prompt, no taps). `picture`: the area's picture.
 */
export function NightmareIntro({
  onContinue,
  picture,
  under = false,
}: {
  onContinue: () => void
  picture?: string | null
  under?: boolean
}) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(200)
  const prompt = useRef<HTMLButtonElement>(null)
  const [line, setLine] = useState(false)
  const [end, setEnd] = useState(false)
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: Promise.all([loadSprite(DARKRAI, false, false), ...(picture ? [loadItemSprite(picture)] : [])]),
      timeline: nightmareIntroTimeline({
        ...size,
        title: t('ui.nightmare.title'),
        mon: spriteKey(DARKRAI, false, false),
        picture: picture ? `item|${picture}` : null,
        short: level === 'short',
      }),
    }),
    // One scene per intro; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // At its end the prompt holds the focus: Enter and Space go on.
  useEffect(() => {
    if (end && !under) prompt.current?.focus()
  }, [end, under])
  return (
    <div
      className={cx('nm-intro fixed inset-0 overflow-hidden bg-[#03040c]', under ? 'z-[89]' : 'z-[95]')}
      role={under ? undefined : 'dialog'}
      aria-modal={under ? undefined : true}
      aria-hidden={under || undefined}
      aria-label={under ? undefined : t('ui.nightmare.title')}
      onClick={under || !end ? undefined : onContinue}
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        size={{ w: size.w, h: size.h }}
        hud={{ beat: (b) => b === 'line' && setLine(true) }}
        onEnd={() => setEnd(true)}
        label={t('ui.nightmare.intro')}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6">
        <p className={cx(LINE_CARD, 'text-[24px]', !line && 'invisible')} aria-live="polite">
          {t('ui.nightmare.intro')}
        </p>
        {!under && end && (
          <button
            ref={prompt}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onContinue()
            }}
            className="flex min-h-[44px] items-center gap-2 px-3 font-pixel-sm text-[20px] uppercase tracking-[0.04em] text-[#eef0ff] outline-offset-4"
          >
            {t('ui.portal.tapContinue')}
            <span aria-hidden className="blink text-[#c8f4ff]">
              ▼
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Darkrai's strike

/** A team member as the strike shows it. */
export interface StrikeMon {
  uid: string
  dex: number
  shiny?: boolean
}

/**
 * Darkrai's strike after a round (nightmareStrikeTimeline): its shadow over the team, the beams; `onStrike` when they
 * land (the screen has the engine take the HP then: the team's cards drain under it), once. Then the line with the
 * share it took and CONTINUE (the next round). It can't be skipped; motion off, it lands at once. `hit`: the HP was
 * taken already (back from Home): the scene's end, still.
 */
export function NightmareStrikeView({
  team,
  round,
  total,
  percent,
  hit = false,
  onStrike,
  onContinue,
  children,
}: {
  team: readonly StrikeMon[]
  /** The round just won (1-based) and how many there are. */
  round: number
  total: number
  percent: number
  hit?: boolean
  onStrike: () => void
  onContinue: () => void
  /** Under the line: the team's cards (they drain as the beams land). */
  children?: ReactNode
}) {
  const { t } = useT()
  const { level, calm } = useMotion()
  const [landed, setLanded] = useState(hit)
  const fired = useRef(hit)
  const go = useRef<HTMLButtonElement>(null)
  const scene = useMemo(
    () => ({
      ready: Promise.all([
        loadSprite(DARKRAI, false, false),
        ...team.map((m) => loadSprite(m.dex, true, !!m.shiny)),
      ]),
      timeline: nightmareStrikeTimeline({
        w: 240,
        h: 120,
        mon: spriteKey(DARKRAI, false, false),
        team: team.map((m) => spriteKey(m.dex, true, !!m.shiny)),
        short: level === 'short',
      }),
    }),
    // One scene per strike; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const land = () => {
    if (fired.current) return
    fired.current = true
    setLanded(true)
    onStrike()
  }
  useEffect(() => {
    if (landed) go.current?.focus({ preventScroll: true })
  }, [landed])
  return (
    <section className="pixel-panel nm-panel flex flex-col gap-3 p-3 pt-0" aria-labelledby="nm-strike">
      <div className="relative -mx-3 aspect-[2/1] overflow-hidden bg-[#03040c]" data-nm-strike>
        <StageCanvas
          timeline={scene.timeline}
          ready={scene.ready}
          instant={hit}
          size={{ w: 240, h: 120 }}
          hud={{ contact: land }}
          onEnd={land}
          label={t('ui.nightmare.strikeLabel')}
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="grid gap-1">
        <h2 id="nm-strike" className="m-0 text-[28px] font-normal leading-none">
          {t('ui.nightmare.strikeTitle', { n: round, total })}
        </h2>
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted" aria-live="polite">
          {landed ? t('ui.nightmare.strikeBody', { percent }) : t('ui.nightmare.strikeComing')}
        </p>
      </div>
      {/* The cards hit: two white frames and a shake (none when calm: no flashing). */}
      <div className={cx(landed && !hit && !calm && 'nm-struck')}>{children}</div>
      <PixelButton
        ref={go}
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!landed}
        onClick={onContinue}
      >
        {t('ui.nightmare.nextRound', { n: Math.min(round + 1, total) })}
      </PixelButton>
    </section>
  )
}

// ------------------------------------------------------------------ the waking

/**
 * The last round won, full screen (nightmareWakeTimeline): Darkrai's shadow in front of the moon, the reveal of shiny
 * Darkrai with its cry and a quake, the sparkle, the sky paling to dawn, the name card; then "You woke up from your
 * nightmare, Darkrai awaits", HEAL & START RAID (the main action, its focus) over the green BACK TO THE WORLD. It can't be
 * skipped; with motion off it is there at once.
 */
export function NightmareVictoryView({
  name,
  level: lv,
  onDone,
  onRaid,
}: {
  name: string
  level?: number
  /** BACK TO THE WORLD: Home. */
  onDone: () => void
  /** HEAL & START RAID: healed as at a Center, then the raid's page. */
  onRaid?: () => void
}) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(300)
  const [card, setCard] = useState(level === 'off')
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: Promise.all([loadSprite(DARKRAI, false, true)]),
      timeline: nightmareWakeTimeline({
        ...size,
        mon: spriteKey(DARKRAI, false, true),
        name,
        subs: [t('ui.mon.shinyTag'), ...(lv ? [t('ui.common.level.short', { n: lv })] : [])],
        short: level === 'short',
      }),
    }),
    // One scene per waking; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return (
    <div
      className="nm-intro fixed inset-0 z-[95] overflow-hidden bg-[#03040c]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nm-woke"
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        size={{ w: size.w, h: size.h }}
        hud={{
          beat: (b) => {
            if (b === 'roar') playCry(DARKRAI)
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
        <div className={cx(LINE_CARD, 'grid gap-2')}>
          <h2 id="nm-woke" className="m-0 text-[30px] font-normal leading-none text-[#c8f4ff]">
            {t('ui.nightmare.victoryTitle', { name })}
          </h2>
          <p className="m-0 text-[20px] leading-tight" aria-live="polite">
            {t('ui.nightmare.victoryBody', { name })}
          </p>
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
