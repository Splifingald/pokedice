// Picking a partner, full screen: in the professor's lab three Poké Balls drop onto the table (src/fx/timelines/
// starter.ts). Tap one and its Pokémon comes out; "Do you want to pick it?" with its types, what it hits hard, what
// hits it hard and its dice. Yes makes it your partner; no sends it back. Used by a new game and by a new region.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createInstance, getSpecies, instanceStats, type RegionId } from '@/engine'
import { LAB_ART, loadArt } from '@/fx/areaArt'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { labColors, starterSeats, StarterScene } from '@/fx/timelines/starter'
import { H, setCalm, W } from '@/fx/timeline'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { useDialog } from '@/lib/useDialog'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { DiceSet } from './DiceSet'
import { PixelButton } from './PixelButton'
import { MiniSprite } from './SpriteImg'
import { StatChip } from './StatChip'
import { matchupsOf, speciesTypes } from './TypeMatchups'
import { TypeBadge } from './TypeBadge'

type Phase = 'intro' | 'choose' | 'ask' | 'done'

export function PartnerMoment({
  starters,
  regionId,
  regionName,
  level,
  onPick,
  onLeave,
}: {
  /** The region's three starters, in ball order. */
  starters: readonly number[]
  regionId: RegionId
  regionName: string
  /** The level the partner starts at (its dice and rerolls are shown at it). */
  level: number
  onPick: (dex: number) => void
  /** ✕ and Escape: back out (absent on a new game, where there is nothing to go back to). */
  onLeave?: () => void
}) {
  const { t } = useT()
  useHoldFullscreen()
  const data = useGame((s) => s.data)
  const { level: motion, calm } = useMotion()
  const instant = motion === 'off'
  const root = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const yesRef = useRef<HTMLButtonElement>(null)
  const goRef = useRef<HTMLButtonElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  const [phase, setPhase] = useState<Phase>(instant ? 'choose' : 'intro')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const [pick, setPick] = useState<number | null>(null)
  const [asking, setAsking] = useState(false)
  // Settled once everything the lab needs has loaded (or 1.5 s passed): whether the lab picture is the stage.
  const [lab, setLab] = useState<{ picture: boolean } | null>(null)
  const labImg = useRef<HTMLImageElement>(null)
  const clock = useRef(0)

  const scene = useMemo(
    () =>
      lab &&
      new StarterScene({
        lab: labColors(regionId),
        mons: starters.map((d) => spriteKey(d, false)),
        ribbon: { welcome: t('ui.partner.welcome'), region: regionName },
        instant,
        picture: lab.picture,
      }),
    // One scene per moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lab],
  )
  const seats = starterSeats(!!lab?.picture)

  useEffect(() => setCalm(calm), [calm])

  // The three Pokémon (they pop out of their balls on the canvas) and the lab picture are loaded first, at most 1.5 s.
  // The picture is used only if it came in time: once the balls fall, the cradles can't move under them.
  useEffect(() => {
    let live = true
    let picture = false
    const art = loadArt(LAB_ART).then((im) => void (picture = !!im))
    void Promise.race([
      Promise.all([art, ...starters.map((d) => loadSprite(d, false))]),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(() => live && setLab({ picture }))
    return () => {
      live = false
    }
  }, [starters])

  // The clock and the drawing: 60 frames a second while the moment is open.
  useEffect(() => {
    const g = cv.current?.getContext('2d')
    if (!g || !scene) return
    g.imageSmoothingEnabled = false
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      clock.current += dt
      const t = clock.current
      if (phaseRef.current === 'intro' && t >= scene.landed) setPhase('choose')
      scene.step(t, dt)
      g.clearRect(0, 0, W, H)
      scene.draw(g, t)
      // The picture lands with the balls: it shakes with the scene.
      const sh = scene.shake(t)
      if (labImg.current)
        labImg.current.style.transform = sh.x || sh.y ? `translate(${(sh.x / W) * 100}%, ${(sh.y / H) * 100}%)` : ''
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [scene])

  // Focus follows the moment: the first ball, the question's yes, then "Let's go!".
  useEffect(() => {
    if (phase === 'choose') firstRef.current?.focus({ preventScroll: true })
  }, [phase])
  useEffect(() => {
    if (asking) yesRef.current?.focus({ preventScroll: true })
  }, [asking])

  const open = (i: number) => {
    if (!scene || phase === 'intro' || phase === 'done') return
    if (phase === 'ask') {
      if (i === pick) return
      scene.closeBall(pick!, clock.current)
    }
    scene.openBall(i, clock.current)
    scene.focus = i
    setPick(i)
    setPhase('ask')
    setAsking(false)
    setTimeout(() => setAsking(true), instant ? 0 : 520)
  }
  const back = useCallback(() => {
    if (pick == null || !scene) return
    scene.closeBall(pick, clock.current)
    setPick(null)
    setAsking(false)
    setPhase('choose')
  }, [pick, scene])
  const yes = () => {
    if (pick == null || !scene) return
    scene.choose(pick, clock.current)
    setAsking(false)
    setPhase('done')
  }
  // On top of whatever opened it (the Areas sheet): Tab stays here, and Esc puts the ball back or leaves the lab.
  useDialog(root, true, () => {
    if (phaseRef.current === 'ask') back()
    else if (phaseRef.current !== 'done') onLeave?.()
  })
  const [goShown, setGoShown] = useState(false)
  useEffect(() => {
    if (phase !== 'done') return
    const id = setTimeout(() => setGoShown(true), instant ? 0 : 1600)
    return () => clearTimeout(id)
  }, [phase, instant])
  useEffect(() => {
    if (goShown) goRef.current?.focus({ preventScroll: true })
  }, [goShown])

  const dex = pick != null ? starters[pick]! : null
  const name = dex != null ? getSpecies(data, dex).name : ''
  const message =
    phase === 'intro'
      ? t('ui.partner.sayWelcome', { region: regionName })
      : phase === 'choose'
        ? t('ui.partner.sayChoose')
        : phase === 'ask'
          ? t('ui.partner.sayAsk', { name })
          : t('ui.partner.sayDone', { name, region: regionName })

  const facts = useMemo(() => {
    if (dex == null) return null
    const stats = instanceStats(createInstance(dex, level, data, 'partner-preview', 0), data)
    return { types: speciesTypes(data, dex), stats, m: matchupsOf(data, speciesTypes(data, dex), stats.dice) }
  }, [dex, level, data])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.partner.label', { region: regionName })}
      ref={root}
      tabIndex={-1}
      className="fixed inset-0 z-[100] overflow-y-auto bg-paper text-ink outline-none"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col gap-3 pb-4">
        <div
          className="relative shadow-ledge"
          onClick={() => {
            // A tap during the drop lets the balls land at once.
            if (phase !== 'intro' || !scene) return
            clock.current = Math.max(clock.current, scene.landed)
            scene.land()
          }}
        >
          {lab?.picture && (
            <img
              ref={labImg}
              src={LAB_ART}
              alt=""
              aria-hidden
              draggable={false}
              className="pixelated absolute inset-0 h-full w-full max-w-none object-cover"
            />
          )}
          <canvas
            ref={cv}
            width={W}
            height={H}
            aria-hidden
            className="pixelated relative block aspect-[3/2] w-full"
            style={{ imageRendering: 'pixelated' }}
          />
          {seats.map(({ x, y }, i) => (
            <button
              key={i}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              disabled={phase === 'intro' || phase === 'done'}
              onClick={(e) => {
                e.stopPropagation()
                open(i)
              }}
              onMouseEnter={() => phase === 'choose' && scene && (scene.focus = i)}
              onFocus={() => phase === 'choose' && scene && (scene.focus = i)}
              aria-label={
                pick === i
                  ? t('ui.partner.out', { name: getSpecies(data, starters[i]!).name })
                  : t('ui.partner.ball', { n: i + 1 })
              }
              className="absolute h-[25%] w-[16%] -translate-x-1/2 focus-visible:outline-offset-0"
              // Over its ball, and the Pokémon's feet once it is out.
              style={{ left: `${(x / W) * 100}%`, top: `${((y - 24) / H) * 100}%` }}
            />
          ))}
          {onLeave && phase !== 'done' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onLeave()
              }}
              aria-label={t('ui.partner.leave')}
              className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center bg-paper text-[22px] leading-none shadow-ring"
            >
              ✕
            </button>
          )}
        </div>

        <p
          className="pixel-dialogue mx-3 my-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]"
          aria-live="polite"
        >
          {message}
        </p>

        {phase === 'ask' && asking && facts && dex != null && (
          <div className="mx-3 grid gap-2 bg-paper px-3 pb-3 pt-2.5 shadow-card">
            <div className="flex items-center gap-2">
              <MiniSprite dex={dex} size={56} className="-my-2" />
              <span className="grid min-w-0 gap-1">
                <b className="truncate text-[24px] font-normal leading-none">{name}</b>
                <span className="flex gap-1">
                  {facts.types.map((ty) => (
                    <TypeBadge key={ty} type={ty} size="sm" />
                  ))}
                </span>
              </span>
            </div>
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
              <dt className="font-pixel-sm text-[15px] text-muted">{t('ui.partner.strong')}</dt>
              <dd className="m-0 flex flex-wrap gap-1">
                {facts.m.hits.length ? (
                  facts.m.hits.map((ty) => <TypeBadge key={ty} type={ty} size="sm" />)
                ) : (
                  <span className="font-pixel-sm text-[15px]">{t('ui.partner.none')}</span>
                )}
              </dd>
              <dt className="font-pixel-sm text-[15px] text-muted">{t('ui.partner.weak')}</dt>
              <dd className="m-0 flex flex-wrap gap-1">
                {facts.m.weak.length ? (
                  facts.m.weak.map((ty) => <TypeBadge key={ty} type={ty} size="sm" />)
                ) : (
                  <span className="font-pixel-sm text-[15px]">{t('ui.partner.none')}</span>
                )}
              </dd>
              <dt className="font-pixel-sm text-[15px] text-muted">{t('ui.partner.dice')}</dt>
              <dd className="m-0 flex flex-wrap items-center gap-2">
                <DiceSet dice={facts.stats.dice} size={24} />
                <StatChip stat="rerolls" value={facts.stats.rerolls} />
              </dd>
            </dl>
            {/* Side by side when they fit; when a long name doesn't, "Pick {name}" goes on top, full width. */}
            <div className="flex flex-wrap-reverse gap-2.5">
              <PixelButton className="min-w-0 flex-1 basis-[8rem] px-2" onClick={back}>
                {t('ui.partner.no')}
              </PixelButton>
              <PixelButton
                ref={yesRef}
                variant="primary"
                className="min-w-0 flex-[1.4_1_11rem] px-2"
                onClick={yes}
              >
                {t('ui.partner.yes', { name })}
              </PixelButton>
            </div>
          </div>
        )}

        {phase === 'done' && goShown && dex != null && (
          <PixelButton
            ref={goRef}
            variant="primary"
            size="lg"
            className={cx('mx-3')}
            onClick={() => onPick(dex)}
          >
            {t('ui.partner.go')}
          </PixelButton>
        )}
      </div>
    </div>,
    document.body,
  )
}
