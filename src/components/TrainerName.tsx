// A trainer's name in the social features (docs/25): golden and shining for one who bought "I am just rich" — the
// leaderboards, Versus, friends, raids, trades, the Day Care's visitors and the trainer card. The gold is the `rich`
// token (4.5:1 on every surface, in both themes); the sparkle and the passing glint are decoration, still when motion
// is reduced. It stays inline, so a `truncate` around it still ends the name in "…".
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'

export function TrainerName({
  name,
  rich,
  className,
}: {
  name: string
  rich?: boolean | null
  className?: string
}) {
  if (!rich) return className ? <span className={className}>{name}</span> : <>{name}</>
  return (
    <span className={cx('rich-name', className)} data-rich="">
      <PixelIcon name="sparkle" size={12} className="rich-twinkle" />
      {name}
    </span>
  )
}

const MARK = '\u0001'

/**
 * A sentence with a trainer's name in it ("Misty's", "Misty took your Pidgey"): the translation's own words, with only
 * the name golden when it is (plain text otherwise). `text` builds the sentence around the name it's given.
 */
export function NameIn({
  name,
  rich,
  text,
}: {
  name: string
  rich?: boolean | null
  text: (name: string) => string
}) {
  if (!rich) return <>{text(name)}</>
  const [before = '', ...rest] = text(MARK).split(MARK)
  // A translation without the name in it: the sentence as it is.
  if (!rest.length) return <>{text(name)}</>
  return (
    <>
      {before}
      <TrainerName name={name} rich />
      {rest.join(name)}
    </>
  )
}
