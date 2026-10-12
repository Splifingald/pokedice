// Kitchen sink: gifts from the developer (docs/15 §23) — the wrapped gift under a message (ready, waiting in Extreme
// mode or a small world, with OPEN IT, asking the server), an opened gift in My messages, what arrived (one region,
// several, a shiny NEW that joined the team, one sent on to the latest region), the rules (the first time and INFO),
// and the opening itself (one item, a shiny Pokémon, many things).
import { useState } from 'react'
import { GIFT_LATEST, type Gift, type GiftLanded } from '@/engine'
import { GiftMoment, GiftOpened, GiftPresent, GiftResult, GiftRulesModal } from '@/components/Gifts'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'

const item = (key: string, qty: number, region = GIFT_LATEST): Gift => ({ kind: 'item', key, qty, region })
const mon = (dex: number, level: number, shiny = false, region = GIFT_LATEST): Gift => ({
  kind: 'pokemon',
  dex,
  level,
  region,
  ...(shiny && { shiny: true }),
})
const land = (gift: Gift, o: Partial<GiftLanded> = {}): GiftLanded => ({
  gift,
  region: 'kanto',
  moved: false,
  ...o,
})

const ONE: GiftLanded[] = [land(item('rare-candy', 5))]
const SHINY: GiftLanded[] = [land(mon(25, 20, true), { isNew: true, joinedTeam: true })]
const MIXED: GiftLanded[] = [
  land(item('rare-candy', 10)),
  land(item('ultra-ball', 25), { region: 'johto' }),
  land(mon(147, 30, false, 'hoenn'), { region: 'johto', moved: true, isNew: true }),
  land(mon(133, 25, true), { joinedTeam: true }),
]
const MANY: GiftLanded[] = [
  ...MIXED,
  land(item('master-ball', 1)),
  land(item('potion', 20)),
  land(mon(1, 5)),
  land(mon(4, 5)),
]

type Open = null | 'rules-first' | 'rules-info' | 'one' | 'shiny' | 'mixed' | 'many'

export function GiftBits() {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  const moment =
    open === 'one' ? ONE : open === 'shiny' ? SHINY : open === 'mixed' ? MIXED : open === 'many' ? MANY : null
  return (
    <div className="grid w-full max-w-md gap-3">
      <GiftPresent count={3} wait={null} />
      <GiftPresent count={1} wait={null} onOpen={() => setOpen('mixed')} />
      <GiftPresent count={2} wait={null} onOpen={() => {}} busy />
      <GiftPresent count={2} wait="extreme" />
      <GiftPresent count={1} wait="world" />
      <GiftOpened gifts={MIXED.map((l) => l.gift)} />
      <GiftResult landed={MIXED} onDone={() => {}} />
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen('rules-first')}>
          First gift: rules
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('one')}>
          Open: one item
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('shiny')}>
          Open: a shiny Pikachu
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('mixed')}>
          Open: four things
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('many')}>
          Open: eight things
        </PixelButton>
      </div>
      <InfoButton name="a gift" onClick={() => setOpen('rules-info')} />
      <GiftRulesModal
        open={open === 'rules-first' || open === 'rules-info'}
        onClose={close}
        onGo={open === 'rules-first' ? close : undefined}
      />
      {moment && <GiftMoment key={open} landed={moment} onDone={close} />}
    </div>
  )
}
