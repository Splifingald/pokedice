// Kitchen sink: Trades (docs/23) — who can see a listing, what it wants, its time left, board rows in every state
// (you can trade, a friend's, yours, greyed with why, shiny and NEW, a guest's view), the listing's sheet, the share
// pop-up, the rules (unlock and INFO), the trade scene (plain, shiny, "Trade done!" back Home, a trade evolution) and
// what it ends on (locked too), and the pick of the Box a traded Pokémon goes to (docs/23 §1.4).
import { useState } from 'react'
import { encodeDexSet, type LandingOption, type RegionId, type TradeLogEntry } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { ListingSheet } from '@/components/trades/ListingSheet'
import { ShareListingModal, type Shared } from '@/components/trades/ShareListing'
import { LandingPick, ListingRow, TimeLeft, VisChip, WantTile } from '@/components/trades/TradeBits'
import { TradesRulesModal } from '@/components/trades/TradeRules'
import { LandingStepView, TradeResult, TradeScene } from '@/components/trades/TradeScene'
import type { TradeListing } from '@/lib/trades'
import type { TradeShow } from '@/store/trades'

const HOUR = 3_600_000
const now = Date.now()

const listing = (over: Partial<TradeListing>): TradeListing => ({
  id: `kit-${over.id ?? 'a'}`,
  code: 'K7QM4XD9',
  owner: 'kit-owner',
  name: 'Sora',
  avatar: 'red',
  isMe: false,
  isFriend: false,
  dex: 4,
  level: 12,
  shiny: false,
  homeRegion: 'kanto',
  want: { kind: 'species', dex: 16 },
  visibility: 'public',
  createdAt: now - 10 * HOUR,
  endsAt: now + 50 * HOUR,
  poster: { ...encodeDexSet([1, 4, 7]), shiny: [], regions: ['kanto'] },
  ...over,
})

const ROWS: { l: TradeListing; why: string | null; guest?: boolean }[] = [
  { l: listing({ id: 'can' }), why: null },
  { l: listing({ id: 'fr', name: 'Misty', isFriend: true, dex: 54, want: { kind: 'notOwned' } }), why: null },
  {
    l: listing({ id: 'me', isMe: true, name: 'Red', dex: 133, want: { kind: 'any' }, visibility: 'friends' }),
    why: null,
  },
  {
    l: listing({ id: 'no', dex: 63, want: { kind: 'species', dex: 93 }, endsAt: now + 3 * HOUR }),
    why: 'You have no Haunter',
  },
  { l: listing({ id: 'jo', dex: 158, shiny: true, homeRegion: 'johto' }), why: 'Start Johto first' },
  { l: listing({ id: 'gu', dex: 25, want: { kind: 'any' } }), why: null, guest: true },
]

const entry = (over: Partial<TradeLogEntry>): TradeLogEntry => ({
  id: `kit-log-${over.id ?? 'a'}`,
  at: now,
  role: 'taker',
  with: 'Sora',
  gave: { dex: 16, level: 22 },
  got: { dex: 4, level: 22 },
  outcome: 'new',
  ...over,
})

// The share modal for each kind of want, and a shiny: its message names them all.
const SHARES: { label: string; share: Shared }[] = [
  {
    label: 'Share (private, any new)',
    share: {
      code: 'K7QM4XD9',
      dex: 4,
      level: 12,
      shiny: false,
      want: { kind: 'notOwned' },
      visibility: 'private',
    },
  },
  {
    label: 'Share (shiny, for a species)',
    share: {
      code: 'P3WX8NHT',
      dex: 25,
      level: 32,
      shiny: true,
      want: { kind: 'species', dex: 447 },
      visibility: 'public',
    },
  },
  {
    label: 'Share (friends, any)',
    share: {
      code: 'B6RJ2ZQF',
      dex: 133,
      level: 20,
      shiny: false,
      want: { kind: 'any' },
      visibility: 'friends',
    },
  },
]

const SCENES: { label: string; show: TradeShow }[] = [
  {
    label: 'Pikachu for Totodile',
    show: {
      entry: entry({ id: 'x', gave: { dex: 25, level: 30 }, got: { dex: 158, level: 30 } }),
      isNew: true,
    },
  },
  {
    label: 'A shiny arrives',
    show: {
      entry: entry({
        id: 'sh',
        gave: { dex: 16, level: 18 },
        got: { dex: 133, level: 18, shiny: true },
        outcome: 'shiny',
      }),
      isNew: true,
    },
  },
  {
    label: 'Trade done! (back Home)',
    show: {
      entry: entry({ id: 'aw', role: 'poster', gave: { dex: 16, level: 12 }, got: { dex: 8, level: 16 } }),
      away: true,
    },
  },
  {
    label: 'Kadabra arrives, evolves',
    show: {
      entry: entry({ id: 'ev', gave: { dex: 129, level: 22 }, got: { dex: 64, level: 22 }, evolvedTo: 65 }),
      isNew: true,
    },
  },
  {
    label: 'Nicknames both ways',
    show: {
      entry: entry({
        id: 'nn',
        gave: { dex: 25, level: 24, nickname: 'Sparky' },
        got: { dex: 7, level: 24, nickname: 'Bubbles' },
      }),
      isNew: true,
    },
  },
]

const RESULTS: { label: string; show: TradeShow }[] = [
  {
    label: 'Raised to its minimum, NEW',
    show: {
      entry: entry({ id: 'r1', gave: { dex: 4, level: 12 }, got: { dex: 8, level: 16 } }),
      isNew: true,
    },
  },
  {
    label: 'Capped, replaced',
    show: {
      entry: entry({
        id: 'r2',
        gave: { dex: 6, level: 70 },
        got: { dex: 16, level: 50 },
        outcome: 'replaced',
      }),
      mine: 31,
    },
  },
  {
    label: 'Came with its nickname',
    show: { entry: entry({ id: 'r4', got: { dex: 7, level: 24, nickname: 'Bubbles' } }), isNew: true },
  },
  {
    label: 'Merged: nothing gained',
    show: { entry: entry({ id: 'r3', got: { dex: 19, level: 22 }, outcome: 'merged' }), mine: 40 },
  },
  {
    label: 'Locked: above your best there',
    show: {
      entry: entry({ id: 'r5', got: { dex: 25, level: 30 }, outcome: 'locked', region: 'johto' }),
      isNew: true,
    },
  },
]

/** The Box pick's rows: one in each state (joins NEW, STRONGER, nothing gained, locked, a shiny). */
const LANDINGS: LandingOption[] = [
  { region: 'kanto', outcome: 'merged', isNew: false, mine: 34, best: 52 },
  { region: 'johto', outcome: 'replaced', isNew: false, mine: 12, best: 40 },
  { region: 'hoenn', outcome: 'new', isNew: true, mine: null, best: 31 },
  { region: 'sinnoh', outcome: 'locked', isNew: true, mine: null, best: 9 },
]
const SHINY_LANDINGS: LandingOption[] = [
  { region: 'kanto', outcome: 'shiny', isNew: false, mine: 34, best: 52 },
  { region: 'johto', outcome: 'locked', isNew: true, mine: null, best: 18 },
]

export function TradeKitBits() {
  const [scene, setScene] = useState<TradeShow | null>(null)
  const [open, setOpen] = useState<TradeListing | null>(null)
  const [share, setShare] = useState<Shared | null>(null)
  const [rules, setRules] = useState<null | 'unlock' | 'info'>(null)
  const [landing, setLanding] = useState<RegionId | null>('hoenn')
  return (
    <div className="grid w-full max-w-2xl gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <VisChip visibility="public" />
        <VisChip visibility="friends" />
        <VisChip visibility="private" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <WantTile want={{ kind: 'species', dex: 7 }} />
        <WantTile want={{ kind: 'notOwned' }} />
        <WantTile want={{ kind: 'notOwned' }} big />
        <WantTile want={{ kind: 'any' }} />
        <WantTile want={{ kind: 'species', dex: 150 }} big />
      </div>
      <div className="grid max-w-sm gap-1.5">
        <TimeLeft endsAt={now + 60 * HOUR} days={3} prefix />
        <TimeLeft endsAt={now + 5 * HOUR + 5 * 60_000} days={3} />
        <TimeLeft endsAt={now + 20 * 60_000} days={3} />
      </div>
      <ul className="m-0 grid max-w-[460px] list-none gap-1.5 p-0">
        {ROWS.map(({ l, why, guest }) => (
          <ListingRow key={l.id} listing={l} why={why} guest={guest} onOpen={() => setOpen(l)} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {SCENES.map((s) => (
          <PixelButton key={s.label} size="sm" onClick={() => setScene(s.show)}>
            {s.label}
          </PixelButton>
        ))}
        {SHARES.map((s) => (
          <PixelButton key={s.label} size="sm" onClick={() => setShare(s.share)}>
            {s.label}
          </PixelButton>
        ))}
        <PixelButton size="sm" onClick={() => setRules('unlock')}>
          Trades open
        </PixelButton>
      </div>
      <InfoButton name="Trades" onClick={() => setRules('info')} />
      <div className="grid gap-3 sm:grid-cols-3">
        {RESULTS.map((r) => (
          <div key={r.label} className="grid gap-1 bg-panel p-2 shadow-ring-line">
            <small className="font-pixel-sm text-[13px] text-muted">{r.label}</small>
            <TradeResult show={r.show} />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1 bg-panel p-2 shadow-ring-line">
          <small className="font-pixel-sm text-[13px] text-muted">Pick its Box (the scene's last step)</small>
          <LandingStepView
            name="Pikachu"
            dex={25}
            shiny={false}
            level={22}
            options={LANDINGS}
            value={landing}
            onChange={setLanding}
            onSend={() => setLanding(null)}
          />
        </div>
        <div className="grid content-start gap-2 bg-panel p-2 shadow-ring-line">
          <small className="font-pixel-sm text-[13px] text-muted">
            A shiny, nothing picked; disabled (trading)
          </small>
          <LandingPick name="Eevee" level={25} options={SHINY_LANDINGS} value={null} onChange={() => {}} />
          <LandingPick
            name="Eevee"
            level={25}
            options={SHINY_LANDINGS}
            value="kanto"
            onChange={() => {}}
            disabled
          />
        </div>
      </div>
      <ListingSheet listing={open} onClose={() => setOpen(null)} />
      <ShareListingModal listing={share} onClose={() => setShare(null)} />
      <TradesRulesModal
        open={!!rules}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
      <TradeScene show={scene} onDone={() => setScene(null)} />
    </div>
  )
}
