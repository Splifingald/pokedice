// Kitchen sink (dev only): the dice tutorial (docs/46 §5) — the pixel hand (pointing up, down, still), Prof. Oak's
// bubble (a step's line, with SHOW ME, with the way back), and a step framed as in the game: the screen dimmed but for
// the button, the hand under it (or above it, low on the screen), the bubble on the other half. Then the reroll lesson
// (docs/46 §6) on a mock battle panel, in each of its three steps.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { GuideBubble, GuideFrame, type GuideBox } from '@/components/DiceTutorial'
import { Die } from '@/components/Die'
import { Chip } from '@/components/Chip'
import { PixelButton } from '@/components/PixelButton'
import type { LessonStep } from '@/components/RerollLesson'
import { TutorialHand } from '@/components/TutorialHand'
import { useT } from '@/i18n/react'
import { comboName } from '@/lib/format'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-[340px] max-w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const VARS = { gold: 10, mon: 'Charmander', type: 'Fire', area: 'Route 1' }

/** A phone-sized mock page with one button at `at` (from the top, in %), framed as the tutorial frames it. */
function Step({ at, text, zoomKey }: { at: number; text: string; zoomKey?: string }) {
  const page = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const [box, setBox] = useState<GuideBox | null>(null)
  useEffect(() => {
    const p = page.current?.getBoundingClientRect()
    const b = button.current?.getBoundingClientRect()
    if (p && b) setBox({ x: b.left - p.left, y: b.top - p.top, w: b.width, h: b.height })
  }, [])
  return (
    <div ref={page} className="relative h-[480px] w-[300px] overflow-hidden bg-parchment shadow-ring">
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 bg-paper shadow-card" />
        ))}
      </div>
      <button
        ref={button}
        type="button"
        className="pixel-btn frame-gold absolute left-1/2 min-h-[48px] -translate-x-1/2 px-4 text-[20px]"
        style={{ top: `${at}%` }}
      >
        ₽10 Upgrade
      </button>
      <GuideFrame fixed={false} box={box} bubble={<GuideBubble text={text} />} still zoomKey={zoomKey} />
    </div>
  )
}

/** An element's box inside the frame `page`. */
const within = (page: RefObject<HTMLElement>, el: RefObject<HTMLElement>): GuideBox | null => {
  const p = page.current?.getBoundingClientRect()
  const b = el.current?.getBoundingClientRect()
  return p && b ? { x: b.left - p.left, y: b.top - p.top, w: b.width, h: b.height } : null
}

/** The battle panel's foot as the lesson sees it: two dice, the readout, REROLL and ATTACK, at one of its steps. */
function Lesson({ step }: { step: LessonStep }) {
  const { t } = useT()
  const page = useRef<HTMLDivElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLSpanElement>(null)
  const readout = useRef<HTMLDivElement>(null)
  const reroll = useRef<HTMLButtonElement>(null)
  const attack = useRef<HTMLButtonElement>(null)
  const [boxes, setBoxes] = useState<Record<string, GuideBox | null>>({})
  useEffect(() => {
    setBoxes({
      tray: within(page, tray),
      first: within(page, first),
      readout: within(page, readout),
      reroll: within(page, reroll),
      attack: within(page, attack),
    })
  }, [])
  const pair = step === 'attack'
  const faces = pair ? [4, 4] : [2, 1]
  const spots =
    step === 'pick' ? [] : [boxes.tray, pair ? boxes.readout : null].filter((b): b is GuideBox => !!b)
  return (
    <div
      ref={page}
      className="relative flex h-[560px] w-[300px] flex-col overflow-hidden bg-parchment shadow-ring"
    >
      <div className="flex-1 bg-sky/40" />
      <div className="flex flex-col gap-3 bg-panel p-3">
        <div ref={tray} className="flex justify-center gap-2">
          {faces.map((v, i) => (
            <span key={i} ref={i === 0 ? first : undefined} className="inline-flex">
              <Die
                type={i === 0 ? 'fire' : 'base'}
                face={{ kind: 'number', value: v }}
                size={56}
                selected={step === 'reroll'}
                combo={pair}
                tier={pair ? 1 : 0}
              />
            </span>
          ))}
        </div>
        <div ref={readout} className="flex min-h-[30px] items-center justify-center gap-2">
          <b className="font-pixel text-[30px] font-normal leading-none">
            {t('ui.battle.dmg', { amount: pair ? 10 : 3 })}
          </b>
          {pair && (
            <Chip tone="gold" className="text-[16px]">
              {t('ui.battle.comboChip', { combo: comboName('pair'), bonus: 2 })}
            </Chip>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton ref={reroll} size="lg" className="px-2" disabled={step === 'pick' || pair}>
            {t('ui.battle.reroll', { left: pair ? 1 : 2 })}
          </PixelButton>
          <PixelButton ref={attack} variant="primary" size="lg" className="px-2">
            {t('ui.battle.attack')}
          </PixelButton>
        </div>
      </div>
      <GuideFrame
        fixed={false}
        box={step === 'pick' ? (boxes.tray ?? null) : (boxes[step] ?? null)}
        handAt={step === 'pick' ? boxes.first : null}
        spots={spots}
        bubble={<GuideBubble text={t(`ui.tutorial.reroll.${step}`, { bonus: 2 })} />}
        still
      />
    </div>
  )
}

/** The spotlight's zoom in, again at each REPLAY (calm or animations off: at once). */
function ZoomReplay({ text }: { text: string }) {
  const [n, setN] = useState(0)
  return (
    <div className="flex flex-col items-start gap-2">
      <PixelButton size="sm" onClick={() => setN((v) => v + 1)}>
        REPLAY
      </PixelButton>
      <Step at={45} text={text} zoomKey={String(n)} />
    </div>
  )
}

export function TutorialBits() {
  const { t } = useT()
  const noop = () => {}
  return (
    <>
      <Frame name="TutorialHand · up (bobbing), down, still">
        <div className="flex items-end gap-6">
          <TutorialHand />
          <TutorialHand down />
          <TutorialHand still />
          <TutorialHand scale={2} still />
        </div>
      </Frame>
      <Frame name="GuideBubble · the first step, away from Home: head Home">
        <GuideBubble text={t('ui.tutorial.dice.toHome', VARS)} />
      </Frame>
      <Frame name="GuideBubble · on Home: its Shop tab">
        <GuideBubble text={t('ui.tutorial.dice.toMart', VARS)} />
      </Frame>
      <Frame name="GuideBubble · its button not found: SHOW ME">
        <GuideBubble
          text={t('ui.tutorial.dice.toDice', VARS)}
          button={t('ui.tutorial.showMe')}
          onButton={noop}
        />
      </Frame>
      <Frame name="GuideBubble · the last step: back to the area">
        <GuideBubble
          text={t('ui.tutorial.dice.back', VARS)}
          button={t('ui.tutorial.dice.backButton', VARS)}
          onButton={noop}
        />
      </Frame>
      <Frame name="GuideFrame · the button high: the hand under it, the bubble below">
        <Step at={20} text={t('ui.tutorial.dice.buy', VARS)} />
      </Frame>
      <Frame name="GuideFrame · the button low: the hand above it, the bubble on top">
        <Step at={78} text={t('ui.tutorial.dice.toUpgrades', VARS)} />
      </Frame>
      <Frame name="GuideFrame · the zoom in: each step's spotlight closes in on its target in steps, then the hand">
        <ZoomReplay text={t('ui.tutorial.dice.toMart', VARS)} />
      </Frame>
      <Frame name="Reroll lesson · 1. the bad throw: the tray to tap, the hand on the next die">
        <Lesson step="pick" />
      </Frame>
      <Frame name="Reroll lesson · 2. both picked: REROLL, the dice lit">
        <Lesson step="reroll" />
      </Frame>
      <Frame name="Reroll lesson · 3. the pair: its combo lit, ATTACK">
        <Lesson step="attack" />
      </Frame>
    </>
  )
}
