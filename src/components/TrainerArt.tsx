// Trainer sprites (64×64 cells cut from graphics/trainers) and the pixel Poké Balls thrown at catches.
import type { CSSProperties } from 'react'
import type { PlayerCharacter, SaveData } from '@/engine'

export const PLAYER_CHARACTERS: PlayerCharacter[] = ['red', 'green']

export const playerOf = (save: SaveData | null | undefined) => ({
  name: save?.player?.name ?? '',
  character: save?.player?.character ?? ('red' as PlayerCharacter),
})

/** A 64px trainer sprite shown at a whole-pixel scale. */
export function TrainerSprite({
  src,
  size = 128,
  className,
  style,
  alt = '',
}: {
  src: string | null | undefined
  size?: number
  className?: string
  style?: CSSProperties
  alt?: string
}) {
  return (
    <img
      src={src ?? '/trainers/default.png'}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ imageRendering: 'pixelated', ...style }}
    />
  )
}

/** The player's throw: a 5-frame strip, `frame` 0–4 (0 is the ready pose). */
export function ThrowSprite({ character, frame, size = 128 }: { character: PlayerCharacter; frame: number; size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        backgroundImage: `url(/characters/${character}-throw.png)`,
        backgroundSize: `${size * 5}px ${size}px`,
        backgroundPosition: `-${Math.min(4, Math.max(0, frame)) * size}px 0`,
        imageRendering: 'pixelated',
      }}
    />
  )
}

// 14×14 ball. K outline, T top colour, M top markings, H highlight, B bottom, S bottom shade, W button.
const BALL = [
  '....KKKKKK....',
  '..KKTTTTTTKK..',
  '.KTHHTTTTTTTK.',
  '.KHMTTTTTTMTK.',
  'KTMMTTTTTTMMTK',
  'KTTTTKKKKTTTTK',
  'KKKKKKWWKKKKKK',
  'KBBBBKWWKBBBBK',
  'KBBBBKKKKBBBBK',
  'KBBBBBBBBBBBBK',
  '.KBBBBBBBBBBK.',
  '.KSBBBBBBBBSK.',
  '..KKSSSSSSKK..',
  '....KKKKKK....',
]

const BALL_COLORS: Record<string, { T: string; M: string }> = {
  'poke-ball': { T: '#e03c3c', M: '#e03c3c' },
  'great-ball': { T: '#3a74d8', M: '#e03c3c' },
  'ultra-ball': { T: '#34343c', M: '#f2c230' },
  'master-ball': { T: '#8a3fc4', M: '#f07cc0' },
}

export function PokeBall({ ballKey, size = 28, className }: { ballKey?: string | null; size?: number; className?: string }) {
  const c = BALL_COLORS[ballKey ?? ''] ?? BALL_COLORS['poke-ball']!
  const fill: Record<string, string> = { K: '#1f1b2d', T: c.T, M: c.M, H: '#ffffff', B: '#f4f1ea', S: '#c9c3b6', W: '#ffffff' }
  const rects = BALL.flatMap((row, y) =>
    [...row].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill[ch]} />)),
  )
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} className={className} shapeRendering="crispEdges" aria-hidden>
      {rects}
    </svg>
  )
}
