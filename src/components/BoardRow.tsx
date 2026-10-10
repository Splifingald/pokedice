// Ranked rows, as on the leaderboard and Versus boards: a rank (gold, silver and bronze squares for 1–3), the
// trainer's look, their name (and "you", or "Friend" for a friend: docs/16), their team as menu icons, and the value at
// the end. A friend's row is sky blue with a blue edge, and can open their card.
import type { ReactNode, Ref } from 'react'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { FriendTag } from './friends/FriendBits'
import { MiniSprite } from './SpriteImg'
import { TrainerLook } from './TrainerLook'

// Bright squares in both themes: their numbers stay navy (light-scope).
const MEDAL = ['bg-gold', 'light-scope bg-[#d8dfeb]', 'light-scope bg-[#e8a070]']

/** The rank: a plain number from 4 on; the podium wears gold, silver and bronze squares. */
export function RankMedal({ rank }: { rank: number }) {
  const { t } = useT()
  return (
    <span
      aria-label={t('ui.board.rank', { rank })}
      className={cx(
        'grid h-[30px] min-w-[30px] shrink-0 place-items-center px-0.5 text-[19px] leading-none',
        rank <= 3 ? cx(MEDAL[rank - 1], 'text-ink shadow-ring') : 'text-muted',
      )}
    >
      {rank}
    </span>
  )
}

/** The gold crown of the Hall of Fame. */
export function Crown({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'block h-[18px] w-6 shrink-0 bg-gold [clip-path:polygon(0_20%,25%_55%,50%_0,75%_55%,100%_20%,92%_100%,8%_100%)]',
        className,
      )}
    />
  )
}

/** A team as menu icons (one atlas, no request each), with their names and levels for screen readers. */
export function TeamIcons({
  team,
  owner,
  size = 32,
  spaced,
}: {
  team: { dex: number; level: number; shiny?: boolean }[]
  owner: string
  size?: number
  /** A little room between the icons instead of the tight overlap. */
  spaced?: boolean
}) {
  const { t } = useT()
  const species = useGame((s) => s.data.species)
  return (
    <ul className="m-0 flex list-none items-center p-0" aria-label={t('ui.board.theirTeam', { name: owner })}>
      {team.map((m, i) => {
        const label = t('ui.board.monTitle', {
          name: species[m.dex]?.name ?? t('ui.common.pokemon'),
          level: m.level,
        })
        return (
          // The icons draw half again as big as `size` (MiniSprite) with empty space round them: they overlap so a
          // row keeps the width it had.
          <li
            key={i}
            title={label}
            style={
              spaced
                ? {
                    marginLeft: Math.round(-size * (i === 0 ? 0.3 : 0.15)),
                    marginRight: Math.round(-size * 0.15),
                    marginBlock: Math.round(-size * 0.22),
                  }
                : { marginLeft: Math.round(-size * (i === 0 ? 0.5 : 0.34)), marginRight: Math.round(-size * 0.34) }
            }
          >
            <MiniSprite dex={m.dex} size={size} alt={label} />
          </li>
        )
      })}
    </ul>
  )
}

/** One trainer on a board. `lead` replaces the rank (the Hall of Fame's crown). */
export function BoardRow({
  rank,
  lead,
  look,
  name,
  isMe,
  isFriend,
  onOpen,
  team,
  value,
  sub,
  rowRef,
  flash,
  dim,
  children,
}: {
  rank?: number
  lead?: ReactNode
  /** The trainer sprite to crop. */
  look: string | null
  name: string
  isMe?: boolean
  /** One of your friends: the blue row and tag. */
  isFriend?: boolean
  /** The whole row opens something (a friend's card): a button laid over it, the row's content stays as it is. */
  onOpen?: () => void
  team: { dex: number; level: number; shiny?: boolean }[]
  value?: ReactNode
  sub?: ReactNode
  rowRef?: Ref<HTMLLIElement>
  /** Just found with "show my row": it blinks three times. */
  flash?: boolean
  /** Done with (a team already beaten). */
  dim?: boolean
  /** In place of the value (a Fight button). */
  children?: ReactNode
}) {
  const { t } = useT()
  return (
    <li
      ref={rowRef}
      aria-current={isMe || undefined}
      className={cx(
        'relative flex items-center gap-2 pb-1.5 pl-1.5 pr-2.5 pt-1',
        isMe
          ? 'bg-gold-pale shadow-card-gold'
          : isFriend
            ? 'bg-sky shadow-[inset_5px_0_0_#5b8def,inset_0_0_0_2px_#5b8def]'
            : dim
              ? 'bg-well shadow-ring-line'
              : 'bg-paper shadow-ring-line',
        isFriend && !isMe && 'pl-2.5',
        flash && 'so-flash',
      )}
    >
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t('ui.board.openCard', { name })}
          className="absolute inset-0 z-[1] cursor-pointer"
        />
      )}
      {lead ?? (rank != null && <RankMedal rank={rank} />)}
      <TrainerLook src={look} w={44} h={48} className={cx(dim && 'opacity-75 grayscale-[0.7]')} />
      <span className="grid min-w-0 flex-1 gap-px">
        <b className="flex min-w-0 items-center gap-1 text-[20px] font-normal leading-none">
          <span className="truncate">{name}</span>
          {isMe && (
            <span className="shrink-0 bg-gold px-[5px] pb-px font-pixel-sm text-[13px] leading-tight text-ink">
              {t('ui.board.youTag')}
            </span>
          )}
          {isFriend && !isMe && <FriendTag />}
        </b>
        {/* Half again as big as elsewhere, and spaced out: the team is what a row is read for. */}
        <TeamIcons team={team} owner={name} size={48} spaced />
        {sub}
      </span>
      {children ??
        (value != null && <span className="shrink-0 text-right text-[20px] leading-none">{value}</span>)}
    </li>
  )
}
