import { useCallback, useRef, useState } from 'react'
import type { artPlacement } from '@/fx/areaArt'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'

/**
 * An area picture laid over a box at its own resolution (src/fx/areaArt.ts): `place` crops it to the window the box
 * shows. It stays hidden until loaded, then steps in over what stood in for it (the painted scene), so nothing
 * flashes; a picture already in the cache shows at once.
 */
export function AreaArt({
  src,
  place,
  onShown,
  className,
}: {
  src: string
  place: ReturnType<typeof artPlacement>
  onShown?: () => void
  className?: string
}) {
  const { calm } = useMotion()
  const [shown, setShown] = useState(false)
  const told = useRef(onShown)
  told.current = onShown
  const show = useCallback(() => {
    setShown(true)
    told.current?.()
  }, [])
  // A cached picture can be complete before React listens for its load.
  const ref = useCallback(
    (el: HTMLImageElement | null) => {
      if (el?.complete && el.naturalWidth) show()
    },
    [show],
  )
  return (
    <img
      ref={ref}
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      onLoad={show}
      className={cx('pixelated pointer-events-none absolute max-w-none select-none', className)}
      style={{
        ...place,
        opacity: shown ? 1 : 0,
        transition: calm ? undefined : 'opacity 180ms steps(3)',
      }}
    />
  )
}
