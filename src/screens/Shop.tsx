import { useState, type ReactNode } from 'react'
import {
  badgeCase,
  gemRulesOn,
  gemShelf,
  isAreaUnlocked,
  isGem,
  kitPrice,
  kitsHeld,
  kitsLeftToBuy,
  liveLeft,
  liveShopRows,
  ownedGems,
  powerEarned,
  regionOf,
  sellPrice,
  shopStock,
  ugCfg,
  worldLeft,
  worldShopRows,
  type GemShelfRow,
  type ItemDef,
  type LiveEvent,
} from '@/engine'
import { effectText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { sfx } from '@/audio/sfx'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelIcon } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { FilterChips, Seg } from '@/components/Segmented'
import { money } from '@/lib/format'
import { buy, buyGem, sell } from '@/store/actions'
import { MiniSprite } from '@/components/SpriteImg'
import { PowerInfo } from '@/components/PowersRules'
import { buyLive, useLive } from '@/store/live'
import { Chip } from '@/components/Chip'
import { LiveBadge, LiveGauge, LivePicture, liveName, liveTime } from '@/screens/events/live'
import { bannerUrl } from '@/screens/events/shared'
import { useInWorld, worldVars, WorldTag } from '@/screens/events/world'
import { useServerNow } from '@/store/serverTime'
import { buyWorld, worldName } from '@/store/worlds'
import { pushToast, useGame } from '@/store/game'
import { ugBuyKits, useUnderground } from '@/store/underground'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { affordableUpgrades } from '@/lib/upgrades'
import { UpgradesPanel } from './Upgrades'
import { cx } from '@/theme/util'

type Kind = ItemDef['effect']['kind']
type GroupId = 'ball' | 'heal' | 'battle' | 'cure' | 'stone' | 'fossil' | 'gem'

/**
 * The Mart's categories, Balls first. Both tabs list items by group, so an item whose effect kind is in no group would
 * silently vanish the moment it unlocked. Every kind of `ItemEffect` must appear here; `groupOf` and its test are what
 * keep that true as kinds are added.
 */
const GROUPS: { id: GroupId; chip: string; title: string; kinds: Kind[] }[] = [
  { id: 'ball', chip: 'ui.shop.catBalls', title: 'ui.shop.groupCatch', kinds: ['ball', 'bait'] },
  { id: 'heal', chip: 'ui.shop.groupHealing', title: 'ui.shop.groupHealing', kinds: ['heal', 'revive'] },
  { id: 'battle', chip: 'ui.shop.groupBattle', title: 'ui.shop.groupBattle', kinds: ['rerolls', 'level'] },
  { id: 'cure', chip: 'ui.shop.groupCures', title: 'ui.shop.groupCures', kinds: ['cure'] },
  { id: 'stone', chip: 'ui.shop.groupEvolution', title: 'ui.shop.groupEvolution', kinds: ['stone', 'link'] },
  { id: 'fossil', chip: 'ui.shop.groupFossils', title: 'ui.shop.groupFossils', kinds: ['fossil'] },
  // Mega Gems have a shelf of their own (GemShelf), never the Mart's stock; the bag lists the ones held.
  { id: 'gem', chip: 'ui.shop.groupGems', title: 'ui.shop.groupGems', kinds: ['megaGem'] },
]

/** The group an item is listed under (its title key), or null when no group claims its kind. */
export const groupOf = (kind: Kind): string | null =>
  GROUPS.find((g) => g.kinds.includes(kind))?.title ?? null
const groupIndex = (it: ItemDef) => GROUPS.findIndex((g) => g.kinds.includes(it.effect.kind))

type Cat = GroupId | 'all'

/** The category chips: All, then each group that has something on this tab. */
function CatChips({ items, value, onChange }: { items: ItemDef[]; value: Cat; onChange: (c: Cat) => void }) {
  const { t } = useT()
  const present = GROUPS.filter((g) => items.some((it) => g.kinds.includes(it.effect.kind)))
  if (present.length < 2) return null
  return (
    <FilterChips
      label={t('ui.shop.category')}
      value={value}
      onChange={onChange}
      options={[
        { id: 'all', label: t('ui.shop.catAll') },
        ...present.map((g) => ({ id: g.id, label: t(g.chip) })),
      ]}
    />
  )
}

const inCat = (cat: Cat) => (it: ItemDef) =>
  cat === 'all' || GROUPS.find((g) => g.id === cat)!.kinds.includes(it.effect.kind)

/**
 * A shelf tile (two to a row on phones, three on wider screens): the item, what it does, how many you hold and its
 * price; tapping opens the quantity picker, and the open tile takes the whole row so the picker keeps its room.
 */
function Row({
  it,
  open,
  onToggle,
  side,
  sub,
  pill,
  owned,
  children,
}: {
  it: ItemDef
  open: boolean
  onToggle?: () => void
  side: 'buy' | 'sell' | 'live'
  sub: ReactNode
  /** The price plate at the end of the row. */
  pill?: ReactNode
  owned: number
  children?: ReactNode
}) {
  const id = `${side}-${it.key}`
  return (
    <li
      className={cx(
        'flex flex-col',
        open
          ? 'col-span-full bg-cream shadow-[inset_0_0_0_3px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-gold-light))]'
          : 'bg-paper shadow-card',
      )}
    >
      {/* Two targets (docs/43 §5.5): the tile opens its details (×5, ×10, what it does), and its price, when it is a
          button, is the purchase itself — one tap, never a pick then a BUY. */}
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        aria-expanded={onToggle ? open : undefined}
        aria-controls={onToggle && open ? id : undefined}
        className="flex min-h-[54px] w-full flex-1 flex-col gap-1 px-2 pt-2 text-left"
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <ItemSprite item={it} size={32} />
          <b className="line-clamp-2 min-w-0 flex-1 text-[20px] font-normal leading-[1.05]">{it.name}</b>
        </span>
        <small className="flex flex-wrap items-center gap-1 font-pixel-sm text-[17px] leading-tight text-muted">{sub}</small>
      </button>
      <span className="flex w-full items-end justify-between gap-1 px-2 pb-[10px] pt-1">
        <em className="font-pixel-sm text-[17px] not-italic text-muted">{owned > 0 ? `×${owned}` : ''}</em>
        {pill}
      </span>
      {open && children && (
        <div id={id} className="grid gap-2 px-2.5 pb-3">
          {children}
        </div>
      )}
    </li>
  )
}

/** Every Special Shop running (docs/20), a section each, the earliest started first. */
function LiveShopSections() {
  const { lives, now } = useLive(1000)
  if (now == null) return null
  return (
    <>
      {lives
        .filter((e) => e.type === 'shop')
        .map((e) => (
          <LiveShopSection key={e.id} live={e} now={now} />
        ))}
    </>
  )
}

/**
 * A live event's Special Shop (docs/20), over the Mart's own shelves: its picture, the time left, then its items — at
 * their event price (the usual one struck out), the ones the Mart never sells, and what's left of each player's limit.
 */
function LiveShopSection({ live, now }: { live: LiveEvent; now: number }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState<string | null>(null)
  const [qty, setQty] = useState<'1' | '5' | '10'>('1')
  if (!save) return null
  const rows = liveShopRows(save, data, live)
  if (!rows.length) return null
  const left = liveLeft(live, now)
  const headId = `live-shop-${live.id}`
  return (
    <section aria-labelledby={headId} className="lv-shop flex flex-col gap-2 pb-2.5">
      <header className="lv-shop-head relative isolate grid min-h-[92px] content-end gap-1.5 overflow-hidden px-3 pb-3 pt-2.5">
        <LivePicture e={live} className="absolute inset-0 -z-10" />
        <span className="flex min-w-0 items-center gap-2">
          <LiveBadge />
          <h2 id={headId} className="lv-ink m-0 min-w-0 truncate text-[28px] leading-none">
            {liveName(live)}
          </h2>
        </span>
        <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 font-pixel-sm text-[16px] leading-none">
          <span className="lv-ink text-gold-light">{t('ui.live.endsIn', { time: liveTime(left.ms) })}</span>
          <LiveGauge share={left.share} hot={left.ms < 3 * 3_600_000} />
        </span>
      </header>
      <ul className="grid grid-cols-2 gap-1.5 px-2 md:grid-cols-3">
        {rows.map((r) => {
          const out = r.left === 0
          const sale = r.usual != null && r.price < r.usual
          const steps = (['1', '5', '10'] as const).filter((q) => r.left == null || Number(q) <= r.left)
          const n = Math.min(Number(qty), r.left ?? Infinity)
          const total = r.price * n
          const can = total <= save.gold
          return (
            <Row
              key={r.item.key}
              it={r.item}
              side="live"
              open={open === r.item.key && !out}
              onToggle={
                out
                  ? undefined
                  : () => {
                      setOpen(open === r.item.key ? null : r.item.key)
                      setQty('1')
                    }
              }
              sub={
                <>
                  {r.usual == null ? (
                    <Chip tone="dark">{t('ui.live.shop.never')}</Chip>
                  ) : (
                    sale && <Chip tone="red">{t('ui.live.shop.off', { pct: Math.round((1 - r.price / r.usual) * 100) })}</Chip>
                  )}
                  <span className={cx(r.left != null && r.left <= 2 && 'text-danger')}>
                    {r.limit == null
                      ? t('ui.live.shop.noLimit')
                      : out
                        ? t('ui.live.shop.soldOut')
                        : t('ui.live.shop.left', { left: r.left!, limit: r.limit })}
                  </span>
                </>
              }
              pill={
                <span
                  className={cx(
                    'grid min-w-[62px] justify-items-center gap-0.5 px-2 pb-2 pt-1.5 text-center text-[18px] leading-none',
                    out || r.price > save.gold ? 'bg-well-deep text-ink' : 'light-scope bg-night text-gold-light',
                  )}
                >
                  {sale && !out && (
                    <s className="text-[16px] opacity-70" aria-label={t('ui.live.shop.usually', { price: money(r.usual!) })}>
                      {money(r.usual!)}
                    </s>
                  )}
                  {out ? t('ui.live.shop.soldOut') : money(r.price)}
                </span>
              }
              owned={save.inventory[r.item.key] ?? 0}
            >
              {r.item.description && (
                <p className="copy font-pixel-sm text-[16px] leading-tight text-muted">{r.item.description}</p>
              )}
              <div className="flex items-center gap-2">
                {steps.length > 1 ? (
                  <Seg
                    label={t('ui.shop.howMany', { item: r.item.name })}
                    value={steps.includes(qty) ? qty : '1'}
                    onChange={setQty}
                    options={steps.map((q) => ({ id: q, label: `×${q}` }))}
                  />
                ) : (
                  <span className="font-pixel-sm text-[16px] text-muted">{t('ui.live.shop.onePer')}</span>
                )}
                <PixelButton
                  variant={can ? 'primary' : 'secondary'}
                  className="min-h-[50px] flex-1"
                  disabled={!can}
                  onClick={() => {
                    if (!buyLive(live.id, r.item.key, n)) return
                    sfx('gold')
                    if (r.left != null && r.left - n <= 0) setOpen(null)
                    pushToast(t('ui.shop.bought', { n, item: r.item.name, left: money(useGame.getState().save?.gold ?? 0) }), 'good')
                  }}
                >
                  {can ? t('ui.shop.buyFor', { price: money(total) }) : t('ui.shop.needMore', { price: money(total - save.gold) })}
                </PixelButton>
              </div>
            </Row>
          )
        })}
      </ul>
      <p className="m-0 px-3 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.live.shop.note')}</p>
    </section>
  )
}

/**
 * The Underground's Explorakits (docs/34), over the Mart's shelves while it runs: its cave, the time left, the kit at
 * its price, what's left of the player's limit. Never in a small world's Mart (the event doesn't reach one).
 */
function UgKitSection() {
  const { t } = useT()
  const navigate = useNavigate()
  const { live, now, u } = useUnderground(1000)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [qty, setQty] = useState<'1' | '5' | '10'>('1')
  if (!live || !u || !save || now == null) return null
  const cfg = ugCfg(data)
  const price = kitPrice(cfg)
  const room = kitsLeftToBuy(u, cfg)
  const limit = cfg.kits.limit
  const steps = (['1', '5', '10'] as const).filter((q) => room == null || Number(q) <= room)
  const n = Math.min(Number(steps.includes(qty) ? qty : '1'), room ?? Infinity)
  const total = price * n
  const can = room !== 0 && total <= save.gold
  const left = liveLeft(live, now)
  return (
    <section aria-labelledby="ug-shop" className="lv-shop flex flex-col gap-2 pb-2.5" data-testid="ug-shop">
      <header className="lv-shop-head relative isolate grid min-h-[92px] content-end gap-1.5 overflow-hidden px-3 pb-3 pt-2.5">
        <LivePicture e={live} className="absolute inset-0 -z-10" />
        <span className="flex min-w-0 items-center gap-2">
          <LiveBadge />
          <h2 id="ug-shop" className="lv-ink m-0 min-w-0 truncate text-[28px] leading-none">
            {liveName(live)}
          </h2>
        </span>
        <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 font-pixel-sm text-[16px] leading-none">
          <span className="lv-ink text-gold-light">{t('ui.live.endsIn', { time: liveTime(left.ms) })}</span>
          <LiveGauge share={left.share} hot={left.ms < 3 * 3_600_000} />
        </span>
      </header>
      <div className="mx-2 flex flex-col gap-2 bg-cream p-2.5 shadow-[inset_0_0_0_3px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-gold-light))]">
        <div className="flex items-center gap-2.5">
          <PixelIcon name="kit" size={36} />
          <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
            <b className="text-[20px] font-normal leading-none">{t('ui.ug.kit')}</b>
            <small className="font-pixel-sm text-[16px] text-muted">{t('ui.ug.kitDesc')}</small>
          </span>
          <span className="light-scope bg-night px-2 pb-2 pt-1.5 text-[18px] leading-none text-gold-light">{money(price)}</span>
        </div>
        <span className={cx('font-pixel-sm text-[16px]', room != null && room <= 2 ? 'text-danger' : 'text-muted')}>
          {t('ui.ug.held', { n: kitsHeld(u) })} ·{' '}
          {room == null ? t('ui.live.shop.noLimit') : room === 0 ? t('ui.live.shop.soldOut') : t('ui.live.shop.left', { left: room, limit })}
        </span>
        {room !== 0 && (
          <div className="flex items-center gap-2">
            {steps.length > 1 && (
              <Seg
                label={t('ui.shop.howMany', { item: t('ui.ug.kit') })}
                value={steps.includes(qty) ? qty : '1'}
                onChange={setQty}
                options={steps.map((q) => ({ id: q, label: `×${q}` }))}
              />
            )}
            <PixelButton
              variant={can ? 'primary' : 'secondary'}
              className="min-h-[50px] flex-1"
              aria-disabled={!can}
              onClick={() => {
                if (!can) return pushToast(t('ui.shop.needMore', { price: money(total - save.gold) }), 'bad')
                if (!ugBuyKits(n)) return
                sfx('gold')
                pushToast(t('ui.shop.bought', { n, item: t('ui.ug.kit'), left: money(useGame.getState().save?.gold ?? 0) }), 'good')
              }}
            >
              {can ? t('ui.shop.buyFor', { price: money(total) }) : t('ui.shop.needMore', { price: money(total - save.gold) })}
            </PixelButton>
          </div>
        )}
        <PixelButton size="sm" onClick={() => navigate('/underground')}>
          {t('ui.ug.toUnderground')}
        </PixelButton>
      </div>
      <p className="m-0 px-3 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.ug.kitNote')}</p>
    </section>
  )
}

/**
 * A small world's Mart (docs/21): the admin's list and nothing else, for the world's own ₽ — each item's limit and
 * what's left of it, the world's picture and time left over it. Nothing bought here leaves the world.
 */
function WorldShop() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { world } = useInWorld()
  const now = useServerNow(1000)
  const [open, setOpen] = useState<string | null>(null)
  const [qty, setQty] = useState<'1' | '5' | '10'>('1')
  if (!save) return null
  const rows = worldShopRows(save, data)
  const left = world && now != null ? worldLeft(world, now) : null
  return (
    <section aria-labelledby="world-shop" className="lv-shop flex flex-col gap-2 pb-2.5" style={worldVars(world)}>
      <header className="lv-shop-head relative isolate grid min-h-[92px] content-end gap-1.5 overflow-hidden px-3 pb-3 pt-2.5">
        <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
          {world?.banner && <img src={bannerUrl(world.banner)} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" />}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <WorldTag />
          <h2 id="world-shop" className="lv-ink m-0 min-w-0 truncate text-[28px] leading-none">
            {worldName(world, data)}
          </h2>
        </span>
        {left && (
          <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 font-pixel-sm text-[16px] leading-none">
            <span className="lv-ink text-gold-light">{t('ui.live.endsIn', { time: liveTime(left.ms) })}</span>
            <LiveGauge share={left.share} hot={left.ms < 24 * 3_600_000} />
          </span>
        )}
      </header>
      <ul className="grid grid-cols-2 gap-1.5 px-2 md:grid-cols-3">
        {rows.map((r) => {
          const out = r.left === 0
          const steps = (['1', '5', '10'] as const).filter((q) => r.left == null || Number(q) <= r.left)
          const n = Math.min(Number(qty), r.left ?? Infinity)
          const total = r.price * n
          const can = total <= save.gold
          return (
            <Row
              key={r.item.key}
              it={r.item}
              side="live"
              open={open === r.item.key && !out}
              onToggle={
                out
                  ? undefined
                  : () => {
                      setOpen(open === r.item.key ? null : r.item.key)
                      setQty('1')
                    }
              }
              sub={
                <span className={cx(r.left != null && r.left <= 2 && 'text-danger')}>
                  {r.limit == null
                    ? t('ui.live.shop.noLimit')
                    : out
                      ? t('ui.live.shop.soldOut')
                      : t('ui.live.shop.left', { left: r.left!, limit: r.limit })}
                </span>
              }
              pill={
                <span
                  className={cx(
                    'grid min-w-[62px] justify-items-center gap-0.5 px-2 pb-2 pt-1.5 text-center text-[18px] leading-none',
                    out || r.price > save.gold ? 'bg-well-deep text-ink' : 'light-scope bg-night text-gold-light',
                  )}
                >
                  {out ? t('ui.live.shop.soldOut') : money(r.price)}
                </span>
              }
              owned={save.inventory[r.item.key] ?? 0}
            >
              {r.item.description && (
                <p className="copy font-pixel-sm text-[16px] leading-tight text-muted">{r.item.description}</p>
              )}
              <div className="flex items-center gap-2">
                {steps.length > 1 ? (
                  <Seg
                    label={t('ui.shop.howMany', { item: r.item.name })}
                    value={steps.includes(qty) ? qty : '1'}
                    onChange={setQty}
                    options={steps.map((q) => ({ id: q, label: `×${q}` }))}
                  />
                ) : (
                  <span className="font-pixel-sm text-[16px] text-muted">{t('ui.live.shop.onePer')}</span>
                )}
                <PixelButton
                  variant={can ? 'primary' : 'secondary'}
                  className="min-h-[50px] flex-1"
                  disabled={!can}
                  onClick={() => {
                    if (!buyWorld(r.item.key, n)) return
                    sfx('gold')
                    if (r.left != null && r.left - n <= 0) setOpen(null)
                    pushToast(t('ui.shop.bought', { n, item: r.item.name, left: money(useGame.getState().save?.gold ?? 0) }), 'good')
                  }}
                >
                  {can ? t('ui.shop.buyFor', { price: money(total) }) : t('ui.shop.needMore', { price: money(total - save.gold) })}
                </PixelButton>
              </div>
            </Row>
          )
        })}
      </ul>
      <p className="m-0 px-3 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.world.mart.note')}</p>
    </section>
  )
}

/** The Mart's Mega Gems as shown (docs/35): its rows, or null while the shelf is shut here (`gemShelf`). */
export function GemShelfView({
  rows,
  gold,
  onBuy,
}: {
  rows: GemShelfRow[] | null
  gold: number
  /** Buys one: true when it went through. */
  onBuy: (row: GemShelfRow) => boolean
}) {
  const { t } = useT()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-labelledby="mart-gems" className="flex flex-col gap-1.5">
      <h2 id="mart-gems" className="mt-1 text-[24px] leading-none">
        {t('ui.shop.groupGems')}
      </h2>
      {!rows ? (
        <p className="copy m-0 font-pixel-sm text-[16px] text-muted">{t('ui.shop.gemsAfterLeague')}</p>
      ) : rows.length === 0 ? (
        <p className="copy m-0 font-pixel-sm text-[16px] text-muted">{t('ui.shop.gemsNone')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
          {rows.map((row) => {
            const { item, mega, owned } = row
            const can = item.price <= gold
            return (
              <Row
                key={item.key}
                it={item}
                side="buy"
                open={open === item.key && !owned}
                onToggle={owned ? undefined : () => setOpen(open === item.key ? null : item.key)}
                sub={
                  <span className="inline-flex items-center gap-1">
                    <MiniSprite dex={mega.dex} size={24} className="-my-1.5" />
                    {mega.name}
                  </span>
                }
                pill={
                  owned ? (
                    <Chip tone="dark">{t('ui.shop.gemOwned')}</Chip>
                  ) : (
                    <span
                      className={cx(
                        'min-w-[62px] px-2 pb-2 pt-1.5 text-center text-[18px] leading-none',
                        can ? 'light-scope bg-night text-gold-light' : 'bg-well-deep text-ink',
                      )}
                    >
                      {money(item.price)}
                    </span>
                  )
                }
                owned={0}
              >
                <p className="copy font-pixel-sm text-[16px] leading-tight text-muted">
                  {t('ui.shop.gemNote', { mega: mega.name })}
                </p>
                <PixelButton
                  variant={can ? 'primary' : 'secondary'}
                  className="min-h-[50px]"
                  disabled={!can}
                  onClick={() => {
                    if (!onBuy(row)) return
                    sfx('gold')
                    setOpen(null)
                    pushToast(t('ui.shop.gemBought', { gem: item.name, mega: mega.name }), 'good')
                  }}
                >
                  {can
                    ? t('ui.shop.buyFor', { price: money(item.price) })
                    : t('ui.shop.needMore', { price: money(item.price - gold) })}
                </PixelButton>
              </Row>
            )
          })}
        </ul>
      )}
      <PowerInfo kind="mega" />
    </section>
  )
}

/**
 * The Mart's Mega Gems (docs/35): the gems of the Pokémon found in this region, at their price, each bought once and
 * never sold; the ones held say so. While the shelf is shut here (its League not beaten yet) a line says when it
 * opens. Nothing at all before Korrina's badge, or with the gem rules off.
 */
function GemShelf() {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  if (!save || !gemRulesOn(data) || !powerEarned(save, data, 'mega')) return null
  return <GemShelfView rows={gemShelf(save, data)} gold={save.gold} onBuy={(r) => buyGem(r.item.key)} />
}

function BuyTab({ badges }: { badges: number }) {
  const { t } = useT()
  const [cat, setCat] = useState<Cat>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [qty, setQty] = useState<'1' | '5' | '10'>('1')
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const gold = save?.gold ?? 0
  const stock = shopStock(data, badges, (id) => !!save && isAreaUnlocked(save, id, data), {
    region: save ? regionOf(save) : undefined,
    bought: save?.boughtUnique,
  })
  // What a locked item waits for: badges first, then reaching its area.
  const needs = (it: ItemDef) =>
    badges < it.shopBadges
      ? t(`ui.shop.needsBadges.${it.shopBadges === 1 ? 'one' : 'other'}`, { count: it.shopBadges })
      : t('ui.shop.needsArea', {
          area: data.areas.find((a) => a.id === it.shopArea)?.name ?? t('ui.shop.someNewArea'),
        })
  const byShelf = (a: ItemDef, b: ItemDef) => groupIndex(a) - groupIndex(b) || a.price - b.price
  const all = stock.map((s) => s.item)
  const shelf = stock
    .filter((s) => s.unlocked)
    .map((s) => s.item)
    .filter(inCat(cat))
    .sort(byShelf)
  const later = stock
    .filter((s) => !s.unlocked)
    .map((s) => s.item)
    .filter(inCat(cat))
    .sort((a, b) => a.shopBadges - b.shopBadges || byShelf(a, b))
  const n = Number(qty)
  const purchase = (it: ItemDef, count: number) => {
    if (!buy(it.key, count)) return
    sfx('gold')
    // A fossil never reaches the bag: where it went, and that it is on a clock, is said in the toast (no pop-up for
    // news that asks nothing, docs/43 §2).
    if (it.effect.kind === 'fossil') {
      setOpen(null)
      pushToast(t('ui.shop.fossilBought', { hours: it.effect.hours }), 'good')
    } else
      pushToast(
        t('ui.shop.bought', { n: count, item: it.name, left: money(useGame.getState().save?.gold ?? 0) }),
        'good',
      )
  }

  return (
    <>
      <LiveShopSections />
      <UgKitSection />
      <CatChips
        items={all}
        value={cat}
        onChange={(c) => {
          setCat(c)
          setOpen(null)
        }}
      />
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        {shelf.map((it) => {
          const total = it.price * n
          const can = total <= gold
          const one = it.price <= gold
          return (
            <Row
              key={it.key}
              it={it}
              side="buy"
              open={open === it.key}
              onToggle={() => {
                setOpen(open === it.key ? null : it.key)
                setQty('1')
              }}
              sub={effectText(it)}
              pill={
                // The price is the purchase (×1): one tap. Short of ₽ it stays focusable and says what's missing.
                <button
                  type="button"
                  aria-disabled={!one || undefined}
                  aria-label={
                    one
                      ? t('ui.shop.buyOneLabel', { item: it.name, price: money(it.price) })
                      : `${it.name}: ${t('ui.shop.needMore', { price: money(it.price - gold) })}`
                  }
                  onClick={() => (one ? purchase(it, 1) : pushToast(t('ui.shop.needMore', { price: money(it.price - gold) }), 'info'))}
                  className={cx(
                    'min-h-[44px] min-w-[72px] px-2.5 pb-1 pt-0.5 text-center text-[20px] leading-none active:translate-y-[2px]',
                    one
                      ? 'light-scope bg-night text-gold-light shadow-[inset_0_-3px_0_rgb(0_0_0/0.35)] hover:bg-ink'
                      : 'bg-well-deep text-ink',
                  )}
                >
                  {money(it.price)}
                </button>
              }
              owned={save?.inventory[it.key] ?? 0}
            >
              {it.description && (
                <p className="copy font-pixel-sm text-[18px] leading-tight text-muted">{it.description}</p>
              )}
              <div className="flex items-center gap-2">
                <Seg
                  label={t('ui.shop.howMany', { item: it.name })}
                  value={qty}
                  onChange={setQty}
                  options={(['1', '5', '10'] as const).map((q) => ({ id: q, label: `×${q}` }))}
                />
                <PixelButton
                  variant={can ? 'primary' : 'secondary'}
                  className="min-h-[50px] flex-1"
                  disabled={!can}
                  onClick={() => purchase(it, n)}
                >
                  {can
                    ? t('ui.shop.buyFor', { price: money(total) })
                    : t('ui.shop.needMore', { price: money(total - gold) })}
                </PixelButton>
              </div>
            </Row>
          )
        })}
      </ul>
      {shelf.length === 0 && <p className="copy text-muted">{t('ui.shop.nothingHere')}</p>}
      <GemShelf />
      {later.length > 0 && (
        // Folded, as Upgrades' locked ones are (docs/42): what can't be bought yet doesn't fill the shelf.
        <details className="group flex flex-col gap-1.5">
          <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 font-pixel-sm text-[16px] text-muted">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▶
            </span>
            {t('ui.shop.comingLaterCount', { title: t('ui.shop.comingLater'), n: later.length })}
          </summary>
          <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
            {later.map((it) => (
              <li
                key={it.key}
                className="flex min-h-[54px] flex-col gap-1 bg-well px-1.5 py-1.5 text-muted shadow-ring-line"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <ItemSprite item={it} size={32} className="opacity-55 grayscale" />
                  <b className="line-clamp-2 min-w-0 flex-1 text-[18px] font-normal leading-[1.05]">{it.name}</b>
                </span>
                <small className="font-pixel-sm text-[16px] leading-tight">{effectText(it)}</small>
                <span className="mt-auto inline-flex items-center gap-1 self-end bg-well-deep px-1.5 pb-1 pt-[3px] font-pixel-sm text-[16px] text-ink">
                  {badges < it.shopBadges && <PixelIcon name="badge" size={8} />}
                  {needs(it)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

/** The Sell tab doubles as the bag: every item you hold, grouped like the Mart; the Mart buys back its own stock. */
function SellTab() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const [cat, setCat] = useState<Cat>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [qty, setQty] = useState<string>('1')
  // The list as the save holds it (a stable reference); a gem the admin removed since is skipped.
  const held = useGame((s) => s.save?.powers?.gems)
  const gems = ownedGems({ powers: { gems: held } })
    .map((k) => data.items[k])
    .filter(isGem)
  const bag = Object.entries(inventory ?? {})
    .filter(([k, n]) => n > 0 && data.items[k])
    .map(([k, n]) => ({ it: data.items[k]!, owned: n }))
  // Mega Gems are held, never in the bag's counts: listed apart, and never sold (docs/35).
  const gemList = gems.length > 0 && (
    <section aria-labelledby="bag-gems" className="flex flex-col gap-1.5">
      <h2 id="bag-gems" className="mt-1 text-[24px] leading-none">
        {t('ui.shop.groupGems')}
      </h2>
      <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
        {gems.map((it) => (
          <Row
            key={it.key}
            it={it}
            side="sell"
            open={false}
            sub={t('ui.shop.cantSell')}
            owned={0}
          />
        ))}
      </ul>
    </section>
  )
  if (!bag.length)
    return (
      <>
        <p className="copy text-muted">{t('ui.shop.bagEmpty')}</p>
        {gemList}
      </>
    )
  const rows = bag
    .filter((r) => inCat(cat)(r.it))
    .sort(
      (a, b) =>
        groupIndex(a.it) - groupIndex(b.it) || b.it.price - a.it.price || a.it.name.localeCompare(b.it.name),
    )
  return (
    <>
      <p className="font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.shop.sellIntro')}</p>
      <CatChips
        items={bag.map((r) => r.it)}
        value={cat}
        onChange={(c) => {
          setCat(c)
          setOpen(null)
        }}
      />
      <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
        {rows.map(({ it, owned }) => {
          const unit = sellPrice(it)
          const sellable = unit > 0
          const n = qty === 'all' ? owned : Math.min(Number(qty), owned)
          const choices = [
            ...(['1', '5'] as const).filter((q) => Number(q) < owned).map((q) => ({ id: q, label: `×${q}` })),
            { id: 'all', label: t('ui.shop.all', { count: owned }) },
          ]
          return (
            <Row
              key={it.key}
              it={it}
              side="sell"
              open={open === it.key}
              onToggle={
                sellable
                  ? () => {
                      setOpen(open === it.key ? null : it.key)
                      setQty('1')
                    }
                  : undefined
              }
              sub={sellable ? t('ui.shop.each', { price: money(unit) }) : t('ui.shop.cantSell')}
              pill={
                sellable && (
                  <span className="min-w-[62px] bg-forest px-2 pb-2 pt-1.5 text-center text-[18px] leading-none text-white">
                    +{money(unit)}
                  </span>
                )
              }
              owned={owned}
            >
              <div className="flex items-center gap-2">
                {choices.length > 1 && (
                  <Seg
                    label={t('ui.shop.howManyToSell', { item: it.name })}
                    value={qty}
                    onChange={setQty}
                    options={choices}
                  />
                )}
                <PixelButton
                  variant="success"
                  className="min-h-[50px] flex-1"
                  aria-label={t('ui.shop.sellLabel', { count: n, item: it.name, price: money(unit * n) })}
                  onClick={() => {
                    if (!sell(it.key, n)) return
                    sfx('gold')
                    pushToast(t('ui.shop.sold', { n, item: it.name, gain: money(unit * n) }), 'good')
                    if (n >= owned) setOpen(null)
                    setQty('1')
                  }}
                >
                  {t('ui.shop.sellFor', { price: money(unit * n) })}
                </PixelButton>
              </div>
            </Row>
          )
        })}
      </ul>
      {gemList}
    </>
  )
}

export function ShopScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab: MartTab = asked === 'upgrades' || asked === 'sell' ? asked : 'buy'
  const setTab = (next: MartTab) => setParams(next === 'buy' ? {} : { tab: next }, { replace: true })
  const inside = useInWorld().inside
  const upgrades = useGame((s) => (s.save ? affordableUpgrades(s.save, s.data) : 0))
  if (!save) return null
  const badges = badgeCase(save, data).filter((b) => b.earned).length
  // One place to spend gold (docs/43 §3): Buy, Upgrades, the Bag. The gold is the top bar's; no second wallet here.
  // Inside a small world the Mart is the world's (docs/21): its list to buy from, and the world's bag sold back for
  // the world's ₽ (its prices are never below the buy-back, so that can't pay).
  return (
    <div className="flex w-full flex-col gap-3">
      <PageHead icon="navShop" title={t(inside ? 'ui.world.mart.title' : 'ui.shop.title')} />
      <Seg
        tabs
        idPrefix="mart"
        label={t('ui.shop.tabs')}
        value={tab}
        onChange={setTab}
        className="w-full lg:max-w-xl"
        options={[
          { id: 'buy', label: t('ui.shop.buy') },
          { id: 'upgrades', label: t('ui.upgrades.title'), count: upgrades || undefined },
          { id: 'sell', label: t('ui.shop.bagTab') },
        ]}
      />
      <div role="tabpanel" aria-labelledby={`mart-${tab}`} className="flex flex-col gap-3">
        {tab === 'sell' ? (
          <SellTab />
        ) : tab === 'upgrades' ? (
          <UpgradesPanel />
        ) : inside ? (
          <WorldShop />
        ) : (
          <BuyTab badges={badges} />
        )}
      </div>
    </div>
  )
}

type MartTab = 'buy' | 'upgrades' | 'sell'
