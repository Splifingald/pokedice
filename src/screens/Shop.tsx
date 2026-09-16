import { useEffect, useState } from 'react'
import { badgeCase, effectText, shopStock, type ItemDef } from '@/engine'
import { sfx } from '@/audio/sfx'
import { PixelButton } from '@/components/PixelButton'
import { money } from '@/lib/format'
import { buy } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

const GROUPS: { title: string; kinds: ItemDef['effect']['kind'][] }[] = [
  { title: 'Healing', kinds: ['heal'] },
  { title: 'Status cures', kinds: ['cure'] },
  { title: 'Battle', kinds: ['rerolls', 'level'] },
  { title: 'Poké Balls', kinds: ['ball'] },
]
const QTY = [1, 5, 10] as const

/** One row per item: tap the name for the description and the quantity; BUY asks once to confirm the total. */
function ItemRow({ it }: { it: ItemDef }) {
  const gold = useGame((s) => s.save?.gold ?? 0)
  const owned = useGame((s) => s.save?.inventory[it.key] ?? 0)
  const [qty, setQty] = useState<number>(1)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])
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
          {it.spriteUrl ? (
            <img src={it.spriteUrl} alt="" width={40} height={40} className="pixelated shrink-0" style={{ imageRendering: 'pixelated' }} />
          ) : (
            <span className="h-10 w-10 shrink-0" />
          )}
          <span className="min-w-0">
            <span className="block text-2xl leading-none">{it.name}</span>
            <span className="block text-lg leading-tight text-muted">
              {effectText(it)} · {owned} in bag
            </span>
          </span>
        </button>
        <PixelButton
          variant={confirming ? 'success' : 'primary'}
          className="min-w-[104px] shrink-0 px-2"
          disabled={!afford}
          title={afford ? undefined : 'Not enough Pokédollars'}
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
          <div className="flex" role="group" aria-label={`How many ${it.name}`}>
            {QTY.map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={qty === q}
                onClick={() => {
                  setQty(q)
                  setConfirming(false)
                }}
                className={cx('pixel-btn -ml-[3px] min-h-[44px] min-w-[48px] px-1 text-lg first:ml-0 md:min-h-[36px]', qty === q ? 'bg-gold' : 'bg-panel')}
              >
                ×{q}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}

export function ShopScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const badges = badgeCase(save, data).filter((b) => b.earned).length
  const stock = shopStock(data, badges)
  const open = stock.filter((s) => s.unlocked).map((s) => s.item)
  const later = stock.filter((s) => !s.unlocked)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-5xl">Poké Mart</h1>
      <p className="copy text-muted">
        New stock arrives with your badges ({badges} so far). Tap an item for details and to buy 5 or 10 at once; the
        price button asks once to confirm.
      </p>
      {GROUPS.map((g) => {
        const items = open.filter((it) => g.kinds.includes(it.effect.kind))
        if (!items.length) return null
        return (
          <section key={g.title} className="flex flex-col gap-2" aria-label={g.title}>
            <h2 className="text-3xl">{g.title}</h2>
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
          <h2 className="text-3xl">Coming with more badges</h2>
          <ul className="flex flex-col gap-1.5">
            {later.map(({ item: it }) => (
              <li key={it.key} className="hatched flex items-center gap-3 border-[3px] px-2 py-1">
                {it.spriteUrl && <img src={it.spriteUrl} alt="" width={32} height={32} className="pixelated" style={{ imageRendering: 'pixelated' }} />}
                <span className="flex-1 text-xl">{it.name}</span>
                <span className="text-lg">
                  {it.shopBadges} badge{it.shopBadges === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
