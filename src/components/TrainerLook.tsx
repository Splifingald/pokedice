import { useEffect, useState, type CSSProperties } from 'react'
import { TRAINER_CELL, TRAINER_COLS, TRAINER_PITCH } from '@/lib/showdown'
import { cx } from '@/theme/util'
import { trainerCell, TrainerSprite } from './TrainerArt'

/** The first opaque row of each trainer's cell, per sprite URL: where its head starts. */
const tops = new Map<string, number>()
const sheets = new Map<string, Promise<ImageData | null>>()

function sheetPixels(url: string): Promise<ImageData | null> {
  let p = sheets.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        try {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const g = c.getContext('2d')
          if (!g) return resolve(null)
          g.drawImage(img, 0, 0)
          resolve(g.getImageData(0, 0, c.width, c.height))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = url
    })
    sheets.set(url, p)
  }
  return p
}

/** Where a trainer's head starts in its 80×80 cell (art pixels from the top); 8 until the sheet is read. */
function useHeadTop(src: string | null | undefined): number {
  const [top, setTop] = useState(() => (src ? (tops.get(src) ?? 8) : 8))
  useEffect(() => {
    const cell = trainerCell(src)
    if (!src || !cell) return
    const known = tops.get(src)
    if (known != null) return setTop(known)
    let live = true
    void sheetPixels(cell.sheet).then((px) => {
      if (!px || !live) return
      const x0 = cell.col * TRAINER_PITCH
      const y0 = cell.row * TRAINER_PITCH
      let found = 8
      outer: for (let y = 0; y < TRAINER_CELL; y++)
        for (let x = 0; x < TRAINER_CELL; x++)
          if (px.data[((y0 + y) * px.width + x0 + x) * 4 + 3]! > 0) {
            found = y
            break outer
          }
      tops.set(src, found)
      setTop(found)
    })
    return () => {
      live = false
    }
  }, [src])
  return top
}

/**
 * A trainer's look as a crop of their sprite, from the top of the head: the top-bar avatar, leaderboard and Versus rows,
 * the trainer card. `w` × `h` CSS pixels at `zoom` CSS pixels per sprite pixel; `above` sprite pixels of air over the
 * head.
 */
export function TrainerLook({
  src,
  w,
  h,
  zoom = 1,
  above = 3,
  className,
  style,
}: {
  src: string | null | undefined
  w: number
  h: number
  zoom?: number
  above?: number
  className?: string
  style?: CSSProperties
}) {
  const top = useHeadTop(src)
  const cell = trainerCell(src)
  if (!cell) return <TrainerSprite src={src} size={Math.max(w, h)} className={className} style={style} />
  const left = cell.col * TRAINER_PITCH + TRAINER_CELL / 2 - w / (2 * zoom)
  const y = cell.row * TRAINER_PITCH + top - above
  return (
    <span
      aria-hidden
      className={cx('inline-block shrink-0', className)}
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${cell.sheet})`,
        backgroundSize: `${TRAINER_COLS * TRAINER_PITCH * zoom}px ${cell.rows * TRAINER_PITCH * zoom}px`,
        backgroundPosition: `${-left * zoom}px ${-y * zoom}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  )
}
