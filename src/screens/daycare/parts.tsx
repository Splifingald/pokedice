// The Day Care page's pieces (docs/15, the Visual Lab's daycare.js), drawn from props so /kitchen-sink can show each
// state: the hearts, a slot's card, a friend's tile, an empty slot, the Egg card, the Egg-now bar and a hatchling's Box
// pick.
import type { ReactNode, Ref } from 'react'
import type { Hatch, RegionId } from '@/engine'
import { Chip } from '@/components/Chip'
import { EggSprite } from '@/components/EggSprite'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { LandingPick } from '@/components/trades/TradeBits'
import { MiniSprite, showdownView, SpriteImg } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { artBox } from '@/lib/showdown'
import { useShowdownDown } from '@/lib/showdownReach'
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
        'inline-flex items-center gap-1 px-1.5 pb-[3px] pt-0.5 font-pixel-sm text-[16px] not-italic leading-[1.1]',
        tone === 'ok' &&
          'bg-[#fff0f3] text-[#8a1f3d] shadow-[inset_0_0_0_1px_#ff9ab5] dark:bg-[#3a1822] dark:text-[#ffc2d1]',
        tone === 'slow' &&
          'bg-[#f4efff] text-[#4a3486] shadow-[inset_0_0_0_1px_#b9a6e8] dark:bg-[#2a2140] dark:text-[#d7c9ff]',
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

/** The card's sprite tile: its height, and how much of it the art may take (clear of the edges and the lip). */
const TILE = { h: 60, artH: 48, artW: 60 }

/**
 * The SpriteImg box that shows a Pokémon's art at ×1.17 on the tile, or smaller when that wouldn't fit (Lugia, Onix).
 * SpriteImg draws Showdown's art at `size / max(96, canvas)` per pixel, so the box follows from the scale wanted.
 */
function tileSpriteSize(dex: number, shiny?: boolean): number {
  const view = showdownView(dex, false, !!shiny)
  if (!view) return TILE.h + 8
  const [x0, y0, x1, y1] = artBox(view.box)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const scale = Math.min(112 / 96, TILE.artH / h, TILE.artW / w)
  return Math.round(scale * Math.max(96, view.box[0], view.box[1]))
}

/**
 * One of your Pokémon at the Day Care, in a two-column grid (docs/43 §5.7, compact): a 4 px band in its slot's colour,
 * the sprite on a pale tile beside whose it is, its name and level and a tag, then `children` (the XP bar, who it pairs
 * with) and its button at the bottom, so both cards' buttons line up.
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
  // Showdown down (src/lib/showdownReach.ts): the tile sizes the local sprite instead.
  useShowdownDown()
  return (
    <li className="relative flex min-w-0 flex-col gap-1.5 bg-paper px-2 pb-2 pt-2.5 shadow-card">
      <i aria-hidden className="absolute inset-x-[2px] top-[2px] block h-1" style={{ background: band }} />
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative block h-[60px] w-[60px] shrink-0 overflow-hidden bg-sky shadow-[inset_0_-5px_0_rgb(var(--c-sky-line))]">
          {/* Centred on the tile above its lip, whatever the box's size (a grid would start an oversized box at the top). */}
          <span className="absolute left-1/2 top-[calc(50%-2px)] -translate-x-1/2 -translate-y-1/2">
            <SpriteImg dex={dex} size={tileSpriteSize(dex, shiny)} shiny={shiny} />
          </span>
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex min-h-[18px] min-w-0 items-center gap-1 font-pixel-sm text-[16px] leading-none text-muted">
            {head}
          </span>
          <b className="text-[20px] font-normal leading-none [overflow-wrap:anywhere]">{name}</b>
          <span className="flex flex-wrap items-center gap-1 font-pixel-sm text-[16px] leading-none text-ink">
            {level}
            {tag}
          </span>
        </span>
      </span>
      {children}
      <PixelButton
        size="sm"
        className="mt-auto w-full px-1"
        aria-label={action.aria}
        onClick={action.onClick}
      >
        {action.label}
      </PixelButton>
    </li>
  )
}

/**
 * A friend's Pokémon visiting (docs/43 §5.7): one line, smaller than yours — the grey band, its sprite, its name and
 * level, whose it is and who of yours it pairs with — and Send back as a 44 px button at its end, one tap.
 */
export function GuestTile({
  dex,
  name,
  level,
  owner,
  mates,
  action,
}: {
  dex: number
  name: string
  level: string
  owner: ReactNode
  mates?: ReactNode
  action: { aria: string; onClick: () => void }
}) {
  const { t } = useT()
  return (
    <li className="relative flex min-h-[60px] min-w-0 items-center gap-2 bg-paper py-1.5 pl-3 pr-1.5 shadow-card">
      <i aria-hidden className="absolute inset-y-[2px] left-[2px] block w-1 bg-shadow" />
      <MiniSprite dex={dex} size={40} className="-my-1 shrink-0" />
      <span className="grid min-w-0 flex-1 gap-0.5 leading-none">
        <b className="truncate text-[18px] font-normal">
          {name} <small className="font-pixel-sm text-[16px] text-muted">{level}</small>
        </b>
        <span className="truncate font-pixel-sm text-[16px] text-ink">{owner}</span>
        {mates}
      </span>
      <button
        type="button"
        aria-label={action.aria}
        title={t('ui.dayCare.sendBack')}
        onClick={action.onClick}
        className="grid h-11 w-11 shrink-0 place-items-center bg-panel shadow-ring-line hover:shadow-ring"
      >
        <PixelIcon name="close" size={14} />
      </button>
    </li>
  )
}

/** The partners, each with its heart (the hearts say "pairs with"), or a short line when there are none. */
export function MatesLine({ lead, mates }: { lead?: string; mates?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-pixel-sm text-[16px] leading-[1.15] text-ink">
      {lead && <small className="text-[16px] text-muted">{lead}</small>}
      {mates}
    </span>
  )
}

/** The XP bar to the next level; `line` says it in words, for screen readers (the card shows the bar alone). */
export function XpBar({ k, line }: { k: number; line: string }) {
  return (
    <span className="relative block h-2 bg-line shadow-ring-thin" role="img" aria-label={line}>
      <i
        className="absolute inset-y-px left-px block bg-[#5b8def]"
        style={{ width: `calc(${Math.min(1, k) * 100}% - 2px)` }}
      />
    </span>
  )
}

/**
 * A free slot: a dashed card with a blue +, what it does. Disabled ones say why under it. `mini`: a friend's slot,
 * one line, the height of a friend's Pokémon.
 */
export function EmptySlot({
  title,
  sub,
  onClick,
  disabled,
  mini,
}: {
  title: string
  /** A disabled slot's reason (an enabled one needs none). */
  sub?: string
  onClick?: () => void
  disabled?: boolean
  mini?: boolean
}) {
  return (
    <li className="flex min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cx(
          'w-full flex-1 gap-1 px-2 outline-dashed outline-2 -outline-offset-[6px] outline-shadow',
          mini
            ? 'flex min-h-[60px] items-center py-1.5 text-left'
            : 'grid min-h-[150px] place-items-center content-center py-2.5 text-center',
          disabled
            ? 'cursor-not-allowed bg-well text-muted shadow-ring-line'
            : 'bg-well text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-faint))] hover:bg-paper',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'grid shrink-0 place-items-center leading-none text-white shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_#3c6cc8]',
            mini ? 'ml-1 mr-1 h-8 w-8 text-[22px]' : 'mb-1 h-9 w-9 text-[26px]',
            disabled ? 'bg-faint' : 'bg-[#5b8def]',
          )}
        >
          +
        </span>
        <span className={cx('grid min-w-0 gap-0.5', !mini && 'justify-items-center')}>
          <b className="text-[18px] font-normal leading-none">{title}</b>
          {sub && <small className="font-pixel-sm text-[16px] leading-[1.15] text-muted">{sub}</small>}
        </span>
      </button>
    </li>
  )
}

/** A section's title row: the title and its count ("2/2"), then the note under it. */
export function SectionHead({
  title,
  count,
  note,
  id,
}: {
  title: string
  count?: string
  note?: string
  id?: string
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="m-0 text-[24px] font-normal leading-none">
          {title}
        </h2>
        {count && <span className="font-pixel-sm text-[17px] tabular-nums text-muted">{count}</span>}
      </div>
      {note && <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{note}</p>}
    </div>
  )
}

/** The Egg waiting, in gold, where the Egg-now bar sits otherwise: who left it (or the gift), and Hatch it. */
export function EggCardView({ from, onHatch }: { from: string; onHatch: () => void }) {
  const { t } = useT()
  return (
    // One row, the Egg-now bar's height (docs/43 §5.7): the Egg, who left it, and Hatch it at the end.
    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] items-center gap-x-2.5 bg-gold-pale py-2 pl-2 pr-2.5 shadow-card-gold-lip">
      <span className="grid h-11 w-11 place-items-center">
        <EggSprite size={28} shake />
      </span>
      <span className="grid min-w-0 gap-[3px]">
        <b className="text-[22px] font-normal leading-none">{t('ui.dayCare.eggWaiting')}</b>
        <small className="font-pixel-sm text-[16px] leading-[1.15] text-ink">{from}</small>
      </span>
      <PixelButton variant="gold" className="min-h-[56px] max-w-[48vw] px-3" onClick={onHatch}>
        {t('ui.dayCare.hatchIt')}
      </PixelButton>
    </div>
  )
}

/**
 * The next check and Egg now: "in 7 h 14" in large type ("On hold" while no pair is here: no clock runs), how many
 * pairs could leave an Egg, and the gold button with the coin and its price. Disabled without a pair; short of ₽ the
 * price turns red and a tap says what's missing.
 */
export function RushBarView({
  wait,
  pairs,
  price,
  short,
  onRush,
  onShort,
}: {
  /** The time to the next check; null when none is coming (no pair). */
  wait: string | null
  pairs: number
  price: number
  short: number
  onRush: () => void
  onShort: () => void
}) {
  const { t, tPlural } = useT()
  return (
    <div className="flex items-center gap-2.5 bg-paper py-2 pl-3 pr-2.5 shadow-card">
      {/* Never narrower than the countdown, kept on one line: the button gives way first. */}
      <span className="grid flex-1 gap-px">
        <small className="font-pixel-sm text-[16px] leading-none text-muted">
          {t('ui.dayCare.nextCheck')}
        </small>
        <b className="whitespace-nowrap text-[24px] font-normal leading-none">
          {wait == null ? t('ui.dayCare.onHold') : t('ui.dayCare.inTime', { time: wait })}
        </b>
        <small className="font-pixel-sm text-[16px] leading-tight text-muted">
          {pairs ? tPlural('ui.dayCare.pairsCan', pairs, { n: pairs }) : t('ui.dayCare.noPairYet')}
        </small>
      </span>
      {/* At most a little over half the row, so the countdown and its line keep room (a long "Egg now", as in French,
          used to squeeze them into a column). The label and the price are sized in em: when the button is narrower
          than its label, PixelButton shrinks the two together. */}
      <PixelButton
        variant="gold"
        disabled={!pairs}
        aria-disabled={short > 0 || undefined}
        aria-label={t('ui.dayCare.eggNowLabel', { price: money(price) })}
        className="min-h-[56px] min-w-0 max-w-[55%] px-2.5"
        onClick={() => (short > 0 ? onShort() : onRush())}
      >
        <span className="grid justify-items-center gap-0.5">
          <span className="text-[0.8em] leading-none">{t('ui.dayCare.eggNow')}</span>
          {/* Short of ₽ the button is drawn unavailable (hatched, the theme's fill), so the theme's red. */}
          <span
            className={cx(
              'inline-flex items-center gap-1 font-pixel-sm text-[max(16px,0.625em)] leading-none',
              short > 0 && 'text-danger',
            )}
          >
            <PixelIcon name="coin" size={12} />
            {money(price)}
          </span>
        </span>
      </PixelButton>
    </div>
  )
}

/** The green tag on your card: levels gained here, or New. */
export const GainTag = ({ children }: { children: ReactNode }) => <Chip tone="done">{children}</Chip>

/** What the Box pick reads of a hatchling's arrival in one Box (a `Hatch`, or a made-up one on /kitchen-sink). */
export type HatchRow = Pick<Hatch, 'region' | 'shiny' | 'kept' | 'isNew' | 'strongest'> & {
  inst: { level: number }
  replaced?: { level: number }
}

/** A hatchling's arrival in one Box, as the Box pick's row says it (`LandingPick`, shared with trades). */
const hatchLanding = (h: HatchRow) => ({
  region: h.region,
  outcome: h.shiny
    ? ('shiny' as const)
    : !h.kept
      ? ('merged' as const)
      : h.replaced
        ? ('replaced' as const)
        : ('new' as const),
  isNew: h.isNew,
  mine: h.replaced?.level ?? h.strongest ?? null,
  // Never `locked`: a hatchling arrives at that Box's own level.
  best: h.inst.level,
  level: h.inst.level,
})

/**
 * The Box pick of a hatchling more than one discovered region's Pokédex lists (docs/15): the note, a row per region
 * (the level it arrives at there, and what happens: it joins, NEW, STRONGER, nothing gained) and SEND IT THERE.
 */
export function HatchBoxPick({
  name,
  choices,
  value,
  onChange,
  onSend,
  sendRef,
}: {
  name: string
  choices: HatchRow[]
  value: RegionId | null
  onChange: (region: RegionId) => void
  onSend: () => void
  sendRef?: Ref<HTMLButtonElement>
}) {
  const { t } = useT()
  const level = choices.find((c) => c.region === value)?.inst.level ?? choices[0]?.inst.level ?? 1
  return (
    <>
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
        {t('ui.trades.land.note', { name })}
      </p>
      <LandingPick
        name={name}
        level={level}
        options={choices.map(hatchLanding)}
        value={value}
        onChange={onChange}
      />
      <PixelButton ref={sendRef} variant="primary" className="w-full" disabled={!value} onClick={onSend}>
        {t('ui.trades.land.send')}
      </PixelButton>
    </>
  )
}
