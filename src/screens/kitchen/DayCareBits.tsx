// Kitchen sink: the Day Care's pieces (src/screens/daycare/parts.tsx) in each state, from made-up Pokémon. The yard
// and the hatching play on /daycare and /kitchen-sink/fx.
import { EggSprite } from '@/components/EggSprite'
import {
  EggCardView,
  EmptySlot,
  GainTag,
  Heart,
  Mate,
  MatesLine,
  PairTag,
  RushBarView,
  SLOT_COLORS,
  SlotCard,
  XpBar,
} from '@/screens/daycare/parts'

const noop = () => undefined
const take = { label: 'Take back', aria: 'Take back', onClick: noop }
const send = { label: 'Send back', aria: 'Send back', onClick: noop }
const yours = (slot: number) => (
  <>
    <Heart color={SLOT_COLORS[slot]!} />
    <span>Yours</span>
  </>
)
const guest = (name: string) => <span>{name}’s</span>

export function DayCareBits() {
  return (
    <div className="grid w-full gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <EggSprite size={36} />
        <EggSprite size={36} shake />
        {SLOT_COLORS.map((c) => (
          <Heart key={c} color={c} size={15} />
        ))}
        <PairTag>
          <Heart color={SLOT_COLORS[0]} />
          Compatible with Jolteon
        </PairTag>
        <PairTag tone="plain">Field · every 12 h</PairTag>
        <PairTag tone="slow">Ditto · every 24 h</PairTag>
      </div>

      <ul className="m-0 grid max-w-md list-none grid-cols-2 gap-2 p-0">
        <SlotCard band={SLOT_COLORS[0]} head={yours(0)} tag={<GainTag>+2 Lv</GainTag>} dex={133} name="Eevee" level="Lv.24" action={take}>
          <XpBar k={0.4} line="To Lv.25 · came at Lv.22" />
          <MatesLine lead="Pairs with" mates={<><Mate name="Jolteon" slot={null} /><Mate name="Ditto" slot={null} /></>} />
        </SlotCard>
        <SlotCard band={SLOT_COLORS[1]} head={yours(1)} tag={<GainTag>New</GainTag>} dex={147} name="Dratini" level="Lv.30" action={take}>
          <XpBar k={0} line="To Lv.31 · came at Lv.30" />
          <MatesLine lead="No partner here yet" />
        </SlotCard>
        <SlotCard band={SLOT_COLORS[0]} head={yours(0)} tag={<GainTag>+12 Lv</GainTag>} dex={132} shiny name="Ditto" level="Lv.100" action={take}>
          <XpBar k={1} line="Lv.100: it can’t grow more" />
          <MatesLine lead="Pairs with all but legendaries" />
        </SlotCard>
        <EmptySlot title="Leave a Pokémon" sub="From your team or your Box" onClick={noop} />
        <SlotCard band="rgb(var(--c-shadow))" head={guest('Lea')} dex={135} name="Jolteon" level="Lv.41" action={send}>
          <MatesLine lead="Pairs with" mates={<Mate name="Eevee" slot={0} />} />
        </SlotCard>
        <SlotCard band="rgb(var(--c-shadow))" head={guest('Kai')} dex={59} name="Arcanine" level="Lv.50" action={send}>
          <MatesLine lead="No match with yours" />
        </SlotCard>
        <EmptySlot title="Add from a friend" sub="A Pokémon from their Day Care" onClick={noop} />
        <EmptySlot title="Add from a friend" sub="Friends’ Pokémon · with the friend list" disabled />
      </ul>

      <div className="grid max-w-md gap-2">
        <RushBarView wait="7 h 14" pairs={3} price={200} short={0} onRush={noop} onShort={noop} />
        <RushBarView wait="7 h 14" pairs={2} price={200} short={80} onRush={noop} onShort={noop} />
        <RushBarView wait="12 h 00" pairs={0} price={200} short={0} onRush={noop} onShort={noop} />
        <EggCardView from="Eevee and Ditto (Noor) left it." onHatch={noop} />
        <EggCardView from="A gift for your first visit." onHatch={noop} />
      </div>
    </div>
  )
}
