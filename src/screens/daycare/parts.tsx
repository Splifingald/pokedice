// The Day Care page's pieces (docs/15, the Visual Lab's daycare.js), drawn from props so /kitchen-sink can show each
// state: the hearts, a slot's card, an empty slot, the Egg card and the Egg-now bar.
import type { ReactNode } from 'react'
import { Chip } from '@/components/Chip'
import { EggSprite } from '@/components/EggSprite'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { cx } from '@/theme/util'

/** Your first and second Pokémon each have a colour: a heart in it means "can make an Egg with it". */
export const SLOT_COLORS = ['#ff5a7a', '#5b8def'] as const
export const slotColor = (slot: number) => SLOT_COLORS[slot % SLOT_COLORS.length]!

const HEART = ['.k.k.', 'kakak', 'kaaak', '.kak.', '..k..']

/** A 5×5 pixel heart in a slot's colour. Decorative: the names next to it say who. */
export function Heart({ color, size = 10, className }: { color: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      aria-hidden
      className={cx('shrink-0', className)}
    >
      {HEART.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === 'k' ? '#24304f' : color} />
          ),
        ),
      )}
    </svg>
  )
}

/** "Compatible with …": pink on yours, grey when nothing pairs, purple for Ditto's slower clock. */
export function PairTag({ tone = 'ok', children }: { tone?: 'ok' | 'plain' | 'slow'; children: ReactNode }) {
  return (
    <em
      className={cx(
        'inline-flex items-center gap-1 px-1.5 pb-[3px] pt-0.5 font-pixel-sm text-[13px] not-italic leading-[1.1]',
        tone === 'ok' && 'bg-[#fff0f3] text-[#8a1f3d] shadow-[inset_0_0_0_1px_#ff9ab5] dark:bg-[#3a1822] dark:text-[#ffc2d1]',
        tone === 'slow' && 'bg-[#f4efff] text-[#4a3486] shadow-[inset_0_0_0_1px_#b9a6e8] dark:bg-[#2a2140] dark:text-[#d7c9ff]',
        tone === 'plain' && 'bg-well text-ink shadow-ring-line-thin',
      )}
    >
      {children}
    </em>
  )
}

/** A Pokémon's name with the heart of the slot it is in (yours), as "Pairs with" lists them. */
export function Mate({ name, slot }: { name: string; slot: number | null }) {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {slot != null && <Heart color={slotColor(slot)} />}
      {name}
    </span>
  )
}

/**
 * One Pokémon at the Day Care, in a two-column grid: a 4 px band in its slot's colour (grey for a friend's), the head
 * (whose it is, and a tag), the animated sprite on a pale tile, the name and level, `children` (the XP bar, who it
 * pairs with) and its button at the bottom, so both cards' buttons line up.
 */
export function SlotCard({
  band,
  head,
  tag,
  dex,
  shiny,
  name,
  level,
  children,
  action,
}: {
  band: string
  head: ReactNode
  tag?: ReactNode
  dex: number
  shiny?: boolean
  name: string
  level: string
  children?: ReactNode
  action: { label: string; aria: string; onClick: () => void }
}) {
  return (
    <li className="relative flex min-w-0 flex-col gap-1 bg-paper px-2 pb-2 pt-2.5 shadow-card">
      <i aria-hidden className="absolute inset-x-[2px] top-[2px] block h-1" style={{ background: band }} />
      <span className="flex min-h-[22px] items-center gap-1 font-pixel-sm text-[15px] leading-none text-muted">
        {head}
        {tag && <span className="ml-auto">{tag}</span>}
      </span>
      <span className="grid h-[76px] place-items-center overflow-hidden bg-sky shadow-[inset_0_-6px_0_rgb(var(--c-sky-line))]">
        {/* A bigger box than the tile: Showdown's art scales with it (×1.17), centred, the tile clipping any excess. */}
        <SpriteImg dex={dex} size={112} shiny={shiny} />
      </span>
      <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <b className="text-[20px] font-normal leading-none [overflow-wrap:anywhere]">{name}</b>
        <span className="font-pixel-sm text-[15px] leading-none text-muted">{level}</span>
      </span>
      {children}
      <PixelButton size="sm" className="mt-auto w-full px-1" aria-label={action.aria} onClick={action.onClick}>
        {action.label}
      </PixelButton>
    </li>
  )
}

/** "Pairs with" and the partners, or the line that says why there are none. */
export function MatesLine({ lead, mates }: { lead: string; mates?: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-pixel-sm text-[14px] leading-[1.15] text-ink">
      <small className="w-full text-[13px] text-muted">{lead}</small>
      {mates}
    </span>
  )
}

/** The XP bar to the next level, and the line under it. */
export function XpBar({ k, line }: { k: number; line: string }) {
  return (
    <>
      <span className="relative block h-2 bg-line shadow-ring-thin" role="img" aria-label={line}>
        <i className="absolute inset-y-px left-px block bg-[#5b8def]" style={{ width: `calc(${Math.min(1, k) * 100}% - 2px)` }} />
      </span>
      <small className="font-pixel-sm text-[13px] leading-[1.15] text-muted">{line}</small>
    </>
  )
}

/** A free slot: a dashed card with a blue +, what it does and where from. Disabled ones say why under it. */
export function EmptySlot({
  title,
  sub,
  onClick,
  disabled,
}: {
  title: string
  sub: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <li className="flex min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cx(
          'grid min-h-[168px] w-full flex-1 place-items-center content-center gap-1 px-2 py-2.5 text-center outline-dashed outline-2 -outline-offset-[6px] outline-shadow',
          disabled
            ? 'cursor-not-allowed bg-well text-muted shadow-ring-line'
            : 'bg-well text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-faint))] hover:bg-paper',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'mb-1 grid h-9 w-9 place-items-center text-[26px] leading-none text-white shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_#3c6cc8]',
            disabled ? 'bg-faint' : 'bg-[#5b8def]',
          )}
        >
          +
        </span>
        <b className="text-[18px] font-normal leading-none">{title}</b>
        <small className="font-pixel-sm text-[13px] leading-[1.15] text-muted">{sub}</small>
      </button>
    </li>
  )
}

/** A section's title row: the title and its count ("2/2"), then the note under it. */
export function SectionHead({ title, count, note, id }: { title: string; count?: string; note?: string; id?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="m-0 text-[24px] font-normal leading-none">
          {title}
        </h2>
        {count && <span className="font-pixel-sm text-[17px] tabular-nums text-muted">{count}</span>}
      </div>
      {note && <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">{note}</p>}
    </div>
  )
}

/** The Egg waiting, in gold, where the Egg-now bar sits otherwise: who left it (or the gift), and Hatch it. */
export function EggCardView({ from, onHatch }: { from: string; onHatch: () => void }) {
  const { t } = useT()
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 bg-gold-pale px-3 pb-3 pt-2.5 shadow-card-gold-lip">
      <span className="grid h-12 w-12 place-items-center">
        <EggSprite size={28} shake />
      </span>
      <span className="grid min-w-0 gap-[3px]">
        <b className="text-[22px] font-normal leading-none">{t('ui.dayCare.eggWaiting')}</b>
        <small className="font-pixel-sm text-[15px] leading-[1.15] text-ink">
          {from} {t('ui.dayCare.eggHatchesInto')}
        </small>
      </span>
      <PixelButton variant="gold" className="col-span-2 w-full" onClick={onHatch}>
        {t('ui.dayCare.hatchIt')}
      </PixelButton>
    </div>
  )
}

/**
 * The next check and Egg now: "in 7 h 14" in large type, how many pairs could leave an Egg, and the gold button with
 * the coin and its price. Disabled without a pair; short of ₽ the price turns red and a tap says what's missing.
 */
export function RushBarView({
  wait,
  pairs,
  price,
  short,
  onRush,
  onShort,
}: {
  wait: string
  pairs: number
  price: number
  short: number
  onRush: () => void
  onShort: () => void
}) {
  const { t, tPlural } = useT()
  return (
    <div className="flex items-center gap-2.5 bg-paper py-2 pl-3 pr-2.5 shadow-card">
      <span className="grid min-w-0 flex-1 gap-px">
        <small className="font-pixel-sm text-[14px] leading-none text-muted">{t('ui.dayCare.nextCheck')}</small>
        <b className="text-[24px] font-normal leading-none">{t('ui.dayCare.inTime', { time: wait })}</b>
        <small className="font-pixel-sm text-[14px] leading-tight text-muted">
          {pairs ? tPlural('ui.dayCare.pairsCan', pairs, { n: pairs }) : t('ui.dayCare.noPairYet')}
        </small>
      </span>
      <PixelButton
        variant="gold"
        disabled={!pairs}
        aria-disabled={short > 0 || undefined}
        aria-label={t('ui.dayCare.eggNowLabel', { price: money(price) })}
        className="grid min-h-[56px] shrink-0 justify-items-center gap-0.5 px-3.5"
        onClick={() => (short > 0 ? onShort() : onRush())}
      >
        <span className="text-[19px] leading-none">{t('ui.dayCare.eggNow')}</span>
        {/* The button stays gold in both themes, so the "short" red is a fixed one that reads on gold. */}
        <span className={cx('inline-flex items-center gap-1 font-pixel-sm text-[15px] leading-none', short > 0 && 'text-[#9b2416]')}>
          <PixelIcon name="coin" size={12} />
          {money(price)}
        </span>
      </PixelButton>
    </div>
  )
}

/** The green tag on your card: levels gained here, or New. */
export const GainTag = ({ children }: { children: ReactNode }) => <Chip tone="done">{children}</Chip>
