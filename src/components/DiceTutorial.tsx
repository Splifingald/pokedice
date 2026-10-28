// The dice tutorial (docs/46 §5): after Youngster Joey's ₽10, a pointing hand walks a new player to their starter's
// type die and back to the area, once. The screen dims but for the one thing to tap (the real button: its own action
// does the step), Prof. Oak says why in a bubble, and nothing else can be pressed meanwhile. The engine says when it's
// due and which step the page is at; this only finds that step's button on screen and points at it.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  diceTutorialCost,
  diceTutorialStep,
  diceTutorialTarget,
  monName,
  type DiceTutorialStep,
} from '@/engine'
import { useT } from '@/i18n/react'
import { typeName } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { finishDiceTutorialNow, startDiceTutorialNow } from '@/store/actions'
import { useGame } from '@/store/game'
import { enterArea } from '@/store/run'
import { cx } from '@/theme/util'
import { PixelButton } from './PixelButton'
import { useMyTurn, useOnScreen } from './popupTurn'
import { TrainerSprite } from './TrainerArt'
import { HAND_TIP, TutorialHand } from './TutorialHand'

type PointStep = Exclude<DiceTutorialStep, 'back'>

/** Each step's button on screen (the first one showing). */
const TARGETS: Record<PointStep, (type: string) => string> = {
  // The money in the top bar opens the Mart: on every page, on a phone and on PC alike.
  toMart: () => '[data-hud-gold]',
  toUpgrades: () => '#mart-upgrades',
  toDice: () => '#up-dice',
  buy: (type) => `[data-guide="buy-die-${type}"]`,
}

/** Where a step's button lives, should it not be on screen: SHOW ME goes there. */
const PLACES: Record<PointStep, string> = {
  toMart: '/shop',
  toUpgrades: '/shop?tab=upgrades',
  toDice: '/shop?tab=upgrades&up=dice',
  buy: '/shop?tab=upgrades&up=dice',
}

/** How long a step's button may be missing before SHOW ME is offered. */
const MISSING_MS = 1500
const HAND_SCALE = 4
/** Room around the button in the dimmed screen's hole. */
const PAD = 6

export interface GuideBox {
  x: number
  y: number
  w: number
  h: number
}

const boxOf = (el: Element): GuideBox | null => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}

/**
 * The step's button on screen, followed as the page scrolls or lays out again; null while it isn't there. On arrival
 * it's scrolled into view and takes the focus, so a keyboard's Enter presses it.
 */
function useTargetBox(selector: string | null): GuideBox | null {
  const [box, setBox] = useState<GuideBox | null>(null)
  useEffect(() => {
    setBox(null)
    if (!selector) return
    let raf = 0
    let found: Element | null = null
    const tick = () => {
      const el = [...document.querySelectorAll(selector)].find((e) => boxOf(e)) ?? null
      if (el && el !== found) {
        found = el
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        ;(el as HTMLElement).focus?.({ preventScroll: true })
      }
      const next = el ? boxOf(el) : null
      setBox((b) =>
        !next || !b
          ? next
          : Math.abs(b.x - next.x) +
                Math.abs(b.y - next.y) +
                Math.abs(b.w - next.w) +
                Math.abs(b.h - next.h) <
              1
            ? b
            : next,
      )
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selector])
  return box
}

/** Prof. Oak's line for the step, with its one button when it has one (the last step's way back, SHOW ME). */
export function GuideBubble({
  text,
  button,
  onButton,
  className,
}: {
  text: string
  button?: string
  onButton?: () => void
  className?: string
}) {
  const { t } = useT()
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'pointer-events-auto flex w-full max-w-[520px] items-start gap-2 bg-sand p-2.5 text-left shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-sand-lip)),0_4px_0_rgb(var(--c-edge)/0.25)]',
        className,
      )}
    >
      <TrainerSprite
        src="/characters/prof-oak.png"
        alt={t('ui.newGame.oak')}
        size={56}
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-pixel-sm text-[16px] leading-none text-muted">{t('ui.tutorial.label')}</span>
        <p className="m-0 text-[20px] leading-snug">
          <b className="font-normal">{t('ui.oak.prefix')}</b> {text}
        </p>
        {button && onButton && (
          <PixelButton variant="primary" className="self-end" onClick={onButton} data-guide="tutorial-button">
            {button}
          </PixelButton>
        )}
      </div>
    </div>
  )
}

/**
 * The dimmed screen with its hole on `box`, the hand pointing at it and the bubble on the other half. `fixed`: over
 * the whole window (the game); off, inside its parent (the kitchen sink's frames). Taps outside the hole go nowhere.
 */
export function GuideFrame({
  box,
  bubble,
  bubbleAt,
  still,
  fixed = true,
}: {
  box: GuideBox | null
  bubble: ReactNode
  /**
   * Where the bubble goes when it holds the button itself (it can't move away from its own button): the middle keeps
   * it clear of the toasts at the top.
   */
  bubbleAt?: 'top' | 'middle' | 'bottom'
  still?: boolean
  fixed?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const hole = box && { x: box.x - PAD, y: box.y - PAD, w: box.w + 2 * PAD, h: box.h + 2 * PAD }
  // The hand under its button pointing up, or above it pointing down when the button sits low on the screen.
  const handW = 16 * HAND_SCALE
  const handH = 17 * HAND_SCALE
  const down = !!hole && hole.y + hole.h / 2 > size.h * 0.6
  const hand = hole && {
    left: Math.max(4, Math.min(size.w - handW - 4, hole.x + hole.w / 2 - HAND_TIP.x * HAND_SCALE)),
    top: down ? hole.y - handH - 2 : hole.y + hole.h + 2,
  }
  // The bubble away from the button: at the foot when it's in the top half, else at the top.
  const place = bubbleAt ?? (!hole || hole.y + hole.h / 2 < size.h / 2 ? 'bottom' : 'top')
  // Four blockers around the hole catch every tap but the button's (none at all without a hole).
  const blockers = hole
    ? [
        { left: 0, top: 0, width: '100%', height: Math.max(0, hole.y) },
        { left: 0, top: hole.y + hole.h, width: '100%', bottom: 0 },
        { left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h },
        { left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h },
      ]
    : [{ inset: 0 }]
  return (
    <div
      ref={ref}
      className={cx(
        fixed ? 'fixed inset-0 z-[85]' : 'absolute inset-0 z-10 overflow-hidden',
        'pointer-events-none',
      )}
    >
      {blockers.map((b, i) => (
        <div
          key={i}
          className="pointer-events-auto absolute bg-night/60"
          style={b}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
      {/* The hole's gold ring: what to tap. */}
      {hole && (
        <div
          aria-hidden
          className="absolute shadow-[inset_0_0_0_3px_theme(colors.gold)]"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
        />
      )}
      {hand && (
        <div className="absolute" style={{ left: hand.left, top: hand.top }}>
          <TutorialHand scale={HAND_SCALE} down={down} still={still} />
        </div>
      )}
      <div
        className={cx(
          'absolute inset-x-0 flex justify-center px-3',
          place === 'bottom'
            ? 'bottom-[calc(12px+env(safe-area-inset-bottom))]'
            : place === 'middle'
              ? 'top-[38%] -translate-y-1/2'
              : 'top-[calc(var(--top-bar,56px)+12px)]',
        )}
      >
        {bubble}
      </div>
    </div>
  )
}

/** The tutorial in the game: on its turn among the one-time pop-ups (it holds it on every page it walks through). */
export function DiceTutorial() {
  const { t } = useT()
  const open = useMyTurn('diceTutorial')
  useOnScreen('diceTutorial', open)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { calm } = useMotion()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const step =
    open && save
      ? diceTutorialStep(save, data, { path: pathname, martTab: params.get('tab'), upTab: params.get('up') })
      : null
  const target = save ? diceTutorialTarget(save, data) : null
  // The last step's button is the bubble's own.
  const selector =
    step && target ? (step === 'back' ? '[data-guide="tutorial-button"]' : TARGETS[step](target.type)) : null
  const box = useTargetBox(selector)
  // SHOW ME, should the step's button not turn up (a page laid out otherwise): straight to where it lives.
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    setMissing(false)
    if (!selector || box || step === 'back') return
    const id = window.setTimeout(() => setMissing(true), MISSING_MS)
    return () => window.clearTimeout(id)
  }, [selector, box, step])
  // Shown: it comes back until finished, the die bought or not.
  useEffect(() => {
    if (open && save && !save.diceTutorial) startDiceTutorialNow()
  }, [open, save])
  if (!open || !save || !step || !target) return null
  const mon = save.box.find((p) => p.id === target.uid)
  const area = data.areas.find((a) => a.id === save.currentAreaId)
  const vars = {
    gold: diceTutorialCost(save, data) ?? 0,
    mon: mon ? monName(mon, data) : (data.species[target.dex]?.name ?? ''),
    type: typeName(target.type),
    area: area?.name ?? '',
  }
  const back = () => {
    finishDiceTutorialNow()
    if (area && useGame.getState().run.areaId !== area.id) enterArea(area.id)
    navigate('/area')
  }
  const text = t(`ui.tutorial.dice.${step}`, vars)
  const bubble =
    step === 'back' ? (
      <GuideBubble text={text} button={t('ui.tutorial.dice.backButton', vars)} onButton={back} />
    ) : (
      <GuideBubble
        text={text}
        button={missing && !box ? t('ui.tutorial.showMe') : undefined}
        onButton={() => navigate(PLACES[step])}
      />
    )
  return (
    <GuideFrame box={box} bubble={bubble} bubbleAt={step === 'back' ? 'middle' : undefined} still={calm} />
  )
}
