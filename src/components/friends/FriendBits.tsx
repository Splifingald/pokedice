// Small pieces of the friend list (docs/16): the blue "Friend" tag, a trainer preview, and a friend's one-line summary.
import { getRegion } from '@/engine'
import { useT } from '@/i18n/react'
import { agoText } from '@/lib/ago'
import { avatarOf } from '@/lib/avatars'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { TrainerLook } from '../TrainerLook'

/** "Friend": the blue tag on a friend's row, as "you" is the gold one. A word, never colour alone. */
export function FriendTag({ className }: { className?: string }) {
  const { t } = useT()
  return (
    <span
      className={cx(
        'shrink-0 bg-sky px-[5px] pb-px font-pixel-sm text-[13px] leading-tight text-ink shadow-[inset_0_0_0_2px_#5b8def]',
        className,
      )}
    >
      {t('ui.friends.tag')}
    </span>
  )
}

/** "Johto · Lv.54 · 2 h ago": where a friend is, how far, and when they last played. */
export function useFriendLine() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (f: { region: string | null; maxLevel: number; updatedAt?: number | null }, now: number) => {
    if (!f.region) return t('ui.friends.noGame')
    const parts = [getRegion(data, f.region)?.name ?? f.region, t('ui.common.level.short', { n: f.maxLevel })]
    if (f.updatedAt) parts.push(agoText(f.updatedAt, now))
    return parts.join(' · ')
  }
}

/**
 * A trainer as an invite or the ADD dialog shows them: their look, their name, where they are. `region` left out (not
 * null, which means "no game yet") when it isn't known: no line then.
 */
export function FriendPreview({
  name,
  avatar,
  region,
  maxLevel = 0,
}: {
  name: string
  avatar: string
  region?: string | null
  maxLevel?: number
}) {
  const line = useFriendLine()
  return (
    <div className="flex items-center gap-2.5 bg-paper py-1 pl-1.5 pr-3 shadow-ring-line">
      <TrainerLook src={avatarOf(avatar).src} w={44} h={48} />
      <span className="grid min-w-0 gap-0.5">
        <b className="truncate text-[21px] font-normal leading-none">{name}</b>
        {region !== undefined && (
          <small className="truncate font-pixel-sm text-[14px] leading-none text-muted">
            {line({ region, maxLevel }, Date.now())}
          </small>
        )}
      </span>
    </div>
  )
}
