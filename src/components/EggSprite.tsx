// The Day Care's Egg, drawn in code: a 12×14 pixel map (k outline, w shell, s shade, g spots).
const EGG = [
  '....kkkk....',
  '...kwwwwk...',
  '..kwwggwwk..',
  '.kwwgggwwwk.',
  '.kwwwggwwwk.',
  'kwwwwwwwggwk',
  'kwggwwwwggwk',
  'kwgggwwwwwsk',
  'kwwggwwwwwsk',
  'kwwwwwwgwwsk',
  '.kwwwwwggssk',
  '.kswwwwwsssk',
  '..kssssssk..',
  '...kkkkkk...',
]
const EGG_COLORS: Record<string, string> = { k: '#24304f', w: '#fbfdff', s: '#d8cfb4', g: '#34c97a' }

/** `shake`: the wobble of an Egg about to hatch (still when the OS asks for reduced motion). */
export function EggSprite({ size = 64, shake, className }: { size?: number; shake?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={(size * EGG.length) / EGG[0]!.length}
      viewBox={`0 0 ${EGG[0]!.length} ${EGG.length}`}
      shapeRendering="crispEdges"
      className={[shake ? 'egg-shake' : '', className ?? ''].join(' ').trim() || undefined}
      aria-hidden
    >
      {EGG.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={EGG_COLORS[ch]} />,
        ),
      )}
    </svg>
  )
}
