import { useState } from 'react'
import iconSheet from '@/assets/pokemon-icons.png'
import showdownSprites from '@/data/showdown-sprites.json'
import spriteMetrics from '@/data/sprite-metrics.json'
import {
  artBox,
  ICON_COLS,
  ICON_H,
  ICON_W,
  SHOWDOWN_VIEWS,
  showdownSpriteUrl,
  type ShowdownBox,
  type ShowdownEntry,
} from '@/lib/showdown'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** The local sprites' canvas. Forms keep PokeAPI's own 96px canvas, uncut, and are scaled here instead. */
export const SPRITE_CANVAS = 64

/**
 * Showdown's sprites are Black/White pixel art, drawn for a 96px canvas: the battle scene shows them one sprite pixel
 * to one scene pixel, as Unova's always were, so their pixels line up with the backgrounds'.
 */
export const SHOWDOWN_SCALE = 1

type Box = [number, number, number, number]
export interface SpriteMetric {
  front: number
  back: number
  /** Canvas size when it isn't 64 (the forms' 96). */
  size?: number
  /** The opaque pixels' box [x0, y0, x1, y1] on such a canvas. */
  frontBox?: Box
  backBox?: Box
}
/** The local sprites' (public/pokemon) metrics: the offline fallback when Showdown can't be reached. */
export const SPRITE_METRICS = spriteMetrics as unknown as Record<string, SpriteMetric | undefined>
export const SHOWDOWN = showdownSprites as unknown as Record<string, ShowdownEntry | undefined>

/** The Showdown sprite of one view, when Showdown has one: its URL and box. Shiny boxes fall back to the plain ones. */
export function showdownView(
  dex: number,
  back: boolean,
  shiny: boolean,
): { url: string; box: ShowdownBox } | null {
  const e = SHOWDOWN[dex]
  if (!e) return null
  const v = (back ? 1 : 0) + (shiny ? 2 : 0)
  const kind = e.v[v]
  const box = shiny ? (back ? (e.bs ?? e.b) : (e.fs ?? e.f)) : back ? e.b : e.f
  if ((kind !== 'a' && kind !== 'g') || !box) return null
  return { url: showdownSpriteUrl(e.id, SHOWDOWN_VIEWS[v]!, kind), box }
}

/**
 * Where a Showdown sprite goes in a `size` box: its art centred, at the pixel scale of a 96px Showdown canvas filling
 * the box (so a Charizard is bigger than a Pikachu, as in the games), shrunk only when the art is wider or taller than
 * the box. `ground`: the art stands on the box's floor instead (the battle scene).
 */
export function showdownPlacement(box: ShowdownBox, size: number, ground = false) {
  const [x0, y0, x1, y1] = artBox(box)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const px = ground ? size / Math.max(w, h) : Math.min(size / 96, size / Math.max(w, h))
  return {
    width: box[0] * px,
    height: box[1] * px,
    left: size / 2 - (x0 + w / 2) * px,
    top: ground ? size - (y1 + 1) * px : size / 2 - (y0 + h / 2) * px,
  }
}

/**
 * How a local sprite with a bigger canvas sits in a `size` box: drawn at the same pixel scale as a 64px sprite would be
 * (so a Mega is as big next to its Pokémon as in the games), shrunk only when its art is wider or taller than 64
 * pixels, and centred on its art. Null for a usual 64px sprite, which simply fills the box.
 */
export function spritePlacement(dex: number, back: boolean, size: number) {
  const m = SPRITE_METRICS[dex]
  if (!m?.size || m.size === SPRITE_CANVAS) return null
  const box = (back ? m.backBox : m.frontBox) ?? [0, 0, m.size - 1, m.size - 1]
  const w = box[2] - box[0] + 1
  const h = box[3] - box[1] + 1
  const px = Math.min(size / SPRITE_CANVAS, size / Math.max(w, h))
  return {
    width: m.size * px,
    height: m.size * px,
    left: size / 2 - (box[0] + w / 2) * px,
    top: size / 2 - (box[1] + h / 2) * px,
  }
}

/** Local sprites (public/pokemon, from `pnpm pokemon-sprites --publish`): what shows when Showdown can't be reached. */
export const spriteUrlFor = (dex: number, view: 'front' | 'back' = 'front', shiny = false) =>
  `/pokemon/${String(dex).padStart(3, '0')}_${view}${shiny ? '_shiny' : ''}.png`

/** Warm the browser cache (current area's pool only): the front each encounter will show. */
export function preloadSprites(dexes: number[]) {
  if (typeof Image === 'undefined') return
  for (const d of dexes) {
    const img = new Image()
    img.decoding = 'async'
    img.src = showdownView(d, false, false)?.url ?? spriteUrlFor(d)
  }
}

/**
 * A Pokémon by dex number: Showdown's animated sprite, with a skeleton while loading and a silhouette mode for uncaught.
 * Showdown unreachable (offline) → the local sprite → the species' own sprite_url (one added in admin) → "?". Only a
 * view Showdown really has is ever asked for, so no request is spent on a miss.
 */
export function SpriteImg({
  dex,
  size = 96,
  silhouette = false,
  flip = false,
  back = false,
  shiny = false,
  className,
  alt,
  fit = true,
}: {
  dex: number
  size?: number
  silhouette?: boolean
  flip?: boolean
  /** The player's side is seen from behind. */
  back?: boolean
  shiny?: boolean
  className?: string
  alt?: string
  /** Off: the art fills the box, standing on its floor (the battle scene sizes and places the box itself). */
  fit?: boolean
}) {
  const species = useGame((s) => s.data.species[dex])
  const sd = showdownView(dex, back, shiny)
  const local = spriteUrlFor(dex, back ? 'back' : 'front', shiny)
  // A species added in admin without a local sprite falls back to its own sprite_url.
  const own = species?.spriteUrl && species.spriteUrl !== spriteUrlFor(dex) ? species.spriteUrl : null
  const chain = [sd?.url, local, own].filter((u): u is string => !!u)
  const key = chain[0]!
  const [state, setState] = useState<{ key: string; step: number; loaded: boolean }>({
    key,
    step: 0,
    loaded: false,
  })
  const step = state.key === key ? state.step : 0
  const loaded = state.key === key && state.loaded
  const src = chain[step]
  const place =
    sd && src === sd.url
      ? showdownPlacement(sd.box, size, !fit)
      : fit && src === local
        ? spritePlacement(dex, back, size)
        : null

  return (
    <div
      className={cx('relative inline-block shrink-0', place && fit && 'overflow-hidden', className)}
      style={{ width: size, height: size }}
    >
      {!loaded && src && (
        // A plain ink square while loading — a checkerboard read like "missing".
        <div
          className="absolute inset-[25%] animate-pulse bg-ink/10"
          style={{ borderRadius: 2 }}
          aria-hidden
        />
      )}
      {!src ? (
        <div className="flex h-full w-full items-center justify-center text-4xl text-muted">?</div>
      ) : (
        <img
          key={src}
          src={src}
          alt={alt ?? species?.name ?? `#${dex}`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState({ key, step, loaded: true })}
          onError={() => setState({ key, step: step + 1, loaded: false })}
          className={cx('pixelated select-none', place ? 'absolute max-w-none' : 'h-full w-full')}
          style={{
            ...(place && { width: place.width, height: place.height, left: place.left, top: place.top }),
            imageRendering: 'pixelated',
            filter: silhouette ? 'var(--silhouette)' : undefined,
            transform: flip ? 'scaleX(-1)' : undefined,
            opacity: loaded ? 1 : 0,
          }}
        />
      )}
    </div>
  )
}

/**
 * The menu icon: Showdown's icon for the Pokémon, hopping a pixel every 0.3 s. Every icon in the game comes from one
 * sheet (src/assets/pokemon-icons.png), so a whole Box costs a single request. Every mini on screen shares the same
 * beat (the animation is offset by the wall clock). Sits before a Pokémon's name in lists and cards.
 */
/** Every mini is drawn half again as big as the size its caller asks for: the icons read too small in game. */
const MINI_SCALE = 1.5

export function MiniSprite({
  dex,
  size: asked = 40,
  silhouette = false,
  className,
  alt = '',
}: {
  dex: number
  size?: number
  silhouette?: boolean
  className?: string
  alt?: string
}) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [delay] = useState(() => `-${Date.now() % 600}ms`)
  const cell = SHOWDOWN[dex]?.i ?? 0
  const size = Math.round(asked * MINI_SCALE)
  const k = size / ICON_W
  return (
    <span
      className={cx('relative inline-block shrink-0 overflow-hidden', className)}
      style={{ width: size, height: size }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <span
        className={cx('pixelated absolute left-0 select-none', !reduced && 'mini-hop')}
        style={{
          top: (size - ICON_H * k) / 2,
          width: size,
          height: ICON_H * k,
          backgroundImage: `url(${iconSheet})`,
          backgroundSize: `${ICON_COLS * ICON_W * k}px auto`,
          backgroundPosition: `-${(cell % ICON_COLS) * ICON_W * k}px -${Math.floor(cell / ICON_COLS) * ICON_H * k}px`,
          imageRendering: 'pixelated',
          filter: silhouette ? 'var(--silhouette)' : undefined,
          animationDelay: reduced ? undefined : delay,
        }}
      />
    </span>
  )
}
