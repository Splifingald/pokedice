import { useState } from 'react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

export type SpriteView = 'front' | 'back' | 'mini_1' | 'mini_2'

/** Local FireRed/LeafGreen sprites (public/pokemon, from `pnpm pokemon-sprites --publish`). Minis have no shiny version. */
export const spriteUrlFor = (dex: number, view: SpriteView = 'front', shiny = false) =>
  `/pokemon/${String(dex).padStart(3, '0')}_${view}${shiny && !view.startsWith('mini') ? '_shiny' : ''}.png`

/** Warm the browser cache (current area's pool only). */
export function preloadSprites(dexes: number[]) {
  if (typeof Image === 'undefined') return
  for (const d of dexes) {
    const img = new Image()
    img.decoding = 'async'
    img.src = spriteUrlFor(d)
  }
}

/** Pixelated sprite by dex number, with a skeleton while loading and a silhouette mode for uncaught. */
export function SpriteImg({
  dex,
  size = 96,
  silhouette = false,
  flip = false,
  back = false,
  shiny = false,
  className,
  alt,
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
}) {
  const species = useGame((s) => s.data.species[dex])
  const local = spriteUrlFor(dex, back ? 'back' : 'front', shiny)
  // A species added in admin without a local sprite falls back to its own sprite_url.
  const fallback = species?.spriteUrl && species.spriteUrl !== spriteUrlFor(dex) ? species.spriteUrl : null
  const [state, setState] = useState<{ key: string; status: 'loading' | 'ok' | 'fallback' | 'error' }>({ key: local, status: 'loading' })
  const status = state.key === local ? state.status : 'loading'
  const src = status === 'fallback' ? fallback! : local

  return (
    <div className={cx('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      {status === 'loading' && (
        // A plain ink square while loading — a checkerboard read like "missing".
        <div className="absolute inset-[25%] animate-pulse bg-ink/10" style={{ borderRadius: 2 }} aria-hidden />
      )}
      {status === 'error' ? (
        <div className="flex h-full w-full items-center justify-center text-4xl text-muted">?</div>
      ) : (
        <img
          src={src}
          alt={alt ?? species?.name ?? `#${dex}`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState((s) => ({ key: local, status: s.key === local && s.status === 'fallback' ? 'fallback' : 'ok' }))}
          onError={() =>
            setState((s) => ({ key: local, status: s.key === local && s.status === 'fallback' ? 'error' : fallback ? 'fallback' : 'error' }))
          }
          className="pixelated h-full w-full select-none"
          style={{
            imageRendering: 'pixelated',
            filter: silhouette ? 'brightness(0) opacity(0.75)' : undefined,
            transform: flip ? 'scaleX(-1)' : undefined,
            opacity: status === 'loading' ? 0 : 1,
          }}
        />
      )}
    </div>
  )
}

/**
 * The menu icon: a 32×32 party sprite hopping between its two frames every 0.3 s. Every mini on screen shares the
 * same beat (the animation is offset by the wall clock). Sits before a Pokémon's name in lists and cards.
 */
export function MiniSprite({
  dex,
  size = 40,
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
  const img = (view: SpriteView, anim?: string) => (
    <img
      src={spriteUrlFor(dex, view)}
      alt={view === 'mini_1' ? alt : ''}
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      className={cx('pixelated absolute inset-0 h-full w-full select-none', !reduced && anim)}
      style={{
        imageRendering: 'pixelated',
        filter: silhouette ? 'brightness(0) opacity(0.75)' : undefined,
        animationDelay: reduced ? undefined : delay,
        opacity: reduced && view === 'mini_2' ? 0 : undefined,
      }}
    />
  )
  return (
    <span className={cx('relative inline-block shrink-0', className)} style={{ width: size, height: size }} aria-hidden={alt ? undefined : true}>
      {img('mini_1', 'mini-frame-a')}
      {img('mini_2', 'mini-frame-b')}
    </span>
  )
}
