// Rayquaza's raid in the sky (docs/15 §14): its stage, drawn by the pixel engine (src/fx/timelines/skyRaid.ts). Its
// entrance plays in RaidIntro (`world="sky"`). Nothing here decides a rule.
import { useRef } from 'react'
import { H, W } from '@/fx/timeline'
import { skyBattleStage } from '@/fx/timelines/skyRaid'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'
import { useLoop } from './PortalFx'

/**
 * The sky behind a raid's fight: the day, the Sky Pillar's far towers, the sea of clouds drifting, a pillar's top under
 * each side, the wind and the motes. Like every lasting effect it follows the motion rules (docs/15 §8): one still
 * frame with motion off or a calm OS.
 */
export function SkyStageArt({ className }: { className?: string }) {
  const { level, calm } = useMotion()
  const still = level === 'off' || calm
  const ref = useRef<HTMLCanvasElement>(null)
  useLoop(ref, () => skyBattleStage(still), still, [])
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      aria-hidden
      className={cx('pixelated absolute inset-0 h-full w-full', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
