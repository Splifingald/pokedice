// Kitchen sink (dev only): the dice tutorial (docs/46 §5) — the pixel hand (pointing up, down, still), Prof. Oak's
// bubble (a step's line, with SHOW ME, with the way back), and a step framed as in the game: the screen dimmed but for
// the button, the hand under it (or above it, low on the screen), the bubble on the other half.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GuideBubble, GuideFrame, type GuideBox } from '@/components/DiceTutorial'
import { TutorialHand } from '@/components/TutorialHand'
import { useT } from '@/i18n/react'

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
function Step({ at, text }: { at: number; text: string }) {
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
      <GuideFrame fixed={false} box={box} bubble={<GuideBubble text={text} />} still />
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
      <Frame name="GuideBubble · a step">
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
    </>
  )
}
