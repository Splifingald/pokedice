import { useState } from 'react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

export const spriteUrlFor = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`
export const backSpriteUrlFor = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${dex}.png`

/** Warm the browser cache (current area's pool only). */
export function preloadSprites(dexes: number[]) {
  if (typeof Image === 'undefined') return
  for (const d of dexes) {
    const img = new Image()
    img.decoding = 'async'
    img.src = spriteUrlFor(d)
  }
}

/** Pixelated sprite by dex number, with a checkered skeleton while loading and a silhouette mode for uncaught. */
export function SpriteImg({
  dex,
  size = 96,
  silhouette = false,
  flip = false,
  back = false,
  className,
  alt,
}: {
  dex: number
  size?: number
  silhouette?: boolean
  flip?: boolean
  /** The player's side uses PokeAPI back sprites. */
  back?: boolean
  className?: string
  alt?: string
}) {
  const species = useGame((s) => s.data.species[dex])
  const src = back ? backSpriteUrlFor(dex) : species?.spriteUrl || spriteUrlFor(dex)
  const [state, setState] = useState<{ src: string; status: 'loading' | 'ok' | 'error' }>({ src, status: 'loading' })
  const status = state.src === src ? state.status : 'loading'

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
          onLoad={() => setState({ src, status: 'ok' })}
          onError={() => setState({ src, status: 'error' })}
          className="pixelated h-full w-full select-none"
          style={{
            imageRendering: 'pixelated',
            filter: silhouette ? 'brightness(0) opacity(0.75)' : undefined,
            transform: flip ? 'scaleX(-1)' : undefined,
            opacity: status === 'ok' ? 1 : 0,
          }}
        />
      )}
    </div>
  )
}
