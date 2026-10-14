// The Day Care's Egg, drawn in code from its pixel map (eggMap.ts, which scripts/app-icons.ts reads too).
import { EGG_COLORS, EGG_MAP } from './eggMap'

export { EGG_COLORS, EGG_MAP }

/** `shake`: the wobble of an Egg about to hatch (still when the OS asks for reduced motion). */
export function EggSprite({ size = 64, shake, className }: { size?: number; shake?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={(size * EGG_MAP.length) / EGG_MAP[0]!.length}
      viewBox={`0 0 ${EGG_MAP[0]!.length} ${EGG_MAP.length}`}
      shapeRendering="crispEdges"
      className={[shake ? 'egg-shake' : '', className ?? ''].join(' ').trim() || undefined}
      aria-hidden
    >
      {EGG_MAP.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={EGG_COLORS[ch]} />,
        ),
      )}
    </svg>
  )
}
