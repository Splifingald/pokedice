import { useCallback, useRef, useState } from 'react'
import type { artPlacement } from '@/fx/areaArt'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'

/**
 * The pictures already shown this session. A fight's screen is built again for each fight, and a trainer's next
 * Pokémon now comes straight into the fight (a new fight each): a picture seen before shows on the first frame, with
 * no fade, or the background flickered at every send-out (the user, 2026-11-06).
 */
const seen = new Set<string>()
export const artSeen = (src: string): boolean => seen.has(src)

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
  const [again] = useState(() => seen.has(src))
  const [shown, setShown] = useState(again)
  const told = useRef(onShown)
  told.current = onShown
  const show = useCallback(() => {
    seen.add(src)
    setShown(true)
    told.current?.()
  }, [src])
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
      // Seen before: decoded with the frame, so it never paints blank first.
      decoding={again ? 'sync' : 'async'}
      onLoad={show}
      className={cx('pixelated pointer-events-none absolute max-w-none select-none', className)}
      style={{
        ...place,
        opacity: shown ? 1 : 0,
        transition: calm || again ? undefined : 'opacity 180ms steps(3)',
      }}
    />
  )
}
