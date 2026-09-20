import { useEffect, useState } from 'react'
import { badgeCase, isAreaUnlocked, sellPrice, shopStock, type ItemDef } from '@/engine'
import { effectText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { sfx } from '@/audio/sfx'
import { PixelButton } from '@/components/PixelButton'
import { money } from '@/lib/format'
import { buy, sell } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

const GROUPS: { title: string; kinds: ItemDef['effect']['kind'][] }[] = [
  { title: 'ui.shop.groupHealing', kinds: ['heal', 'revive'] },
  { title: 'ui.shop.groupCures', kinds: ['cure'] },
  { title: 'ui.shop.groupBattle', kinds: ['rerolls', 'level'] },
  { title: 'ui.shop.groupStones', kinds: ['stone'] },
  { title: 'ui.shop.groupBalls', kinds: ['ball'] },
]
const QTY = [1, 5, 10] as const

function ItemSprite({ it }: { it: ItemDef }) {
  return it.spriteUrl ? (
    <img src={it.spriteUrl} alt="" width={40} height={40} className="pixelated shrink-0" style={{ imageRendering: 'pixelated' }} />
  ) : (
    <span className="h-10 w-10 shrink-0" />
  )
}

/** A price button asks once: the first tap shows "OK …", a second one within 3 s goes through. */
function useConfirm() {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])
  return [confirming, setConfirming] as const
}

function QtyPicker({ label, options, value, onPick }: { label: string; options: { q: number; text: string }[]; value: number; onPick: (q: number) => void }) {
  return (
    <div className="flex" role="group" aria-label={label}>
      {options.map(({ q, text }) => (
        <button
          key={q}
          type="button"
          aria-pressed={value === q}
          onClick={() => onPick(q)}
          className={cx('pixel-btn -ml-[3px] min-h-[44px] min-w-[48px] px-1 text-lg first:ml-0 md:min-h-[36px]', value === q ? 'bg-gold' : 'bg-panel')}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** One row per item: tap the name for the description and the quantity; BUY asks once to confirm the total. */
function ItemRow({ it }: { it: ItemDef }) {
  const { t } = useT()
  const gold = useGame((s) => s.save?.gold ?? 0)
  const owned = useGame((s) => s.save?.inventory[it.key] ?? 0)
  const [qty, setQty] = useState<number>(1)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useConfirm()
  const total = it.price * qty
  const afford = gold >= total
  const detailsId = `item-${it.key}`

  return (
    <li className="pixel-panel p-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          <ItemSprite it={it} />
          <span className="min-w-0">
            <span className="block text-2xl leading-none">{it.name}</span>
            <span className="block text-lg leading-tight text-muted">
              {effectText(it)} · {t('ui.shop.inBag', { count: owned })}
            </span>
          </span>
        </button>
        <PixelButton
          variant={confirming ? 'success' : 'primary'}
          className="min-w-[104px] shrink-0 px-2"
          disabled={!afford}
          title={afford ? undefined : t('ui.shop.tooPoor')}
          onClick={() => {
            if (!confirming) return setConfirming(true)
            if (buy(it.key, qty)) sfx('gold')
            setConfirming(false)
          }}
        >
          {confirming ? `OK −${money(total)}` : `${qty > 1 ? `×${qty} ` : ''}${money(total)}`}
        </PixelButton>
      </div>
      {open && (
        <div id={detailsId} className="mt-2 flex flex-wrap items-center gap-3 border-t-2 border-dashed border-shadow pt-2">
          {it.description && <p className="copy min-w-0 flex-1 basis-56 text-muted">{it.description}</p>}
          <QtyPicker
            label={t('ui.shop.howMany', { item: it.name })}
            options={QTY.map((q) => ({ q, text: `×${q}` }))}
            value={qty}
            onPick={(q) => {
              setQty(q)
              setConfirming(false)
            }}
          />
        </div>
      )}
    </li>
  )
}

/** One bag item on the Sell tab: how many you hold, and what the Mart pays for them (its own stock only, at half price). */
function SellRow({ it, owned }: { it: ItemDef; owned: number }) {
  const { t } = useT()
  const unit = sellPrice(it)
  const [qty, setQty] = useState<number>(1)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useConfirm()
  const n = Math.min(qty, owned)
  const detailsId = `sell-${it.key}`
  const choices = [...new Set([1, 5, owned].filter((q) => q <= owned))].map((q) => ({
    q,
    text: q === owned && q > 1 ? t('ui.shop.all', { count: q }) : `×${q}`,
  }))

  return (
    <li className="pixel-panel p-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          <ItemSprite it={it} />
          <span className="min-w-0">
            <span className="block text-2xl leading-none">
              {it.name} <span className="text-xl">×{owned}</span>
            </span>
            <span className="block text-lg leading-tight text-muted">{effectText(it)}</span>
          </span>
        </button>
        {unit > 0 ? (
          <PixelButton
            variant={confirming ? 'success' : 'primary'}
            className="min-w-[104px] shrink-0 px-2"
            aria-label={t('ui.shop.sellLabel', { count: n, item: it.name, price: money(unit * n) })}
            onClick={() => {
              if (!confirming) return setConfirming(true)
              if (sell(it.key, n)) sfx('gold')
              setConfirming(false)
              setQty(1)
            }}
          >
            {confirming ? `OK +${money(unit * n)}` : `${n > 1 ? `×${n} ` : ''}+${money(unit * n)}`}
          </PixelButton>
        ) : (
          <span className="shrink-0 text-lg text-muted">{t('ui.shop.cantSell')}</span>
        )}
      </div>
      {open && (
        <div id={detailsId} className="mt-2 flex flex-wrap items-center gap-3 border-t-2 border-dashed border-shadow pt-2">
          {it.description && <p className="copy min-w-0 flex-1 basis-56 text-muted">{it.description}</p>}
          {unit > 0 && choices.length > 1 && (
            <QtyPicker
              label={t('ui.shop.howManyToSell', { item: it.name })}
              options={choices}
              value={n}
              onPick={(q) => {
                setQty(q)
                setConfirming(false)
              }}
            />
          )}
        </div>
      )}
    </li>
  )
}

/** The Sell tab doubles as the bag: every item you hold, grouped like the Mart. */
function SellTab() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const bag = Object.entries(inventory ?? {})
    .filter(([k, n]) => n > 0 && data.items[k])
    .map(([k, n]) => ({ it: data.items[k]!, owned: n }))
    .sort((a, b) => a.it.price - b.it.price || a.it.name.localeCompare(b.it.name))
  if (!bag.length) return <p className="copy text-muted">{t('ui.shop.bagEmpty')}</p>
  return (
    <>
      <p className="copy text-muted">{t('ui.shop.sellIntro')}</p>
      {GROUPS.map((g) => {
        const rows = bag.filter((r) => g.kinds.includes(r.it.effect.kind))
        if (!rows.length) return null
        return (
          <section key={g.title} className="flex flex-col gap-2" aria-label={t(g.title)}>
            <h2 className="text-3xl">{t(g.title)}</h2>
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <SellRow key={r.it.key} it={r.it} owned={r.owned} />
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function BuyTab({ badges }: { badges: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const stock = shopStock(data, badges, (id) => !!save && isAreaUnlocked(save, id, data))
  // What a locked item waits for: badges first, then reaching its area.
  const needs = (it: ItemDef) =>
    badges < it.shopBadges
      ? t(`ui.shop.needsBadges.${it.shopBadges === 1 ? 'one' : 'other'}`, { count: it.shopBadges })
      : t('ui.shop.needsArea', { area: data.areas.find((a) => a.id === it.shopArea)?.name ?? t('ui.shop.someNewArea') })
  const open = stock.filter((s) => s.unlocked).map((s) => s.item)
  const later = stock.filter((s) => !s.unlocked)
  return (
    <>
      <p className="copy text-muted">{t('ui.shop.buyIntro', { badges })}</p>
      {GROUPS.map((g) => {
        const items = open.filter((it) => g.kinds.includes(it.effect.kind))
        if (!items.length) return null
        return (
          <section key={g.title} className="flex flex-col gap-2" aria-label={t(g.title)}>
            <h2 className="text-3xl">{t(g.title)}</h2>
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <ItemRow key={it.key} it={it} />
              ))}
            </ul>
          </section>
        )
      })}
      {later.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-3xl">{t('ui.shop.comingLater')}</h2>
          <ul className="flex flex-col gap-1.5">
            {later.map(({ item: it }) => (
              <li key={it.key} className="hatched flex items-center gap-3 border-[3px] px-2 py-1">
                {it.spriteUrl && <img src={it.spriteUrl} alt="" width={32} height={32} className="pixelated" style={{ imageRendering: 'pixelated' }} />}
                <span className="flex-1 text-xl">{it.name}</span>
                <span className="text-lg">{needs(it)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-5xl">{t('ui.shop.title')}</h1>
      <div className="flex gap-2" role="tablist" aria-label={t('ui.shop.tabs')}>
        {(['buy', 'sell'] as const).map((id) => (
          <PixelButton
            key={id}
            role="tab"
            aria-selected={tab === id}
            variant={tab === id ? 'primary' : 'secondary'}
            onClick={() => setTab(id)}
          >
            {t(id === 'buy' ? 'ui.shop.buy' : 'ui.shop.sell')}
          </PixelButton>
        ))}
      </div>
      {tab === 'buy' ? <BuyTab badges={badges} /> : <SellTab />}
    </div>
  )
}
