import { cx } from '@/theme/util'

/** A `#flip` fragment on a banner URL mirrors the scene, so one strip can dress two areas. */
export const isFlippedBanner = (url: string) => url.endsWith('#flip')

/**
 * An area's banner strip (public/banners, 118×16 pixel art). It fills the box and is cropped, never squashed;
 * the crop keeps the bottom so wide boxes lose sky rather than the ground.
 */
export function AreaBanner({ url, className }: { url: string; className?: string }) {
  return (
    <img
      src={url}
      alt=""
      className={cx(
        'pixelated block w-full object-cover object-bottom',
        isFlippedBanner(url) && '-scale-x-100',
        className,
      )}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
