import { useEffect, useRef, useState } from 'react'
import { artStrip, cachedStrip, pictureOf, SCENE_W, type AreaPicture } from '@/fx/areaArt'
import { stripOf } from '@/screens/home/scene'
import { cx } from '@/theme/util'

/**
 * An area's strip for lists, cut around its horizon: from its picture once the strip comes on screen (one request
 * per picture, then kept), from its painted scene before that and for areas without a picture. Both have the same
 * shape (288 × h), so nothing moves when the picture arrives.
 */
export function AreaStrip({
  area,
  picture,
  h = 56,
  className,
}: {
  area: { id: string; bannerUrl?: string | null }
  /** A picture that isn't an area's (the Day Care's yard); otherwise the area's own. */
  picture?: AreaPicture | null
  h?: number
  className?: string
}) {
  const pic = picture === undefined ? pictureOf(area.id) : picture
  const key = `${area.id}|${h}`
  const ref = useRef<HTMLImageElement>(null)
  const [got, setGot] = useState<{ key: string; url: string } | null>(null)

  useEffect(() => {
    if (!pic || cachedStrip(pic, h)) return
    let live = true
    const cut = () => void artStrip(pic, h).then((url) => live && url && setGot({ key, url }))
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      cut()
      return () => void (live = false)
    }
    // Only the strips on screen (or about to be) load their picture.
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return
        io.disconnect()
        cut()
      },
      { rootMargin: '160px' },
    )
    io.observe(el)
    return () => {
      live = false
      io.disconnect()
    }
    // pic follows key (the area id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const src = (got?.key === key && got.url) || (pic && cachedStrip(pic, h)) || stripOf(area.bannerUrl, h)
  return (
    <img
      ref={ref}
      src={src}
      alt=""
      draggable={false}
      className={cx('pixelated', className)}
      style={{ aspectRatio: `${SCENE_W} / ${h}` }}
    />
  )
}
