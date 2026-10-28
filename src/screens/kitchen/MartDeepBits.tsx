// Kitchen sink: the deep pass's Mart and Day Care pieces (docs/43 §5.5, §5.7) in every state, from made-up items — the
// one item tile (shelf, sale, limit, sold out, held, bag, coming later, open), its price button, its details docked as
// in the Mart's PC pane, and the small INFO.
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import {
  DetailButton,
  ItemDetail,
  ItemTile,
  PriceButton,
  PricePlate,
  QtyButton,
  QtyRow,
  TILE_GRID,
} from '@/components/ItemTile'
import { ItemSprite } from '@/components/ItemSprite'
import { SheetDock } from '@/components/Sheet'
import { SmallInfo } from '@/components/SmallInfo'
import { useGame } from '@/store/game'

const noop = () => undefined

export function MartDeepBits() {
  const items = useGame((s) => s.data.items)
  const ball = items['poke-ball']
  const great = items['great-ball']
  const potion = items['potion']
  const master = items['master-ball']
  const pic = (key: string) => <ItemSprite item={items[key]} size={40} />
  const buy = (price: number, can: boolean) => (
    <PriceButton price={price} can={can} label={`Buy one, ₽${price}`} onBuy={noop} onShort={noop} />
  )
  return (
    <div className="grid w-full gap-4">
      <ul className={TILE_GRID}>
        <ItemTile
          id="k-ball"
          name={ball?.name ?? 'Poké Ball'}
          picture={pic('poke-ball')}
          sub="+1 to the catch die"
          held={14}
          action={buy(20, true)}
          onOpen={noop}
        />
        <ItemTile
          id="k-great"
          name={great?.name ?? 'Great Ball'}
          picture={pic('great-ball')}
          sub="+2 to the catch die"
          held={5}
          open
          action={buy(50, true)}
          onOpen={noop}
        />
        <ItemTile
          id="k-potion"
          name={potion?.name ?? 'Potion'}
          picture={pic('potion')}
          sub="+20 HP"
          action={buy(1500, false)}
          onOpen={noop}
        />
        <ItemTile
          id="k-sale"
          name="Ultra Ball"
          picture={pic('ultra-ball')}
          sub="+3 to the catch die"
          tags={
            <>
              <Chip tone="red">-25%</Chip>
              <span className="font-pixel-sm text-[16px] leading-none text-danger">2 of 5 left</span>
            </>
          }
          action={
            <PriceButton price={90} struck={120} can label="Buy one, ₽90" onBuy={noop} onShort={noop} />
          }
          onOpen={noop}
        />
        <ItemTile
          id="k-out"
          name={master?.name ?? 'Master Ball'}
          picture={pic('master-ball')}
          sub="Always catches"
          tags={<Chip tone="dark">NEVER SOLD</Chip>}
          held={1}
          action={<PricePlate>Sold out</PricePlate>}
          disabled
        />
        <ItemTile
          id="k-gem"
          name="Venusaurite"
          picture={pic('venusaurite')}
          sub="Mega Venusaur"
          action={<PricePlate tone="dark">Held</PricePlate>}
          disabled
        />
        <ItemTile
          id="k-sell"
          name={potion?.name ?? 'Potion'}
          picture={pic('potion')}
          sub="+20 HP"
          held={6}
          action={<PricePlate tone="sell">+₽7</PricePlate>}
          onOpen={noop}
        />
        <ItemTile
          id="k-cant"
          name="Rare Candy"
          picture={pic('rare-candy')}
          sub="+1 level"
          held={2}
          action={<PricePlate>Can't sell</PricePlate>}
          disabled
        />
        <ItemTile
          id="k-locked"
          name="Ultra Ball"
          picture={pic('ultra-ball')}
          sub="+3 to the catch die"
          locked
          action={
            <PricePlate>
              <PixelIcon name="badge" size={12} />
              <span className="font-pixel-sm text-[16px]">5 badges</span>
            </PricePlate>
          }
        />
        <ItemTile
          id="k-kit"
          name="Explorakit"
          picture={<PixelIcon name="kit" size={40} />}
          sub="1 kit = 1 wall"
          held={3}
          action={buy(1000, true)}
          onOpen={noop}
        />
      </ul>

      {/* The details as the Mart's PC pane shows them (on a phone the same sheet rises from the bottom). */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="pixel-panel flex min-h-[320px] flex-col overflow-hidden p-0">
          <SheetDock.Provider value>
            <ItemDetail
              title={great?.name ?? 'Great Ball'}
              picture={<ItemSprite item={great} size={56} />}
              effect="+2 to the catch die"
              description={great?.description}
              held={5}
              onClose={noop}
              actions={
                <QtyRow>
                  <QtyButton mode="buy" can qty="×1" total={50} label="Buy 1, ₽50" onClick={noop} />
                  <QtyButton mode="buy" can qty="×5" total={250} label="Buy 5, ₽250" onClick={noop} />
                  <QtyButton
                    mode="buy"
                    can={false}
                    qty="×10"
                    total={500}
                    short="need ₽120"
                    label="Need ₽120 more"
                    onClick={noop}
                  />
                </QtyRow>
              }
            />
          </SheetDock.Provider>
        </div>
        <div className="pixel-panel flex min-h-[320px] flex-col overflow-hidden p-0">
          <SheetDock.Provider value>
            <ItemDetail
              title={potion?.name ?? 'Potion'}
              picture={<ItemSprite item={potion} size={56} />}
              effect="+20 HP"
              held={6}
              note="₽7 each"
              onClose={noop}
              actions={
                <QtyRow>
                  <QtyButton mode="sell" can qty="×1" total={7} label="Sell 1 for ₽7" onClick={noop} />
                  <QtyButton mode="sell" can qty="×5" total={35} label="Sell 5 for ₽35" onClick={noop} />
                  <QtyButton mode="sell" can qty="All ×6" total={42} label="Sell 6 for ₽42" onClick={noop} />
                </QtyRow>
              }
            />
          </SheetDock.Provider>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-28">{buy(20, true)}</div>
        <div className="w-28">{buy(20, false)}</div>
        <div className="w-28">
          <PriceButton price={90} struck={120} can label="Buy one, ₽90" onBuy={noop} onShort={noop} />
        </div>
        <div className="w-28">
          <PricePlate tone="sell">+₽7</PricePlate>
        </div>
        <SmallInfo name="Day Care" onClick={noop} />
        <DetailButton mode="buy" can={false} label="Need ₽40 more" onClick={noop} />
      </div>
    </div>
  )
}
