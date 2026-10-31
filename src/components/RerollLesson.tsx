// The reroll lesson (docs/46 §6): in a new player's first fight the engine makes their second throw a bad one; this
// walks them through mending it, as the dice tutorial walks them to the Mart (GuideFrame): pick both dice, REROLL, then
// the pair it lands and its combo bonus, and ATTACK. The engine rigs the dice and says which step the fight is at; this
// only finds that step's things on the battle screen and points at them.
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { GuideBubble, GuideFrame, useTargetBox, type GuideBox } from './DiceTutorial'

/** Pick the dice (the tray, the hand on the next one), REROLL, then ATTACK with the pair. */
export type LessonStep = 'pick' | 'reroll' | 'attack'

/** The battle screen's parts the lesson points at (BattleView and BattlePanel carry these). */
export const LESSON_TARGETS = {
  tray: '[data-guide="dice-tray"]',
  die: (i: number) => `[data-guide="die-${i}"]`,
  readout: '[data-guide="readout"]',
  reroll: '[data-guide="reroll"]',
  attack: '[data-guide="attack"]',
} as const

/**
 * The lesson over the fight. `show` false (the throw still landing, the combo not counted yet): no guide yet, but
 * every tap is held, so the bad throw can't be attacked with before the hand shows what to do.
 */
export function RerollLessonGuide({
  step,
  show,
  next,
  bonus,
}: {
  step: LessonStep
  show: boolean
  /** The pick step's next die (the first not picked yet). */
  next: number
  /** The pair's combo bonus, as the readout shows it. */
  bonus: number
}) {
  const { t } = useT()
  const { calm } = useMotion()
  const tray = useTargetBox(show ? LESSON_TARGETS.tray : null, false)
  const die = useTargetBox(show && step === 'pick' ? LESSON_TARGETS.die(next) : null, false)
  const button = useTargetBox(show && step !== 'pick' ? LESSON_TARGETS[step] : null)
  const readout = useTargetBox(show && step === 'attack' ? LESSON_TARGETS.readout : null, false)
  if (!show) return <div aria-hidden className="fixed inset-0 z-[85]" onClick={(e) => e.stopPropagation()} />
  const spots: GuideBox[] =
    step === 'pick' ? [] : [tray, step === 'attack' ? readout : null].filter((b): b is GuideBox => !!b)
  return (
    <GuideFrame
      box={step === 'pick' ? tray : button}
      handAt={step === 'pick' ? die : null}
      spots={spots}
      bubble={<GuideBubble text={t(`ui.tutorial.reroll.${step}`, { bonus })} />}
      still={calm}
      zoomKey={step}
    />
  )
}
