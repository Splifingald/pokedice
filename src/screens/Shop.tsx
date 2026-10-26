import { useState, type ReactNode } from 'react'
import {
  badgeCase,
  gemRulesOn,
  gemShelf,
  isAreaUnlocked,
  isGem,
  liveLeft,
  ownedGems,
  powerEarned,
  regionOf,
  shopStock,
  ugCfg,
  worldLeft,
  type GemShelfRow,
  type ItemDef,
  type LiveEvent,
} from '@/engine'
import { effectText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { ItemSprite } from '@/components/ItemSprite'
import { ItemTile, PricePlate, TILE_GRID } from '@/components/ItemTile'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { FilterChips, Seg } from '@/components/Segmented'
import { SplitView } from '@/components/SplitView'
import { buyGem } from '@/store/actions'
import { PowerInfo } from '@/components/PowersRules'
import { useLive } from '@/store/live'
import { LiveBadge, LiveGauge, LivePicture, liveName, liveTime } from '@/screens/events/live'
import { bannerUrl } from '@/screens/events/shared'
import { useInWorld, worldVars, WorldTag } from '@/screens/events/world'
import { useServerNow } from '@/store/serverTime'
import { worldName } from '@/store/worlds'
import { useGame } from '@/store/game'
import { useUnderground } from '@/store/underground'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { affordableUpgrades } from '@/lib/upgrades'
import { UpgradesPanel } from './Upgrades'
import {
  bagOffers,
  gemOffer,
  kitOffer,
  liveOffers,
  OfferDetail,
  OfferTile,
  shopOffer,
  worldOffers,
  type Offer,
} from './mart/offers'
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

/** The category chips, one row (it scrolls sideways on a phone): All, then each group that has something here. */
function CatChips({ items, value, onChange }: { items: ItemDef[]; value: Cat; onChange: (c: Cat) => void }) {
  const { t } = useT()
  const present = GROUPS.filter((g) => items.some((it) => g.kinds.includes(it.effect.kind)))
  if (present.length < 2) return null
  return (
    <FilterChips
      label={t('ui.shop.category')}
      value={value}
      onChange={onChange}
      className="-mx-3 px-3 md:mx-0 md:px-0"
      options={[
        { id: 'all', label: t('ui.shop.catAll') },
        ...present.map((g) => ({ id: g.id, label: t(g.chip) })),
      ]}
    />
  )
}

const inCat = (cat: Cat) => (it: ItemDef) =>
  cat === 'all' || GROUPS.find((g) => g.id === cat)!.kinds.includes(it.effect.kind)

/** What the shelves need from the screen: which offer is open, and each tile's purchase count (its coins' flight). */
interface ShelfProps {
  gold: number
  open: string | null
  onOpen: (id: string) => void
  flights: Record<string, number>
  onBought: (id: string) => void
}

/** A grid of offers, one design for every shelf. */
function OfferGrid({ offers, shelf, label }: { offers: Offer[]; shelf: ShelfProps; label?: string }) {
  return (
    <ul className={TILE_GRID} aria-label={label}>
      {offers.map((o) => (
        <OfferTile
          key={o.id}
          o={o}
          gold={shelf.gold}
          open={shelf.open === o.id}
          onOpen={() => shelf.onOpen(o.id)}
          flight={shelf.flights[o.id]}
          onBought={() => shelf.onBought(o.id)}
        />
      ))}
    </ul>
  )
}

/** An event's banner over its shelf: its picture, its name, the time left. */
function EventBanner({
  id,
  picture,
  tag,
  name,
  left,
  hot,
}: {
  id: string
  picture: ReactNode
  tag: ReactNode
  name: string
  left: { ms: number; share: number } | null
  hot: number
}) {
  const { t } = useT()
  return (
    <header className="lv-shop-head relative isolate grid min-h-[76px] content-end gap-1.5 overflow-hidden px-3 pb-2.5 pt-2">
      {picture}
      <span className="flex min-w-0 items-center gap-2">
        {tag}
        <h2 id={id} className="lv-ink m-0 min-w-0 truncate text-[26px] leading-none">
          {name}
        </h2>
      </span>
      {left && (
        <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 font-pixel-sm text-[16px] leading-none">
          <span className="lv-ink text-gold-light">{t('ui.live.endsIn', { time: liveTime(left.ms) })}</span>
          <LiveGauge share={left.share} hot={left.ms < hot} />
        </span>
      )}
    </header>
  )
}

/** A live event's Special Shop (docs/20), over the Mart's own shelves: the same tiles, at the event's prices. */
function LiveShopSection({
  live,
  now,
  offers,
  shelf,
}: {
  live: LiveEvent
  now: number
  offers: Offer[]
  shelf: ShelfProps
}) {
  const { t } = useT()
  if (!offers.length) return null
  const headId = `live-shop-${live.id}`
  return (
    <section aria-labelledby={headId} className="lv-shop flex flex-col gap-2 pb-2">
      <EventBanner
        id={headId}
        picture={<LivePicture e={live} className="absolute inset-0 -z-10" />}
        tag={<LiveBadge />}
        name={liveName(live)}
        left={liveLeft(live, now)}
        hot={3 * 3_600_000}
      />
      <div className="px-2">
        <OfferGrid offers={offers} shelf={shelf} />
      </div>
      <p className="m-0 px-3 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.live.shop.note')}</p>
    </section>
  )
}

/**
 * The Underground's Explorakits (docs/34), over the Mart's shelves while it runs: the kit as a tile like any item, and
 * the way to the dig. Never in a small world's Mart (the event doesn't reach one).
 */
function UgKitSection({
  live,
  now,
  offer,
  shelf,
}: {
  live: LiveEvent
  now: number
  offer: Offer
  shelf: ShelfProps
}) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <section aria-labelledby="ug-shop" className="lv-shop flex flex-col gap-2 pb-2" data-testid="ug-shop">
      <EventBanner
        id="ug-shop"
        picture={<LivePicture e={live} className="absolute inset-0 -z-10" />}
        tag={<LiveBadge />}
        name={liveName(live)}
        left={liveLeft(live, now)}
        hot={3 * 3_600_000}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-stretch gap-2 px-2 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <ul className="grid">
          <OfferTile
            o={offer}
            gold={shelf.gold}
            open={shelf.open === offer.id}
            onOpen={() => shelf.onOpen(offer.id)}
            flight={shelf.flights[offer.id]}
            onBought={() => shelf.onBought(offer.id)}
          />
        </ul>
        <div className="flex flex-col justify-between gap-2">
          <p className="m-0 font-pixel-sm text-[16px] leading-tight text-ink">{t('ui.ug.kitDesc')}</p>
          <PixelButton size="sm" onClick={() => navigate('/underground')}>
            {t('ui.ug.toUnderground')}
          </PixelButton>
        </div>
      </div>
      <p className="m-0 px-3 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.ug.kitNote')}</p>
    </section>
  )
}

/** A small world's Mart (docs/21): the admin's list and nothing else, for the world's own ₽, under its banner. */
function WorldShopSection({ offers, shelf }: { offers: Offer[]; shelf: ShelfProps }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { world } = useInWorld()
  const now = useServerNow(1000)
  const left = world && now != null ? worldLeft(world, now) : null
  return (
    <section
      aria-labelledby="world-shop"
      className="lv-shop flex flex-col gap-2 pb-2"
      style={worldVars(world)}
    >
      <EventBanner
        id="world-shop"
        picture={
          <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
            {world?.banner && (
              <img
                src={bannerUrl(world.banner)}
                alt=""
                className="pixelated absolute inset-0 h-full w-full object-cover"
              />
            )}
          </span>
        }
        tag={<WorldTag />}
        name={worldName(world, data)}
        left={left}
        hot={24 * 3_600_000}
      />
      <div className="px-2">
        <OfferGrid offers={offers} shelf={shelf} />
      </div>
      <p className="m-0 px-3 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.world.mart.note')}</p>
    </section>
  )
}

/**
 * The Mart's Mega Gems as shown (docs/35): the gems as tiles (each bought once, HELD once it is), or a line while the
 * shelf is shut here (`gemShelf` null). Inside the Mart, its open tile is the screen's; on its own (the kitchen sink)
 * it opens its own sheet.
 */
export function GemShelfView({
  rows,
  gold,
  onBuy,
  shelf,
}: {
  rows: GemShelfRow[] | null
  gold: number
  /** Buys one: true when it went through. */
  onBuy: (row: GemShelfRow) => boolean
  shelf?: ShelfProps
}) {
  const { t } = useT()
  const [own, setOwn] = useState<string | null>(null)
  const offers = (rows ?? []).map((r) => gemOffer(r, onBuy))
  const local: ShelfProps = shelf ?? {
    gold,
    open: own,
    onOpen: (id) => setOwn(own === id ? null : id),
    flights: {},
    onBought: () => {},
  }
  const opened = !shelf && offers.find((o) => o.id === own)
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
        <OfferGrid offers={offers} shelf={{ ...local, gold }} />
      )}
      <PowerInfo kind="mega" small className="self-start" />
      {opened && <OfferDetail o={opened} gold={gold} onClose={() => setOwn(null)} onBought={() => {}} />}
    </section>
  )
}

/** What can't be had yet, folded under one line (docs/42): the same tile, greyed, with what it waits for. */
function ComingLater({ items, badges }: { items: ItemDef[]; badges: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  if (!items.length) return null
  // What a locked item waits for: badges first, then reaching its area.
  const needs = (it: ItemDef) =>
    badges < it.shopBadges
      ? t(`ui.shop.needsBadges.${it.shopBadges === 1 ? 'one' : 'other'}`, { count: it.shopBadges })
      : t('ui.shop.needsArea', {
          area: data.areas.find((a) => a.id === it.shopArea)?.name ?? t('ui.shop.someNewArea'),
        })
  return (
    <details className="group flex flex-col gap-1.5">
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 font-pixel-sm text-[18px] text-muted">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
          ▶
        </span>
        {t('ui.shop.comingLaterCount', { title: t('ui.shop.comingLater'), n: items.length })}
      </summary>
      <ul className={TILE_GRID}>
        {items.map((it) => (
          <ItemTile
            key={it.key}
            id={it.key}
            name={it.name}
            picture={<ItemSprite item={it} size={40} />}
            sub={effectText(it)}
            locked
            action={
              <PricePlate>
                {badges < it.shopBadges && <PixelIcon name="badge" size={12} />}
                <span className="font-pixel-sm text-[16px] leading-tight">{needs(it)}</span>
              </PricePlate>
            }
          />
        ))}
      </ul>
    </details>
  )
}

/**
 * PC, nothing open on Buy: the Bag stands in the pane, so what you hold sits beside what you can buy. A row opens its
 * details there (to sell it).
 */
function BagPane({
  offers,
  gems,
  onOpen,
}: {
  offers: Offer[]
  gems: ItemDef[]
  onOpen: (id: string) => void
}) {
  const { t } = useT()
  return (
    <section aria-labelledby="bag-pane" className="flex min-h-0 flex-1 flex-col">
      <h2 id="bag-pane" className="flex items-center gap-2 px-3.5 pb-2 pt-3 text-title leading-none">
        <PixelIcon name="bag" size={24} />
        {t('ui.shop.bagTab')}
      </h2>
      <div className="pixel-scroll min-h-0 flex-1 overflow-y-auto px-3.5 pb-4">
        {offers.length === 0 && gems.length === 0 ? (
          <p className="copy m-0 text-muted">{t('ui.shop.bagEmpty')}</p>
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0">
            {offers.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onOpen(o.id)}
                  className="flex min-h-[44px] w-full items-center gap-2 bg-paper px-2 text-left shadow-ring-line hover:shadow-ring"
                >
                  {o.picture(28)}
                  <span className="min-w-0 flex-1 truncate text-[18px]">{o.name}</span>
                  <span className="font-pixel-sm text-[18px] tabular-nums text-ink">×{o.held}</span>
                </button>
              </li>
            ))}
            {gems.map((it) => (
              <li key={it.key} className="flex min-h-[44px] items-center gap-2 bg-well px-2 shadow-ring-line">
                <ItemSprite item={it} size={28} />
                <span className="min-w-0 flex-1 truncate text-[18px]">{it.name}</span>
                <span className="font-pixel-sm text-[16px] text-ink">{t('ui.shop.cantSell')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

type MartTab = 'buy' | 'upgrades' | 'sell'

/**
 * The tabs are the page's title on a phone (the h1 is for screen readers there, as Social's views do): Buy, Upgrades,
 * the Bag, each with its icon. On PC the title stands at their left.
 */
function MartTabs({
  tab,
  onTab,
  title,
  upgrades,
}: {
  tab: MartTab
  onTab: (t: MartTab) => void
  title: string
  upgrades: number
}) {
  const { t } = useT()
  const label = (icon: 'navShop' | 'navUpgrades' | 'bag', text: string) => (
    <>
      <PixelIcon name={icon} size={20} className="shrink-0" />
      {text}
    </>
  )
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
      <h1 className="sr-only lg:not-sr-only lg:flex lg:items-center lg:gap-2.5 lg:text-[32px] lg:leading-none">
        <PixelIcon name="navShop" size={32} className="hidden shrink-0 lg:block" />
        {title}
      </h1>
      <Seg
        tabs
        idPrefix="mart"
        label={t('ui.shop.tabs')}
        value={tab}
        onChange={onTab}
        className="w-full lg:w-auto lg:min-w-[520px]"
        options={[
          { id: 'buy', label: label('navShop', t('ui.shop.buy')) },
          {
            id: 'upgrades',
            label: label('navUpgrades', t('ui.upgrades.title')),
            count: upgrades || undefined,
          },
          { id: 'sell', label: label('bag', t('ui.shop.bagTab')) },
        ]}
      />
    </div>
  )
}

export function ShopScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab: MartTab = asked === 'upgrades' || asked === 'sell' ? asked : 'buy'
  const [open, setOpen] = useState<string | null>(null)
  const [cat, setCat] = useState<Cat>('all')
  const [flights, setFlights] = useState<Record<string, number>>({})
  const setTab = (next: MartTab) => {
    setOpen(null)
    setCat('all')
    setParams(next === 'buy' ? {} : { tab: next }, { replace: true })
  }
  const inside = useInWorld().inside
  const upgrades = useGame((s) => (s.save ? affordableUpgrades(s.save, s.data) : 0))
  const { lives, now: liveNow } = useLive(1000)
  const ug = useUnderground(1000)
  if (!save) return null
  const badges = badgeCase(save, data).filter((b) => b.earned).length
  const gold = save.gold
  const shelf: ShelfProps = {
    gold,
    open,
    onOpen: (id) => setOpen(open === id ? null : id),
    flights,
    onBought: (id) => setFlights((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 })),
  }

  // Every offer on the page, so the one open is found whichever shelf it sits on.
  const stock = inside
    ? []
    : shopStock(data, badges, (id) => isAreaUnlocked(save, id, data), {
        region: regionOf(save),
        bought: save.boughtUnique,
      })
  const byShelf = (a: ItemDef, b: ItemDef) => groupIndex(a) - groupIndex(b) || a.price - b.price
  const forSale = stock.filter((s) => s.unlocked).map((s) => s.item)
  const shelfOffers = forSale
    .filter(inCat(cat))
    .sort(byShelf)
    .map((it) => shopOffer(it, save))
  const later = stock
    .filter((s) => !s.unlocked)
    .map((s) => s.item)
    .filter(inCat(cat))
    .sort((a, b) => a.shopBadges - b.shopBadges || byShelf(a, b))
  const liveShops =
    inside || liveNow == null
      ? []
      : lives.filter((e) => e.type === 'shop').map((e) => ({ live: e, offers: liveOffers(save, data, e) }))
  const kit = !inside && ug.live && ug.u && ug.now != null ? kitOffer(ug.u, ugCfg(data)) : null
  const gemRows =
    !inside && gemRulesOn(data) && powerEarned(save, data, 'mega') ? gemShelf(save, data) : undefined
  const gems = (gemRows ?? []).map((r) => gemOffer(r, (row) => buyGem(row.item.key)))
  const world = inside ? worldOffers(save, data) : []
  const bag = bagOffers(save, data).sort(
    (a, b) =>
      groupIndex(data.items[a.key]!) - groupIndex(data.items[b.key]!) ||
      (b.price ?? 0) - (a.price ?? 0) ||
      a.name.localeCompare(b.name),
  )
  // Mega Gems are held, never in the bag's counts: listed apart, and never sold (docs/35).
  const gemsHeld = ownedGems(save)
    .map((k) => data.items[k])
    .filter(isGem)
  const all = [
    ...shelfOffers,
    ...liveShops.flatMap((s) => s.offers),
    ...(kit ? [kit] : []),
    ...gems,
    ...world,
    ...bag,
  ]
  const opened = open ? all.find((o) => o.id === open) : undefined
  const detail = opened && (
    <OfferDetail
      key={opened.id}
      o={opened}
      gold={gold}
      onClose={() => setOpen(null)}
      onBought={() => shelf.onBought(opened.id)}
    />
  )

  // One place to spend gold (docs/43 §3): Buy, Upgrades, the Bag. The gold is the top bar's; no second wallet here.
  // Inside a small world the Mart is the world's (docs/21): its list to buy from, and the world's bag sold back for
  // the world's ₽ (its prices are never below the buy-back, so that can't pay).
  const head = (
    <MartTabs
      tab={tab}
      onTab={setTab}
      title={t(inside ? 'ui.world.mart.title' : 'ui.shop.title')}
      upgrades={upgrades}
    />
  )
  if (tab === 'upgrades')
    return (
      <div className="flex w-full flex-col gap-3">
        {head}
        <div role="tabpanel" aria-labelledby="mart-upgrades" className="flex flex-col gap-3">
          <UpgradesPanel />
        </div>
      </div>
    )

  const bagTab = tab === 'sell'
  const bagRows = bag.filter((o) => inCat(cat)(data.items[o.key]!))
  const main = bagTab ? (
    <>
      {bag.length === 0 ? (
        <p className="copy m-0 text-muted">{t('ui.shop.bagEmpty')}</p>
      ) : (
        <>
          <CatChips items={bag.map((o) => data.items[o.key]!)} value={cat} onChange={setCat} />
          <OfferGrid offers={bagRows} shelf={shelf} />
        </>
      )}
      {gemsHeld.length > 0 && (
        <section aria-labelledby="bag-gems" className="flex flex-col gap-1.5">
          <h2 id="bag-gems" className="mt-1 text-[24px] leading-none">
            {t('ui.shop.groupGems')}
          </h2>
          <ul className={TILE_GRID}>
            {gemsHeld.map((it) => (
              <ItemTile
                key={it.key}
                id={it.key}
                name={it.name}
                picture={<ItemSprite item={it} size={40} />}
                sub={effectText(it)}
                action={<PricePlate>{t('ui.shop.cantSell')}</PricePlate>}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  ) : inside ? (
    <WorldShopSection offers={world} shelf={shelf} />
  ) : (
    <>
      {liveNow != null &&
        liveShops.map((s) => (
          <LiveShopSection key={s.live.id} live={s.live} now={liveNow} offers={s.offers} shelf={shelf} />
        ))}
      {kit && ug.live && ug.now != null && (
        <UgKitSection live={ug.live} now={ug.now} offer={kit} shelf={shelf} />
      )}
      <CatChips items={forSale} value={cat} onChange={setCat} />
      <OfferGrid offers={shelfOffers} shelf={shelf} label={t('ui.shop.buy')} />
      {shelfOffers.length === 0 && <p className="copy m-0 text-muted">{t('ui.shop.nothingHere')}</p>}
      {gemRows !== undefined && (
        <GemShelfView rows={gemRows} gold={gold} onBuy={(r) => buyGem(r.item.key)} shelf={shelf} />
      )}
      <ComingLater items={later} badges={badges} />
    </>
  )
  return (
    <div className="flex w-full flex-col gap-3">
      {head}
      <div role="tabpanel" aria-labelledby={`mart-${tab}`} className={cx('flex flex-col gap-3')}>
        <SplitView
          main={main}
          detail={detail || undefined}
          empty={
            bagTab ? (
              <div className="grid flex-1 place-content-center gap-2 p-6 text-center">
                <PixelIcon name="bag" size={40} className="mx-auto" />
                <p className="copy m-0 text-[20px]">{t('ui.shop.sellIntro')}</p>
              </div>
            ) : (
              <BagPane offers={bag} gems={gemsHeld} onOpen={(id) => setOpen(id)} />
            )
          }
        />
      </div>
    </div>
  )
}
