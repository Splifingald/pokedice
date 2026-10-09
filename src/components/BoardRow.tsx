// Ranked rows, as on the leaderboard and Versus boards: a rank (gold, silver and bronze squares for 1–3), the
// trainer's look, their name (and "you"), their team as menu icons, and the value at the end.
import type { ReactNode, Ref } from 'react'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { MiniSprite } from './SpriteImg'
import { TrainerLook } from './TrainerLook'

const MEDAL = ['bg-gold', 'bg-[#d8dfeb]', 'bg-[#e8a070]']

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
}: {
  team: { dex: number; level: number; shiny?: boolean }[]
  owner: string
  size?: number
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
          <li key={i} title={label} className="-mx-[3px] first:ml-[-6px]">
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
        'flex items-center gap-2 pb-1.5 pl-1.5 pr-2.5 pt-1',
        isMe
          ? 'bg-[#fff4d6] shadow-[inset_0_0_0_2px_#24304f,inset_0_0_0_4px_#ffbe2e]'
          : dim
            ? 'bg-[#f1f4f9] shadow-[inset_0_0_0_2px_#b6c3d9]'
            : 'bg-paper shadow-[inset_0_0_0_2px_#b6c3d9]',
        flash && 'so-flash',
      )}
    >
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
        </b>
        <TeamIcons team={team} owner={name} />
        {sub}
      </span>
      {children ??
        (value != null && <span className="shrink-0 text-right text-[20px] leading-none">{value}</span>)}
    </li>
  )
}
