// One item, one design (docs/43 §4): the Mart's shelf, the Bag, a live event's Special Shop, the Underground's
// Explorakits, a small world's Mart and the Mega Gems all draw their items with `ItemTile`, and open them in
// `ItemDetail` (a sheet on phones, docked beside the shelf on PC through SplitView).
import { useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'
import { CoinFlight, HUD_GOLD_ATTR } from './CoinFlight'
import { PixelIcon } from './icons'
import { CloseButton } from './Modal'
import { PixelButton } from './PixelButton'
import { Sheet, SheetDock } from './Sheet'

/** The shelf's grid: three to a row on a phone (a 360 px one included), four from a tablet. */
export const TILE_GRID = 'grid grid-cols-3 gap-1.5 md:grid-cols-4 md:gap-2'

/**
 * A purchase is felt (docs/43 §2, "every outcome is felt"): coins leave the top bar's gold for the tile (never when
 * calm or with animations off) and the tile's count hops. `flight` changes on each purchase.
 */
function useFlight(flight: number | undefined, tile: RefObject<HTMLElement | null>) {
  const { level, calm } = useMotion()
  const [shown, setShown] = useState(0)
  const first = useRef(flight)
  const hud = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (flight == null || flight === first.current) return
    if (calm || level === 'off') return
    hud.current = document.querySelector<HTMLElement>(`[${HUD_GOLD_ATTR}]`)
    setShown(flight)
  }, [flight, calm, level])
  return shown ? <CoinFlight key={shown} from={hud} to={tile} coins={4} onLanded={() => setShown(0)} /> : null
}

/** The count in the tile's corner: it hops (in steps) when it goes up, unless animations are off. */
function HeldTag({ held }: { held: number }) {
  const { level } = useMotion()
  const last = useRef(held)
  const [hop, setHop] = useState(0)
  useEffect(() => {
    if (held > last.current && level !== 'off') setHop((n) => n + 1)
    last.current = held
  }, [held, level])
  if (held <= 0) return null
  return (
    <span
      key={hop}
      className={cx(
        'light-scope absolute right-1 top-1 bg-night px-1 pb-[3px] pt-px font-pixel-sm text-[16px] leading-none text-gold-light tabular-nums',
        hop > 0 && 'gold-bump',
      )}
    >
      ×{held}
    </span>
  )
}

export function ItemTile({
  id,
  name,
  picture,
  sub,
  tags,
  held = 0,
  action,
  open,
  onOpen,
  locked,
  disabled,
  flight,
}: {
  /** `data-item-tile`, for tests and the tour. */
  id: string
  name: string
  picture: ReactNode
  /** What it does, in one or two short lines. */
  sub?: ReactNode
  /** Chips under it (a sale, never sold, what's left of a limit). */
  tags?: ReactNode
  held?: number
  /** The foot: a `PriceButton` (the purchase itself) or a `PricePlate`. */
  action?: ReactNode
  open?: boolean
  /** Opens its details (×5, ×10, what it does); none for a tile with nothing more to show. */
  onOpen?: () => void
  /** Greyed: not sold yet (the "Coming later" fold). */
  locked?: boolean
  /** Nothing more to open (sold out, held): still a button, disabled, so it says so. */
  disabled?: boolean
  flight?: number
}) {
  const ref = useRef<HTMLLIElement>(null)
  const coins = useFlight(flight, ref)
  const Head = onOpen || disabled ? 'button' : 'div'
  return (
    <li
      ref={ref}
      data-item-tile={id}
      className={cx(
        'relative flex min-w-0 flex-col',
        // The open one is outlined and warm, as a picked card is (never colour alone: its details are open beside it).
        locked
          ? 'bg-well text-ink shadow-ring-line'
          : open
            ? 'bg-cream shadow-[inset_0_0_0_3px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-gold-light))]'
            : 'bg-paper shadow-card',
      )}
    >
      <Head
        {...(onOpen
          ? { type: 'button' as const, onClick: onOpen, 'data-open': '', 'aria-expanded': !!open }
          : disabled
            ? { type: 'button' as const, disabled: true }
            : {})}
        className={cx(
          'flex min-h-[44px] w-full flex-1 flex-col items-center gap-0.5 px-1 pb-1 pt-2 text-center',
          onOpen && 'hover:bg-sky/60',
        )}
      >
        <span className={cx('grid h-11 w-11 place-items-center', locked && 'opacity-55 grayscale')}>
          {picture}
        </span>
        <b className="line-clamp-2 w-full text-[18px] font-normal leading-[1.05] [overflow-wrap:anywhere]">
          {name}
        </b>
        {sub && (
          <small className="line-clamp-2 w-full font-pixel-sm text-[16px] leading-[1.1] text-muted">
            {sub}
          </small>
        )}
        {tags && <span className="flex flex-wrap justify-center gap-1">{tags}</span>}
        <HeldTag held={held} />
      </Head>
      {action && <div className="px-1 pb-1">{action}</div>}
      {coins}
    </li>
  )
}

/**
 * The purchase itself (docs/43 §2: a price is a purchase, one tap): the coin and the price. Short of ₽ it stays
 * focusable, greyed, and a tap says what's missing. `best` is gold (Upgrades' best buy).
 */
export function PriceButton({
  price,
  can,
  label,
  onBuy,
  onShort,
  struck,
  className,
}: {
  price: number
  can: boolean
  /** Its screen-reader name ("Buy one Poké Ball, ₽20"). */
  label: string
  onBuy: () => void
  onShort: () => void
  /** The usual price, struck out (a sale). */
  struck?: number
  className?: string
}) {
  return (
    <button
      type="button"
      aria-disabled={!can || undefined}
      aria-label={label}
      onClick={() => (can ? onBuy() : onShort())}
      className={cx(
        'flex min-h-[44px] w-full items-center justify-center gap-1 px-1 pb-1 pt-0.5 text-[20px] leading-none active:translate-y-[2px] md:min-h-[40px]',
        can
          ? 'light-scope bg-night text-gold-light shadow-[inset_0_-3px_0_rgb(0_0_0/0.35)] hover:bg-ink'
          : 'bg-well-deep text-ink',
        className,
      )}
    >
      <PixelIcon name="coin" size={12} className={cx('shrink-0', !can && 'opacity-60')} />
      {struck != null && <s className="font-pixel-sm text-[16px] opacity-70">{money(struck)}</s>}
      <span className="tabular-nums">{money(price)}</span>
    </button>
  )
}

/** A tile's foot that isn't a purchase: sold out, held, what a sale brings, what it waits for. */
export function PricePlate({
  children,
  tone = 'plain',
}: {
  children: ReactNode
  tone?: 'plain' | 'sell' | 'dark'
}) {
  return (
    <span
      className={cx(
        'flex min-h-[40px] w-full items-center justify-center gap-1 px-1 pb-1 pt-0.5 text-center text-[18px] leading-none',
        tone === 'sell' && 'bg-forest text-white',
        tone === 'dark' && 'light-scope bg-night text-gold-light',
        tone === 'plain' && 'bg-well-deep text-ink',
      )}
    >
      {children}
    </span>
  )
}

/**
 * An item opened: its picture, what it does, its description, how many you hold, and at the foot (in the thumb's
 * reach) the purchases themselves — ×1, ×5, ×10 each a button with its total, so choosing how many is buying them (one
 * tap, docs/43 §2). A `Sheet`: from the bottom on phones, docked in SplitView's pane on PC (where it gets its own ✕,
 * the pane having none).
 */
export function ItemDetail({
  title,
  picture,
  effect,
  description,
  held,
  note,
  tags,
  actions,
  onClose,
}: {
  title: string
  picture: ReactNode
  effect?: ReactNode
  description?: string | null
  held: number
  note?: ReactNode
  tags?: ReactNode
  /** The footer: `QtyButton`s, or one `DetailButton`. */
  actions: ReactNode
  onClose: () => void
}) {
  const { t } = useT()
  const docked = useContext(SheetDock)
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      titleExtra={docked ? <CloseButton onClick={onClose} className="ml-auto" /> : undefined}
      footer={actions}
    >
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-center gap-3">
          <span className="grid h-[72px] w-[72px] shrink-0 place-items-center bg-well shadow-ring-line">
            {picture}
          </span>
          <div className="grid min-w-0 gap-1">
            {effect && <p className="m-0 text-[20px] leading-tight">{effect}</p>}
            {tags && <span className="flex flex-wrap gap-1">{tags}</span>}
            <p className="m-0 font-pixel-sm text-[18px] text-ink">{t('ui.item.inBag', { n: held })}</p>
          </div>
        </div>
        {description && <p className="copy m-0 text-[18px] text-muted">{description}</p>}
        {note && <div className="font-pixel-sm text-[18px] leading-tight text-ink">{note}</div>}
      </div>
    </Sheet>
  )
}

/** The quantities side by side, each its own purchase (or sale). */
export function QtyRow({ children }: { children: ReactNode }) {
  return <div className="grid auto-cols-fr grid-flow-col gap-2">{children}</div>
}

/**
 * One quantity and its total, as a button: "×5" over "₽100". Navy to buy, green to sell; short of ₽ it stays
 * focusable, greyed, saying what's missing, and a tap says it in a toast.
 */
export function QtyButton({
  qty,
  total,
  mode,
  can,
  short,
  label,
  onClick,
}: {
  qty: string
  total: number
  mode: 'buy' | 'sell'
  can: boolean
  /** What's missing, in words ("need ₽40"), shown in place of the total when it can't be bought. */
  short?: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={!can || undefined}
      onClick={onClick}
      className={cx(
        'grid min-h-[56px] min-w-0 place-items-center content-center gap-1 px-1 pb-2 pt-1 leading-none',
        !can
          ? 'bg-well-deep text-ink shadow-ring-line'
          : mode === 'sell'
            ? 'pixel-btn frame-green text-white'
            : 'pixel-btn frame-dark',
      )}
    >
      <b className="text-[22px] font-normal">{qty}</b>
      <small className="font-pixel-sm text-[16px] tabular-nums">{can || !short ? money(total) : short}</small>
    </button>
  )
}

/** One button for the detail (one choice only, a limit of one): buy (red) or sell (green), the total in its label. */
export function DetailButton({
  mode,
  can,
  label,
  aria,
  onClick,
}: {
  mode: 'buy' | 'sell'
  can: boolean
  label: string
  /** Its name, when the label alone doesn't say what (a sale's count and item). */
  aria?: string
  onClick: () => void
}) {
  return (
    <PixelButton
      variant={mode === 'sell' ? 'success' : can ? 'primary' : 'secondary'}
      className="min-h-[50px] w-full"
      aria-label={aria}
      aria-disabled={!can || undefined}
      onClick={onClick}
    >
      {label}
    </PixelButton>
  )
}
