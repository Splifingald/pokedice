// The game's other pictures, for the trailer's canvas: trainers from the region sheets (TrainerArt), the Pokémon menu
// icons (MiniSprite's sheet), the Egg (eggMap) and any plain image.
import iconSheet from '@/assets/pokemon-icons.png'
import kantoSheet from '@/assets/trainers/kanto.png'
import atlas from '@/data/trainer-atlas.json'
import showdown from '@/data/showdown-sprites.json'
import { EGG_COLORS, EGG_MAP } from '@/components/eggMap'
import { icon } from '@/fx/pixel'
import { ICON_COLS, ICON_H, ICON_W, TRAINER_CELL, TRAINER_COLS, TRAINER_PITCH } from '@/lib/showdown'

const images = new Map<string, HTMLImageElement>()

export function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = images.get(url)
  if (hit) return Promise.resolve(hit)
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => {
      images.set(url, im)
      res(im)
    }
    im.onerror = () => rej(new Error(`no image: ${url}`))
    im.src = url
  })
}
export const image = (url: string) => images.get(url)!

export const loadArt = () => Promise.all([loadImage(iconSheet), loadImage(kantoSheet)])

const CELLS = (atlas as unknown as { cells: Record<string, [string, number]> }).cells

/** A Kanto trainer (an 80 px cell), `k` screen pixels per sprite pixel, its feet at (x, y). */
export function drawTrainer(g: CanvasRenderingContext2D, src: string, x: number, y: number, k: number, flip = false) {
  const cell = CELLS[src]
  if (!cell) return
  const i = cell[1]
  const sx = (i % TRAINER_COLS) * TRAINER_PITCH
  const sy = Math.floor(i / TRAINER_COLS) * TRAINER_PITCH
  const s = TRAINER_CELL * k
  g.save()
  g.imageSmoothingEnabled = false
  g.translate(Math.round(x), Math.round(y - s))
  if (flip) g.scale(-1, 1)
  g.drawImage(image(kantoSheet), sx, sy, TRAINER_CELL, TRAINER_CELL, Math.round(-s / 2), 0, Math.round(s), Math.round(s))
  g.restore()
}

const ICONS = showdown as unknown as Record<string, { i: number } | undefined>

/** A Pokémon's menu icon (40×30), `k` screen pixels per icon pixel, top left at (x, y). */
export function drawIcon(g: CanvasRenderingContext2D, dex: number, x: number, y: number, k: number) {
  const i = ICONS[dex]?.i ?? 0
  g.imageSmoothingEnabled = false
  g.drawImage(
    image(iconSheet),
    (i % ICON_COLS) * ICON_W,
    Math.floor(i / ICON_COLS) * ICON_H,
    ICON_W,
    ICON_H,
    Math.round(x),
    Math.round(y),
    Math.round(ICON_W * k),
    Math.round(ICON_H * k),
  )
}

export const egg = () => icon(EGG_MAP, EGG_COLORS, 1)

const HEART = ['.kk.kk.', 'krrkrrk', 'krwrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...']
export const heart = () => icon(HEART, { k: '#24304f', r: '#f2553f', w: '#ffffff' }, 1)
