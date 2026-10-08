// Trainer sprites (Showdown's 80×80, packed one sheet per region) and the pixel Poké Balls thrown at catches.
import type { CSSProperties } from 'react'
import type { PlayerCharacter, SaveData } from '@/engine'
import atlas from '@/data/trainer-atlas.json'
import { TRAINER_CELL, TRAINER_COLS, TRAINER_PITCH } from '@/lib/showdown'

export const PLAYER_CHARACTERS: PlayerCharacter[] = ['red', 'green']

export const playerOf = (save: SaveData | null | undefined) => ({
  name: save?.player?.name ?? '',
  character: save?.player?.character ?? ('red' as PlayerCharacter),
})

/** The region sheets (scripts/showdown-sprites.ts), by name: hashed asset URLs, so each is fetched once a year. */
const SHEETS = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/trainers/*.png', { query: '?url', import: 'default', eager: true }),
  ).map(([file, url]) => [file.replace(/^.*\/|\.png$/g, ''), url]),
)
const ATLAS = atlas as unknown as {
  sheets: Record<string, number>
  cells: Record<string, [sheet: string, cell: number]>
}

/** Where a sprite URL sits in the region sheets, or null for one outside them (an admin's own sprite_url). */
export function trainerCell(src: string | null | undefined) {
  const hit = src ? ATLAS.cells[src] : undefined
  const sheet = hit && SHEETS[hit[0]]
  if (!hit || !sheet) return null
  return {
    sheet,
    rows: ATLAS.sheets[hit[0]]!,
    col: hit[1] % TRAINER_COLS,
    row: Math.floor(hit[1] / TRAINER_COLS),
  }
}

/**
 * An 80px trainer sprite at any size. Every sprite the game names is a cell of its region's sheet, so a screen full of
 * trainers costs one request per region; any other URL loads as an image of its own.
 */
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
  const url = src || '/trainers/default.png'
  const cell = trainerCell(url)
  if (!cell)
    return (
      <img
        src={url}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
        className={className}
        style={{ imageRendering: 'pixelated', ...style }}
      />
    )
  const k = size / TRAINER_CELL
  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-src={url}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundImage: `url(${cell.sheet})`,
        backgroundSize: `${TRAINER_COLS * TRAINER_PITCH * k}px ${cell.rows * TRAINER_PITCH * k}px`,
        backgroundPosition: `-${cell.col * TRAINER_PITCH * k}px -${cell.row * TRAINER_PITCH * k}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        ...style,
      }}
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
