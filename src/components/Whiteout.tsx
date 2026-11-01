// Crown Shrine's whiteout (docs/61 §4.3, docs/15 §47): its way in (the blizzard rolling in over the area, eyes in the
// crown tree, "Tap to continue ▼", then the pop-up with its short rules, TEAM, NOT NOW and BRAVE THE BLIZZARD), its
// rules (INFO), the gauge of waves, the bonfire between waves (the cozy moment: the fire catching, the team round it,
// its heal, TEAM for team changes and items, MOVE ON), the blizzard's chip and its snow over the fights, and the end
// (the blizzard lifting, sunlight on the shrine). The scenes are the pixel engine's (src/fx/timelines/whiteout.ts).
// Every number comes from the engine (the area's mode, the run's state); these pieces only show them.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { blizzardPercent, type GameData, type WhiteoutMode } from '@/engine'
import { playCry } from '@/audio/cries'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import {
  bonfireTimeline,
  shrineLoop,
  snowStageLoop,
  whiteoutIntroTimeline,
  whiteoutOutroTimeline,
} from '@/fx/timelines/whiteout'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion, type MotionLevel } from '@/lib/motion'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useBoxSize, useFullStage, useLoop } from './PortalFx'
import { RulesModal, RuleList, type RuleRow } from './RulesModal'
import { StageCanvas } from './StageCanvas'

/** Abomasnow: the crown tree's guardian, and the whiteout's prize. */
export const ABOMASNOW = 460

/** How the whiteout's lasting effects play (the snow on a loop): full, short, or off (a calm OS stills them too). */
export function useWhiteoutLevel(): MotionLevel {
  const { level, calm } = useMotion()
  return level === 'off' || calm ? 'off' : level
}

// ------------------------------------------------------------------ the shrine and the snow

/**
 * The shrine in its storm filling its box (the rules' banner, the way in's pop-up on its own): the crown tree under its
 * snow, its eyes glowing faintly, the snow driving. 2 CSS pixels per art pixel; `still` holds one frame.
 */
export function ShrineScene({ className, still }: { className?: string; still?: boolean }) {
  const level = useWhiteoutLevel()
  const hold = still ?? level === 'off'
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = useBoxSize(box)
  const w = size ? Math.max(16, Math.ceil(size.w / 2)) : 0
  const h = size ? Math.max(16, Math.ceil(size.h / 2)) : 0
  useLoop(ref, () => (w && h ? shrineLoop(w, h, { still: hold }) : null), hold, [w, h])
  return (
    <div ref={box} aria-hidden className={cx('absolute inset-0 overflow-hidden bg-[#060b18]', className)}>
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

/**
 * Snow over a fight's stage in the blizzard (`.wo-snow`): flakes driven sideways on a clear canvas filling its box, no
 * taps. Short: half of them; off or a calm OS: one still frame.
 */
export function SnowOverStage({ className }: { className?: string }) {
  const level = useWhiteoutLevel()
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = useBoxSize(box)
  const w = size ? Math.max(16, Math.ceil(size.w / 2)) : 0
  const h = size ? Math.max(16, Math.ceil(size.h / 2)) : 0
  useLoop(ref, () => (w && h ? snowStageLoop(w, h, { level }) : null), level === 'off', [w, h, level])
  return (
    <div
      ref={box}
      aria-hidden
      className={cx('wo-snow pointer-events-none absolute inset-0 overflow-hidden', className)}
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

/** The blizzard's chip on the fight's stage: a snowflake and "Blizzard"; its rule in its title and label. */
export function BlizzardChip({ className }: { className?: string }) {
  const { t } = useT()
  const text = t('ui.whiteout.chipText', { percent: blizzardPercent() })
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 bg-[#16264a] px-1.5 py-0.5 font-pixel-sm text-[16px] leading-none text-[#e6f1fa] shadow-[inset_0_2px_0_#e6f1fa,0_0_0_2px_#060b18]',
        className,
      )}
      title={text}
      role="img"
      aria-label={`${t('ui.whiteout.chip')}: ${text}`}
      data-blizzard-chip
    >
      <PixelIcon name="frozen" size={14} />
      <span aria-hidden>{t('ui.whiteout.chip')}</span>
    </span>
  )
}

// ------------------------------------------------------------------ the gauge

/**
 * The gauge of waves (in place of the round gauge): a tile per wave with a pip per foe (filled once beaten), the wave
 * under way with the gold edge, a flame after each cleared wave (its bonfire), then the crown for the boss; "2/3".
 */
export function WhiteoutGauge({
  sizes,
  wave,
  foe,
  boss = false,
  className,
}: {
  /** How many foes each wave holds. */
  sizes: readonly number[]
  /** Waves cleared, and foes beaten in the one under way. */
  wave: number
  foe: number
  /** The boss is next (every wave behind). */
  boss?: boolean
  className?: string
}) {
  const { t } = useT()
  const total = sizes.length
  const done = Math.min(wave, total)
  return (
    <div
      className={cx('flex items-center gap-1.5', className)}
      role="img"
      aria-label={t('ui.whiteout.gauge', { done, total })}
    >
      <PixelIcon name="frozen" size={16} />
      <ol className="flex min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
        {sizes.map((n, i) => (
          <li key={i} className="contents">
            <span
              className={cx(
                'flex h-6 min-w-0 flex-1 items-center justify-center gap-[3px] border-2 bg-[#0b1530]',
                i === done && !boss ? 'border-gold' : 'border-edge',
              )}
              style={{ borderRadius: 2 }}
            >
              {Array.from({ length: n }, (_, j) => (
                <span
                  key={j}
                  className={cx(
                    'h-2 w-2',
                    i < done || (i === done && j < foe) ? 'bg-[#e6f1fa]' : 'bg-[#2a3d63]',
                  )}
                />
              ))}
            </span>
            {i < total - 1 && (
              <PixelIcon name="burn" size={12} className={cx('shrink-0', i >= done && 'opacity-30')} />
            )}
          </li>
        ))}
        <li
          className={cx(
            'grid h-6 w-7 shrink-0 place-items-center border-2 bg-[#0b1530]',
            boss ? 'border-gold' : 'border-edge',
          )}
        >
          <PixelIcon name="crown" size={14} className={cx(!boss && 'opacity-40')} />
        </li>
      </ol>
      <span className="min-w-[4ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {done}/{total}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ its rules

/**
 * The whiteout's rules, short (as the nightmare's: one line each, from the area's numbers): its waves, the blizzard, the
 * bonfires, no bag in battle, the boss, the lock.
 */
export function useWhiteoutRules(mode: WhiteoutMode, data: GameData, bossDex = ABOMASNOW): RuleRow[] {
  const { t } = useT()
  const boss = data.species[bossDex]?.name ?? 'Abomasnow'
  return [
    { icon: 'frozen', title: t('ui.whiteout.rule.waves', { n: mode.waves.length }), text: '' },
    ...(mode.weather
      ? [
          {
            icon: 'cloud' as const,
            title: t('ui.whiteout.rule.blizzard', { percent: blizzardPercent() }),
            text: '',
          },
        ]
      : []),
    { icon: 'burn', title: t('ui.whiteout.rule.bonfire', { percent: mode.bonfirePercent }), text: '' },
    { icon: 'bag', title: t('ui.whiteout.rule.noBag'), text: '' },
    { icon: 'crown', title: t('ui.whiteout.rule.boss', { name: boss }), text: '' },
    { icon: 'lock', title: t('ui.whiteout.rule.lock'), text: '' },
  ]
}

/** The rules pop-up from INFO (OK): the same short rows as the way in's pop-up, the shrine as its banner. */
export function WhiteoutRulesModal({
  open,
  onClose,
  mode,
  data,
  bossDex,
}: {
  open: boolean
  onClose: () => void
  mode: WhiteoutMode
  data: GameData
  bossDex?: number
}) {
  const { t } = useT()
  const rules = useWhiteoutRules(mode, data, bossDex)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.whiteout.title')}
      picture={<ShrineScene />}
      icon="frozen"
      rules={rules}
    />
  )
}

// ------------------------------------------------------------------ the way in

/**
 * The way in's pop-up (as the nightmare's): the short rules, TEAM (healed as at a Pokémon Center, the team can still
 * change), NOT NOW and BRAVE THE BLIZZARD. Over the intro's held end, at the bottom of the screen and up to 92 % of its
 * height; on its own (`banner`, the kitchen sink), the shrine as its picture.
 */
export function WhiteoutEntryDialog({
  open,
  mode,
  data,
  bossDex,
  onBegin,
  onNotNow,
  onTeam,
  banner = true,
}: {
  open: boolean
  mode: WhiteoutMode
  data: GameData
  bossDex?: number
  onBegin: () => void
  onNotNow: () => void
  /** To the Team screen, and back here after. */
  onTeam?: () => void
  banner?: boolean
}) {
  const { t } = useT()
  const rules = useWhiteoutRules(mode, data, bossDex)
  return (
    <Modal
      open={open}
      onClose={onNotNow}
      title={t('ui.whiteout.enterTitle')}
      bottom={!banner}
      className={cx('max-w-md', !banner && 'flex !max-h-[92dvh] flex-col')}
    >
      <div className={cx('flex flex-col gap-3', !banner && 'min-h-0 flex-1')}>
        {banner && (
          <div className="relative -mx-4 h-[150px] overflow-hidden bg-[#060b18]" aria-hidden>
            <ShrineScene />
          </div>
        )}
        <div className={cx(!banner && 'pixel-scroll -mr-2 min-h-0 flex-1 overflow-y-auto pr-2')}>
          <RuleList rules={rules} />
        </div>
        {onTeam && (
          <div className="flex items-center gap-2.5 bg-well p-2.5 shadow-ring-line">
            <PixelIcon name="heart" size={20} className="shrink-0" />
            <p className="m-0 min-w-0 flex-1 text-[18px] leading-tight">{t('ui.nightmare.teamHint')}</p>
            <PixelButton className="shrink-0" onClick={onTeam}>
              {t('ui.portal.team')}
            </PixelButton>
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton onClick={onNotNow}>{t('ui.portal.notNow')}</PixelButton>
          <PixelButton variant="primary" onClick={onBegin}>
            {t('ui.whiteout.begin')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Opening the area, as the nightmare's way in: the intro full screen (the blizzard rolling in, the eyes in the crown
 * tree), held at its end until the player taps, then its pop-up over that end. `popup`: the pop-up was already up (back
 * from the Team screen): the end and the pop-up at once.
 */
export function WhiteoutEntry({
  mode,
  data,
  bossDex,
  picture,
  popup = false,
  onPopup,
  onBegin,
  onNotNow,
  onTeam,
}: {
  mode: WhiteoutMode
  data: GameData
  bossDex?: number
  picture?: string | null
  popup?: boolean
  onPopup?: () => void
  onBegin: () => void
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
      <WhiteoutIntro onContinue={show} picture={picture} instant={popup} under={open} />
      <WhiteoutEntryDialog
        open={open}
        banner={false}
        mode={mode}
        data={data}
        bossDex={bossDex}
        onBegin={onBegin}
        onNotNow={onNotNow}
        onTeam={onTeam}
      />
    </>
  )
}

/** The line under a full-screen scene: a card in the storm's colours (its blue, a snow-white rim, gold under). */
const LINE_CARD =
  'm-0 max-w-md bg-[#0b1530] px-4 py-3 text-center leading-tight text-[#eef6ff] shadow-[inset_0_3px_0_#e6f1fa,inset_0_-3px_0_#f2c24a,0_0_0_3px_#060b18]'

/**
 * The intro, full screen (whiteoutIntroTimeline): the blizzard rolls in over the area until all is white, then the
 * shrine shows in the storm and eyes glow in the crown tree; the line ("The blizzard rolls in, and eyes glow in the
 * crown tree") from that moment. Then it holds its end and waits for the player: "Tap to continue ▼" blinks, and a tap,
 * a click, Enter or Space calls `onContinue`. No skip (as the nightmare's); short in half the time; motion off, its end
 * at once, still, waiting too. `under`: a pop-up is up over it, its end the backdrop (no prompt, no taps).
 */
export function WhiteoutIntro({
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
  const [line, setLine] = useState(false)
  const [end, setEnd] = useState(false)
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: Promise.all(picture ? [loadItemSprite(picture)] : []),
      timeline: whiteoutIntroTimeline({
        ...size,
        title: t('ui.whiteout.title'),
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
      className={cx('wo-intro fixed inset-0 overflow-hidden bg-[#060b18]', under ? 'z-[89]' : 'z-[95]')}
      role={under ? undefined : 'dialog'}
      aria-modal={under ? undefined : true}
      aria-hidden={under || undefined}
      aria-label={under ? undefined : t('ui.whiteout.title')}
      onClick={under || !end ? undefined : onContinue}
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        instant={instant}
        size={{ w: size.w, h: size.h }}
        hud={{ beat: (b) => b === 'line' && setLine(true) }}
        onEnd={() => setEnd(true)}
        label={t('ui.whiteout.intro')}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6">
        <p className={cx(LINE_CARD, 'text-[24px]', !line && 'invisible')} aria-live="polite">
          {t('ui.whiteout.intro')}
        </p>
        {!under && end && (
          <button
            ref={prompt}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onContinue()
            }}
            className="flex min-h-[44px] items-center gap-2 px-3 font-pixel-sm text-[20px] uppercase tracking-[0.04em] text-[#eef6ff] outline-offset-4"
          >
            {t('ui.portal.tapContinue')}
            <span aria-hidden className="blink text-[#a6c2db]">
              ▼
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ the bonfire

/** A team member as the bonfire shows it. */
export interface CampMon {
  uid: string
  dex: number
  shiny?: boolean
}

/**
 * The bonfire between waves (bonfireTimeline), the cozy moment: on a 2:1 panel, the dark, snow falling, the fire
 * catching on its logs, the team sitting round it, lit warm. When it has caught, `onWarm` (once: the screen has the
 * engine give the heal; the team's cards fill under it); the line says what it gave. The hint and TEAM (team changes and
 * items, only here), then the way on: "On to wave N", or "Face the crown tree" at the last. `warmed`: its heal was given
 * already (back from the Team screen, a reload): the fire burning, no second heal.
 */
export function BonfireView({
  team,
  wave,
  waves,
  last,
  percent,
  warmed = false,
  onWarm,
  onTeam,
  onMoveOn,
  children,
}: {
  team: readonly CampMon[]
  /** The wave just cleared (1-based) and how many there are. */
  wave: number
  waves: number
  /** The boss comes after this one. */
  last: boolean
  percent: number
  warmed?: boolean
  onWarm: () => void
  onTeam?: () => void
  onMoveOn: () => void
  /** Under the hint: the team's cards (they fill as the fire catches). */
  children?: ReactNode
}) {
  const { t } = useT()
  const { level } = useMotion()
  const [lit, setLit] = useState(warmed)
  const fired = useRef(warmed)
  const scene = useMemo(
    () => ({
      ready: Promise.all(team.map((m) => loadSprite(m.dex, false, !!m.shiny))),
      timeline: bonfireTimeline({
        w: 240,
        h: 120,
        team: team.map((m) => spriteKey(m.dex, false, !!m.shiny)),
        short: level === 'short',
      }),
    }),
    // One scene per bonfire; the team and the level are read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const warm = () => {
    if (fired.current) return
    fired.current = true
    setLit(true)
    onWarm()
  }
  return (
    <section
      className="pixel-panel wo-panel flex flex-col gap-3 p-3 pt-0"
      aria-labelledby="wo-bonfire"
      data-bonfire
    >
      <div className="relative -mx-3 aspect-[2/1] overflow-hidden bg-[#060b18]">
        <StageCanvas
          timeline={scene.timeline}
          ready={scene.ready}
          instant={warmed}
          size={{ w: 240, h: 120 }}
          hud={{ heal: warm }}
          onEnd={warm}
          label={t('ui.whiteout.bonfireLabel')}
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="grid gap-1">
        <h2 id="wo-bonfire" className="m-0 text-[28px] font-normal leading-none">
          {/* A bonfire after every wave: as many as there are waves, the last one just before the boss. */}
          {last ? t('ui.whiteout.bonfireLast') : t('ui.whiteout.bonfireTitle', { n: wave, total: waves })}
        </h2>
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted" aria-live="polite">
          {lit ? t('ui.whiteout.bonfireBody', { percent }) : t('ui.whiteout.bonfireWarming')}
        </p>
      </div>
      <div className="flex items-center gap-2.5 bg-well p-2.5 shadow-ring-line">
        <PixelIcon name="burn" size={20} className="shrink-0" />
        <p className="m-0 min-w-0 flex-1 text-[18px] leading-tight">{t('ui.whiteout.bonfireHint')}</p>
        {onTeam && (
          <PixelButton className="shrink-0" onClick={onTeam}>
            {t('ui.portal.team')}
          </PixelButton>
        )}
      </div>
      {children}
      <PixelButton variant="primary" size="lg" className="w-full" disabled={!lit} onClick={onMoveOn}>
        {last ? t('ui.whiteout.moveOnBoss') : t('ui.whiteout.moveOn', { n: Math.min(wave + 1, waves) })}
      </PixelButton>
    </section>
  )
}

// ------------------------------------------------------------------ the end

/**
 * The boss caught, full screen (whiteoutOutroTimeline): the wind falls, the snow stops, the sky clears, sunlight on the
 * shrine, the caught one by its tree with a sparkle and its cry, the name card; then "The blizzard lifts", its line and
 * BACK TO THE WORLD (green, the focus). It can't be skipped; with motion off it is there at once.
 */
export function WhiteoutVictoryView({
  name,
  area,
  dex = ABOMASNOW,
  onDone,
}: {
  name: string
  area: string
  dex?: number
  /** BACK TO THE WORLD: Home. */
  onDone: () => void
}) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(260)
  const [card, setCard] = useState(level === 'off')
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: Promise.all([loadSprite(dex, false, true)]),
      timeline: whiteoutOutroTimeline({
        ...size,
        title: t('ui.whiteout.victoryTitle'),
        mon: spriteKey(dex, false, true),
        short: level === 'short',
      }),
    }),
    // One scene per end; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return (
    <div
      className="wo-intro fixed inset-0 z-[95] overflow-hidden bg-[#060b18]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wo-end"
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        size={{ w: size.w, h: size.h }}
        hud={{
          beat: (b) => {
            if (b === 'mon') playCry(dex)
            if (b === 'card') setCard(true)
          },
        }}
        onEnd={() => setCard(true)}
        label={t('ui.whiteout.outroLabel')}
        className="absolute inset-0 h-full w-full"
      />
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6',
          !card && 'invisible',
        )}
      >
        <div className={cx(LINE_CARD, 'grid gap-2')}>
          <h2 id="wo-end" className="m-0 text-[30px] font-normal leading-none text-[#ffeaa8]">
            {t('ui.whiteout.victoryTitle')}
          </h2>
          <p className="m-0 text-[20px] leading-tight" aria-live="polite">
            {t('ui.whiteout.victoryBody', { name, area })}
          </p>
        </div>
        <PixelButton
          variant="success"
          size="lg"
          className="w-full max-w-sm"
          onClick={onDone}
          autoFocus={card}
        >
          {t('ui.portal.victoryOk')}
        </PixelButton>
      </div>
    </div>
  )
}
