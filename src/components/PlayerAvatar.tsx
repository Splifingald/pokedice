import { useState } from 'react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { playerOf } from './TrainerArt'

/** The letter shown when there's no Google picture: the player's initial, or a Poké Ball-ish dot. */
function initialOf(name: string): string {
  const first = [...name.trim()][0]
  return first ? first.toUpperCase() : '?'
}

/**
 * The player's circle: their Google profile picture when they're connected, otherwise the first
 * letter of their trainer name, white on blue. Purely visual — the button around it owns the label.
 */
export function PlayerAvatar({ size = 36, className }: { size?: number; className?: string }) {
  const auth = useGame((s) => s.auth)
  const save = useGame((s) => s.save)
  const [broken, setBroken] = useState(false)
  const photo = auth.status === 'signed_in' && auth.avatarUrl && !broken ? auth.avatarUrl : null
  const name = playerOf(save).name

  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={cx('shrink-0 rounded-full border-2 border-ink object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cx('flex shrink-0 items-center justify-center rounded-full border-2 border-ink bg-[#547acc] leading-none text-white', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
    >
      {initialOf(name)}
    </span>
  )
}
