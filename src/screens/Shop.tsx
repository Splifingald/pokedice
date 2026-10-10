import { useState, type ReactNode } from 'react'
import { badgeCase, isAreaUnlocked, regionOf, sellPrice, shopStock, type ItemDef } from '@/engine'
import { effectText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { sfx } from '@/audio/sfx'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelIcon } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { PageHead, Wallet } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { FilterChips, Seg } from '@/components/Segmented'
import { money } from '@/lib/format'
import { buy, sell } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'

type Kind = ItemDef['effect']['kind']
type GroupId = 'ball' | 'heal' | 'battle' | 'cure' | 'stone' | 'fossil'

/**
 * The Mart's categories, Balls first. Both tabs list items by group, so an item whose effect kind is in no group would
 * silently vanish the moment it unlocked. Every kind of `ItemEffect` must appear here; `groupOf` and its test are what
 * keep that true as kinds are added.
 */
const GROUPS: { id: GroupId; chip: string; title: string; kinds: Kind[] }[] = [
  { id: 'ball', chip: 'ui.shop.catBalls', title: 'ui.shop.groupBalls', kinds: ['ball'] },
  { id: 'heal', chip: 'ui.shop.groupHealing', title: 'ui.shop.groupHealing', kinds: ['heal', 'revive'] },
  { id: 'battle', chip: 'ui.shop.groupBattle', title: 'ui.shop.groupBattle', kinds: ['rerolls', 'level'] },
  { id: 'cure', chip: 'ui.shop.groupCures', title: 'ui.shop.groupCures', kinds: ['cure'] },
  { id: 'stone', chip: 'ui.shop.groupStones', title: 'ui.shop.groupStones', kinds: ['stone'] },
  { id: 'fossil', chip: 'ui.shop.groupFossils', title: 'ui.shop.groupFossils', kinds: ['fossil'] },
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
  side: 'buy' | 'sell'
  sub: string
  /** The price plate at the end of the row. */
  pill?: ReactNode
  owned: number
  children?: ReactNode
}) {
  const id = `${side}-${it.key}`
  return (
    <li
      className={cx(
        open
          ? 'col-span-full bg-cream shadow-[inset_0_0_0_3px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-gold-light))]'
          : 'bg-paper shadow-card',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        aria-expanded={onToggle ? open : undefined}
        aria-controls={onToggle && open ? id : undefined}
        className="flex h-full min-h-[54px] w-full flex-col gap-1 pb-[9px] pl-1.5 pr-1.5 pt-1.5 text-left"
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <ItemSprite item={it} size={32} />
          <b className="line-clamp-2 min-w-0 flex-1 text-[18px] font-normal leading-[1.05]">{it.name}</b>
        </span>
        <small className="font-pixel-sm text-[13px] leading-tight text-muted">{sub}</small>
        <span className="mt-auto flex w-full items-end justify-between gap-1">
          <em className="font-pixel-sm text-[15px] not-italic text-muted">{owned > 0 ? `×${owned}` : ''}</em>
          {pill}
        </span>
      </button>
      {open && children && (
        <div id={id} className="grid gap-2 px-2.5 pb-3">
          {children}
        </div>
      )}
    </li>
  )
}

function BuyTab({ badges }: { badges: number }) {
  const { t } = useT()
  // Held here, not in the row: a unique item leaves the shelf the moment it is bought, and a pop-up owned by the
  // row would be unmounted along with it before anyone read a word of it.
  const [dug, setDug] = useState<ItemDef | null>(null)
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

  return (
    <>
      <Modal open={!!dug} onClose={() => setDug(null)} title={dug?.name}>
        <div className="flex flex-col items-center gap-3 text-center">
          <ItemSprite item={dug ?? undefined} size={96} />
          <p className="copy text-xl leading-snug">
            {t('ui.shop.fossilBought', { hours: dug?.effect.kind === 'fossil' ? dug.effect.hours : 0 })}
          </p>
          <PixelButton variant="primary" onClick={() => setDug(null)}>
            {t('ui.common.continue')}
          </PixelButton>
        </div>
      </Modal>
      <CatChips
        items={all}
        value={cat}
        onChange={(c) => {
          setCat(c)
          setOpen(null)
        }}
      />
      <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
        {shelf.map((it) => {
          const total = it.price * n
          const can = total <= gold
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
                <span
                  className={cx(
                    'min-w-[62px] px-2 pb-2 pt-1.5 text-center text-[18px] leading-none',
                    it.price > gold ? 'bg-well-deep text-ink' : 'light-scope bg-night text-gold-light',
                  )}
                >
                  {money(it.price)}
                </span>
              }
              owned={save?.inventory[it.key] ?? 0}
            >
              {it.description && (
                <p className="copy font-pixel-sm text-[15px] leading-tight text-muted">{it.description}</p>
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
                  onClick={() => {
                    if (!buy(it.key, n)) return
                    sfx('gold')
                    // A fossil never reaches the bag, so a bag count ticking up would be the wrong feedback — and
                    // where it actually went, and that it is on a clock, is not something the shelf can say.
                    if (it.effect.kind === 'fossil') {
                      setOpen(null)
                      setDug(it)
                    } else
                      pushToast(
                        t('ui.shop.bought', {
                          n,
                          item: it.name,
                          left: money(useGame.getState().save?.gold ?? 0),
                        }),
                        'good',
                      )
                  }}
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
      {later.length > 0 && (
        <section className="flex flex-col gap-1.5" aria-labelledby="mart-later">
          <h2 id="mart-later" className="mt-1 text-[24px] leading-none">
            {t('ui.shop.comingLater')}
          </h2>
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
                <small className="font-pixel-sm text-[13px] leading-tight">{effectText(it)}</small>
                <span className="mt-auto inline-flex items-center gap-1 self-end bg-well-deep px-1.5 pb-1 pt-[3px] font-pixel-sm text-[14px] text-ink">
                  {badges < it.shopBadges && <PixelIcon name="badge" size={8} />}
                  {needs(it)}
                </span>
              </li>
            ))}
          </ul>
        </section>
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
  const bag = Object.entries(inventory ?? {})
    .filter(([k, n]) => n > 0 && data.items[k])
    .map(([k, n]) => ({ it: data.items[k]!, owned: n }))
  if (!bag.length) return <p className="copy text-muted">{t('ui.shop.bagEmpty')}</p>
  const rows = bag
    .filter((r) => inCat(cat)(r.it))
    .sort(
      (a, b) =>
        groupIndex(a.it) - groupIndex(b.it) || b.it.price - a.it.price || a.it.name.localeCompare(b.it.name),
    )
  return (
    <>
      <p className="font-pixel-sm text-[15px] leading-tight text-muted">{t('ui.shop.sellIntro')}</p>
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
    </>
  )
}

export function ShopScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  if (!save) return null
  const badges = badgeCase(save, data).filter((b) => b.earned).length

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <PageHead icon="navShop" title={t('ui.shop.title')}>
        <Wallet />
      </PageHead>
      <Seg
        tabs
        idPrefix="mart"
        label={t('ui.shop.tabs')}
        value={tab}
        onChange={setTab}
        className="w-full"
        options={[
          { id: 'buy', label: t('ui.shop.buy') },
          { id: 'sell', label: t('ui.shop.sell') },
        ]}
      />
      <div role="tabpanel" aria-labelledby={`mart-${tab}`} className="flex flex-col gap-3">
        {tab === 'buy' ? <BuyTab badges={badges} /> : <SellTab />}
      </div>
    </div>
  )
}
