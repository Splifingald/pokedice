// Everything the Mart sells or buys back, as one shape (an `Offer`), so the shelf, the Bag, a Special Shop, the
// Underground's kits, a small world's Mart and the Mega Gems share one tile (`ItemTile`) and one detail (`ItemDetail`).
// The engine prices and limits everything; an offer only carries what it said and the store action that acts on it.
import { useState, type ReactNode } from 'react'
import {
  kitPrice,
  kitsHeld,
  kitsLeftToBuy,
  liveShopRows,
  sellPrice,
  worldShopRows,
  type GameData,
  type GemShelfRow,
  type ItemDef,
  type LiveEvent,
  type SaveData,
  type UndergroundConfig,
  type UndergroundSave,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { DetailButton, ItemDetail, ItemTile, PricePlate, PriceButton } from '@/components/ItemTile'
import { ItemSprite } from '@/components/ItemSprite'
import { MiniSprite } from '@/components/SpriteImg'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { effectText } from '@/i18n/text'
import { money } from '@/lib/format'
import { buy, sell } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { buyLive } from '@/store/live'
import { ugBuyKits } from '@/store/underground'
import { buyWorld } from '@/store/worlds'
import { cx } from '@/theme/util'

export interface Offer {
  /** Where it's from and what: "shop:poke-ball", "live:sale:master-ball", "bag:potion". Unique on the page. */
  id: string
  key: string
  mode: 'buy' | 'sell'
  name: string
  picture: (size: number) => ReactNode
  effect: ReactNode
  description?: string | null
  held: number
  /** A unit's price (buy) or what one brings back (sell); null: can't be sold. */
  price: number | null
  /** The usual price, struck out (a Special Shop's sale). */
  usual?: number
  tags?: ReactNode
  /** How many can still be had (a limit); null: no limit. */
  room: number | null
  /** Held already, bought once for good (a Mega Gem). */
  owned?: boolean
  /** A line in its details (what a limit is, where a gem works). */
  note?: ReactNode
  act: (n: number) => boolean
  /** What the toast says once it went through. */
  done: (n: number) => string
}

const itemPicture = (it: ItemDef) => (size: number) => <ItemSprite item={it} size={size} />
const bought = (n: number, item: string) =>
  t('ui.shop.bought', { n, item, left: money(useGame.getState().save?.gold ?? 0) })

/** A Mart shelf's item. A fossil never reaches the bag: the toast says where it went (no pop-up, docs/43 §2). */
export function shopOffer(it: ItemDef, save: SaveData): Offer {
  return {
    id: `shop:${it.key}`,
    key: it.key,
    mode: 'buy',
    name: it.name,
    picture: itemPicture(it),
    effect: effectText(it),
    description: it.description,
    held: save.inventory[it.key] ?? 0,
    price: it.price,
    room: null,
    act: (n) => buy(it.key, n),
    done: (n) =>
      it.effect.kind === 'fossil'
        ? t('ui.shop.fossilBought', { hours: it.effect.hours })
        : bought(n, it.name),
  }
}

/** The limit, in words: "3 of 5 left" (red when 2 or fewer), Sold out, or nothing without one. */
function LimitTag({ left, limit }: { left: number | null; limit: number | null }) {
  if (limit == null || left == null) return null
  return (
    <span className={cx('font-pixel-sm text-[16px] leading-none', left <= 2 ? 'text-danger' : 'text-ink')}>
      {left === 0 ? t('ui.live.shop.soldOut') : t('ui.live.shop.left', { left, limit })}
    </span>
  )
}

/** A live event's Special Shop (docs/20): event prices (the usual one struck out), the never-sold, each one's limit. */
export function liveOffers(save: SaveData, data: GameData, live: LiveEvent): Offer[] {
  return liveShopRows(save, data, live).map((r) => {
    const sale = r.usual != null && r.price < r.usual
    return {
      id: `live:${live.id}:${r.item.key}`,
      key: r.item.key,
      mode: 'buy',
      name: r.item.name,
      picture: itemPicture(r.item),
      effect: effectText(r.item),
      description: r.item.description,
      held: save.inventory[r.item.key] ?? 0,
      price: r.price,
      usual: sale ? r.usual! : undefined,
      tags: (
        <>
          {r.usual == null ? (
            <Chip tone="dark">{t('ui.live.shop.never')}</Chip>
          ) : (
            sale && (
              <Chip tone="red">
                {t('ui.live.shop.off', { pct: Math.round((1 - r.price / r.usual) * 100) })}
              </Chip>
            )
          )}
          <LimitTag left={r.left} limit={r.limit} />
        </>
      ),
      room: r.left,
      note:
        r.limit === 1 ? t('ui.live.shop.onePer') : r.limit == null ? t('ui.live.shop.noLimit') : undefined,
      act: (n) => buyLive(live.id, r.item.key, n),
      done: (n) => bought(n, r.item.name),
    }
  })
}

/** A small world's Mart (docs/21): the admin's list, its limits, for the world's own ₽. */
export function worldOffers(save: SaveData, data: GameData): Offer[] {
  return worldShopRows(save, data).map((r) => ({
    id: `world:${r.item.key}`,
    key: r.item.key,
    mode: 'buy',
    name: r.item.name,
    picture: itemPicture(r.item),
    effect: effectText(r.item),
    description: r.item.description,
    held: save.inventory[r.item.key] ?? 0,
    price: r.price,
    tags: <LimitTag left={r.left} limit={r.limit} />,
    room: r.left,
    note: r.limit === 1 ? t('ui.live.shop.onePer') : undefined,
    act: (n) => buyWorld(r.item.key, n),
    done: (n) => bought(n, r.item.name),
  }))
}

/** A Mega Gem (docs/35): once, for every region, never sold; the Mega it opens under its name. */
export function gemOffer(row: GemShelfRow, onBuy: (row: GemShelfRow) => boolean): Offer {
  const { item, mega, owned } = row
  return {
    id: `gem:${item.key}`,
    key: item.key,
    mode: 'buy',
    name: item.name,
    picture: itemPicture(item),
    effect: (
      <span className="inline-flex items-center gap-1">
        <MiniSprite dex={mega.dex} size={24} className="-my-1.5" />
        {mega.name}
      </span>
    ),
    held: owned ? 1 : 0,
    price: item.price,
    room: owned ? 0 : 1,
    owned,
    note: t('ui.shop.gemNote', { mega: mega.name }),
    act: () => onBuy(row),
    done: () => t('ui.shop.gemBought', { gem: item.name, mega: mega.name }),
  }
}

/** The Underground's Explorakits (docs/34), while it runs. */
export function kitOffer(u: UndergroundSave, cfg: UndergroundConfig): Offer {
  const room = kitsLeftToBuy(u, cfg)
  return {
    id: 'kit:kit',
    key: 'kit',
    mode: 'buy',
    name: t('ui.ug.kit'),
    picture: (size) => <PixelIcon name="kit" size={size} />,
    effect: t('ui.ug.kitHint'),
    description: t('ui.ug.kitDesc'),
    held: kitsHeld(u),
    price: kitPrice(cfg),
    tags: <LimitTag left={room} limit={cfg.kits.limit ?? null} />,
    room,
    note: t('ui.ug.kitNote'),
    act: (n) => ugBuyKits(n),
    done: (n) => bought(n, t('ui.ug.kit')),
  }
}

/** The bag: what you hold, the Mart buying back its own stock (`sellPrice`), the rest "Can't sell". */
export function bagOffers(save: SaveData, data: GameData): Offer[] {
  return Object.entries(save.inventory)
    .filter(([k, n]) => n > 0 && data.items[k])
    .map(([k, n]) => {
      const it = data.items[k]!
      const unit = sellPrice(it)
      return {
        id: `bag:${k}`,
        key: k,
        mode: 'sell' as const,
        name: it.name,
        picture: itemPicture(it),
        effect: effectText(it),
        description: it.description,
        held: n,
        price: unit > 0 ? unit : null,
        room: n,
        act: (q: number) => sell(k, q),
        done: (q: number) => t('ui.shop.sold', { n: q, item: it.name, gain: money(unit * q) }),
      }
    })
}

/** Buys (or sells) `n`: the store acts, a coin's sound, and the toast. */
export function perform(o: Offer, n: number): boolean {
  if (!o.act(n)) return false
  sfx('gold')
  pushToast(o.done(n), 'good')
  return true
}

/** An offer on the shelf: the tile, its price the purchase (×1, one tap); a tap on the tile opens its details. */
export function OfferTile({
  o,
  gold,
  open,
  onOpen,
  flight,
  onBought,
}: {
  o: Offer
  gold: number
  open: boolean
  onOpen: () => void
  flight?: number
  onBought: () => void
}) {
  useT()
  const out = o.mode === 'buy' && o.room === 0
  const action =
    o.mode === 'sell' ? (
      o.price != null ? (
        <PricePlate tone="sell">+{money(o.price)}</PricePlate>
      ) : (
        <PricePlate>{t('ui.shop.cantSell')}</PricePlate>
      )
    ) : o.owned ? (
      <PricePlate tone="dark">{t('ui.shop.gemOwned')}</PricePlate>
    ) : out ? (
      <PricePlate>{t('ui.live.shop.soldOut')}</PricePlate>
    ) : (
      <PriceButton
        price={o.price!}
        struck={o.usual}
        can={o.price! <= gold}
        label={
          o.price! <= gold
            ? t('ui.shop.buyOneLabel', { item: o.name, price: money(o.price!) })
            : `${o.name}: ${t('ui.shop.needMore', { price: money(o.price! - gold) })}`
        }
        onBuy={() => perform(o, 1) && onBought()}
        onShort={() => pushToast(t('ui.shop.needMore', { price: money(o.price! - gold) }), 'info')}
      />
    )
  // Nothing more to show for a gem held, something sold out or a bag item the Mart won't take.
  const closed = o.owned || out || (o.mode === 'sell' && o.price == null)
  return (
    <ItemTile
      id={o.key}
      name={o.name}
      picture={o.picture(40)}
      sub={o.effect}
      tags={o.tags}
      held={o.mode === 'sell' || o.key === 'kit' ? o.held : o.owned ? 0 : o.held}
      action={action}
      open={open}
      onOpen={closed ? undefined : onOpen}
      disabled={closed}
      flight={flight}
    />
  )
}

const STEPS = ['1', '5', '10'] as const

/** An offer opened: what it is, then the quantity and the one button at the foot. */
export function OfferDetail({
  o,
  gold,
  onClose,
  onBought,
}: {
  o: Offer
  gold: number
  onClose: () => void
  onBought: () => void
}) {
  useT()
  const [qty, setQty] = useState('1')
  if (o.mode === 'sell') {
    const choices = [
      ...(['1', '5'] as const).filter((q) => Number(q) < o.held).map((q) => ({ id: q, label: `×${q}` })),
      { id: 'all', label: t('ui.shop.all', { count: o.held }) },
    ]
    const n = qty === 'all' ? o.held : Math.min(Number(qty), o.held)
    const unit = o.price ?? 0
    return (
      <ItemDetail
        title={o.name}
        picture={o.picture(56)}
        effect={o.effect}
        description={o.description}
        held={o.held}
        note={t('ui.shop.each', { price: money(unit) })}
        choices={choices}
        qty={choices.some((c) => c.id === qty) ? qty : '1'}
        onQty={setQty}
        qtyLabel={t('ui.shop.howManyToSell', { item: o.name })}
        onClose={onClose}
        button={
          <DetailButton
            mode="sell"
            can
            label={t('ui.shop.sellFor', { price: money(unit * n) })}
            aria={t('ui.shop.sellLabel', { count: n, item: o.name, price: money(unit * n) })}
            onClick={() => {
              if (!perform(o, n)) return
              onBought()
              if (n >= o.held) onClose()
              setQty('1')
            }}
          />
        }
      />
    )
  }
  const steps = o.owned ? [] : STEPS.filter((q) => o.room == null || Number(q) <= o.room)
  const pick = steps.includes(qty as (typeof STEPS)[number]) ? qty : '1'
  const n = Math.min(Number(pick), o.room ?? Infinity)
  const total = (o.price ?? 0) * n
  const can = !o.owned && o.room !== 0 && total <= gold
  return (
    <ItemDetail
      title={o.name}
      picture={o.picture(56)}
      effect={o.effect}
      description={o.description}
      held={o.held}
      tags={o.tags}
      note={o.note}
      choices={steps.map((q) => ({ id: q, label: `×${q}` }))}
      qty={pick}
      onQty={setQty}
      qtyLabel={t('ui.shop.howMany', { item: o.name })}
      onClose={onClose}
      button={
        <DetailButton
          mode="buy"
          can={can}
          label={
            o.owned
              ? t('ui.shop.gemOwned')
              : o.room === 0
                ? t('ui.live.shop.soldOut')
                : can
                  ? t('ui.shop.buyFor', { price: money(total) })
                  : t('ui.shop.needMore', { price: money(total - gold) })
          }
          onClick={() => {
            if (!can)
              return pushToast(t('ui.shop.needMore', { price: money(Math.max(0, total - gold)) }), 'info')
            if (!perform(o, n)) return
            onBought()
            if (o.room != null && o.room - n <= 0) onClose()
          }}
        />
      }
    />
  )
}
