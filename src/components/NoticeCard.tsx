// A notice in the page (docs/43 §7): what used to open as a one-time pop-up but asks nothing of the player — Prof.
// Oak's leaderboard tip, his invite, Support me, a new region on offer. A card on Home, above its sections: a picture,
// a title, a line and one quiet action, and ✕ to put it away for good. Never red: Home's one red action is CONTINUE.
import { useId, type ReactNode } from 'react'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { TrainerSprite } from './TrainerArt'

/** Prof. Oak's face, as his notes wear it. */
export function OakFace({ size = 56 }: { size?: number }) {
  const { t } = useT()
  return (
    <TrainerSprite
      src="/characters/prof-oak.png"
      alt={t('ui.newGame.oak')}
      size={size}
      className="shrink-0"
    />
  )
}

export function NoticeCard({
  tone = 'plain',
  picture,
  title,
  children,
  action,
  onClose,
  testId,
}: {
  /** `oak`: Prof. Oak's note (sand); `gold`: something new to open; `plain`: the developer's word. */
  tone?: 'oak' | 'gold' | 'plain'
  picture: ReactNode
  title: string
  /** The line (and anything that belongs with it, such as the invite's gauge). */
  children: ReactNode
  /** One action, a quiet button. */
  action?: ReactNode
  /** ✕: put it away for good. Without it the notice stays while it holds (a region on offer). */
  onClose?: () => void
  testId?: string
}) {
  const { t } = useT()
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      className={cx(
        'relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-3',
        onClose && 'pr-[52px]',
        tone === 'oak'
          ? 'bg-sand shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-sand-lip))]'
          : tone === 'gold'
            ? 'pixel-panel panel-gold'
            : 'pixel-panel',
      )}
    >
      <span className="grid min-h-[56px] min-w-[56px] place-items-center">{picture}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id={titleId} className="m-0 text-[22px] font-normal leading-none">
          {title}
        </h2>
        <div className="copy text-[18px] leading-snug">{children}</div>
        {action && <div className="flex flex-wrap items-center gap-2 pt-0.5">{action}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('ui.home.noticeClose', { name: title })}
          className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center"
        >
          <PixelIcon name="close" size={14} />
        </button>
      )}
    </section>
  )
}
