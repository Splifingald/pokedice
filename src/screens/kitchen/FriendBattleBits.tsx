// Kitchen sink (dev only): Friend Battles (docs/65; docs/15 §50) — the shield tag (up, used), the mode tags, the time
// chip (plenty, last seconds) and gauge, the trainers face to face, a challenge to answer, a match on away from its
// page, the challenge sheet, the rules card and INFO, and each step of a match: waiting for the answer, its outcomes,
// the coin (replayable), the draft (your pick, theirs, a species taken), the order (Draft's and Classic's ready, and
// ready, waiting for them). The fight is the battle screen (its plates carry the shield tag).
import { useState, type ReactNode } from 'react'
import { BATTLE_TICKET_KEY, FRIEND_BATTLES_DEFAULTS, type DraftMon, type PvpSide } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { RulesCard } from '@/components/RulesCard'
import { ChallengeSheet } from '@/components/pvp/ChallengeSheet'
import { MarketItemCard } from '@/components/friends/Friendship'
import {
  DropNotice,
  TicketCount,
  TicketsCard,
  FriendBattleRulesModal,
  ModeTag,
  TimeChip,
  TimeGauge,
  useFriendBattleRules,
  VsRow,
} from '@/components/pvp/FriendBattleBits'
import { ChallengeCard, MatchOnCard } from '@/components/pvp/FriendBattlesService'
import { ShieldTag } from '@/components/pvp/ShieldTag'
import { useT } from '@/i18n/react'
import type { PvpInfo } from '@/lib/pvp'
import { CoinToss, DraftStep, OrderStep, Outcome, WaitingStep } from '@/screens/battles/Live'

const ASH = { id: 'a', name: 'Ash', avatar: 'red' }
const KIRO = { id: 'b', name: 'Kiro', avatar: 'green' }
const mon = (dex: number, level = 60): DraftMon => ({ dex, level, shiny: false })
const CAND = [mon(149, 72), mon(6, 64), mon(65, 58), mon(143, 55), mon(131, 61), mon(135, 54), mon(94, 66)]

function match(over: Partial<PvpInfo>): PvpInfo {
  return {
    id: 999_000 + Math.floor(Math.random() * 1000),
    mode: 'draft',
    level: 50,
    state: 'draft',
    side: 'a',
    a: ASH,
    b: KIRO,
    firstPicker: 'a',
    picks: [],
    cand: CAND,
    team: [],
    foeTeam: null,
    readyA: false,
    readyB: false,
    seq: 0,
    seed: null,
    // Long enough for this heavy page to be read before it runs out.
    deadline: Date.now() + 600_000,
    serverNow: Date.now(),
    foeSeen: Date.now(),
    winner: null,
    reason: null,
    cfg: FRIEND_BATTLES_DEFAULTS,
    ...over,
  }
}
const pick = (side: PvpSide, m: DraftMon) => ({ ...m, side })

function Frame({ name, children, w = 'max-w-[460px]' }: { name: string; children: ReactNode; w?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className={`w-full ${w}`}>{children}</div>
    </div>
  )
}

export function FriendBattleBits() {
  const { t } = useT()
  const rules = useFriendBattleRules()
  const [info, setInfo] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [coin, setCoin] = useState(0)
  const [seen, setSeen] = useState(false)
  // Fixed once, so the steps' clocks run on from a steady deadline.
  const [m] = useState(() => ({
    waiting: match({ state: 'invited', deadline: Date.now() + 98_000 }),
    declined: match({ state: 'declined' }),
    expired: match({ state: 'expired' }),
    coinMine: match({ firstPicker: 'a' }),
    coinTheirs: match({ firstPicker: 'b' }),
    myPick: match({ picks: [pick('a', mon(149, 72)), pick('b', mon(94, 66))] }),
    theirPick: match({
      deadline: Date.now() + 8_000,
      picks: [pick('a', mon(149, 72)), pick('b', mon(94, 66)), pick('a', mon(6, 64))],
    }),
    orderDraft: match({
      state: 'order',
      team: [mon(149, 72), mon(6, 64), mon(135, 54)],
      picks: [
        pick('a', mon(149, 72)),
        pick('b', mon(94, 66)),
        pick('a', mon(6, 64)),
        pick('b', mon(130, 60)),
        pick('a', mon(135, 54)),
        pick('b', mon(68, 58)),
      ],
      readyB: true,
    }),
    classic: match({ state: 'order', mode: 'classic', firstPicker: null, team: [mon(149, 72), mon(9, 61), mon(135, 55)] }),
    classicReady: match({
      state: 'order',
      mode: 'classic',
      level: 100,
      firstPicker: null,
      team: [mon(149, 72), mon(9, 61), mon(135, 55)],
      readyA: true,
    }),
  }))
  const nop = () => {}

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Frame name="Shield tag: up, used" w="w-auto">
          <span className="flex items-center gap-2">
            <ShieldTag />
            <ShieldTag used />
          </span>
        </Frame>
        <Frame name="Mode tags" w="w-auto">
          <span className="flex items-center gap-2">
            <ModeTag mode="classic" />
            <ModeTag mode="draft" />
          </span>
        </Frame>
        <Frame name="Time chip: plenty, last seconds" w="w-auto">
          <span className="flex items-center gap-2">
            <TimeChip seconds={38} />
            <TimeChip seconds={7} />
          </span>
        </Frame>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Frame name="Time gauge: plenty, last seconds">
          <div className="grid gap-2">
            <TimeGauge seconds={98} total={120} label={t('ui.pvp.sent')} />
            <TimeGauge seconds={6} total={30} label={t('ui.pvp.toAnswer')} />
          </div>
        </Frame>
        <Frame name="Face to face (the friend dimmed while you wait)">
          <VsRow me={ASH} foe={KIRO} foeDim />
        </Frame>
        <Frame name="A challenge to answer (the banner, never over a fight)">
          <ChallengeCard from={KIRO} mode="draft" level={100} seconds={77} total={120} onAccept={nop} onNo={nop} />
        </Frame>
        <Frame name="Battle tickets: the count (sm, md, lg), the page's card (2: next at midnight; full; none)">
          <div className="grid gap-2">
            <span className="flex items-center gap-3">
              <TicketCount n={2} size="sm" />
              <TicketCount n={3} />
              <TicketCount n={12} size="lg" />
            </span>
            <TicketsCard tickets={{ balance: 2, cap: 3, daily: 1, nextAt: Date.now() + 5 * 3_600_000 }} onMarket={nop} />
            <TicketsCard tickets={{ balance: 3, cap: 3, daily: 1, nextAt: Date.now() + 5 * 3_600_000 }} onMarket={nop} />
            <TicketsCard tickets={{ balance: 0, cap: 3, daily: 1, nextAt: Date.now() + 47 * 60_000 }} />
          </div>
        </Frame>
        <Frame name="Battle tickets on the Friend Market's shelf: to buy, sold out this week">
          <ul className="m-0 grid list-none gap-2 p-0">
            <MarketItemCard
              row={{ key: BATTLE_TICKET_KEY, kind: 'ticket', price: 10, limit: 10, left: 6 }}
              balance={84}
              busy={false}
              onBuy={nop}
            />
            <MarketItemCard
              row={{ key: BATTLE_TICKET_KEY, kind: 'ticket', price: 10, limit: 10, left: 0 }}
              balance={84}
              busy={false}
              onBuy={nop}
            />
          </ul>
        </Frame>
        <Frame name="The other player lost connection (52 s left before you win)">
          <DropNotice name="Kiro" left={52} total={90} />
        </Frame>
        <Frame name="A match on, away from its page: on, your challenge waiting">
          <div className="grid gap-2">
            <MatchOnCard foe={KIRO} waiting={false} onGo={nop} />
            <MatchOnCard foe={KIRO} waiting onGo={nop} />
          </div>
        </Frame>
      </div>
      <Frame name="The rules card (GOT IT hides it here), INFO, the challenge sheet">
        <div className="grid gap-2">
          {!seen && <RulesCard title={t('ui.pvp.title')} icon="vs" rules={rules} onDone={() => setSeen(true)} />}
          <div className="flex flex-wrap gap-2">
            <InfoButton name={t('ui.pvp.title')} onClick={() => setInfo(true)} compact />
            <PixelButton onClick={() => setSheet(true)}>{t('ui.pvp.battle')}</PixelButton>
          </div>
        </div>
      </Frame>
      <FriendBattleRulesModal open={info} onClose={() => setInfo(false)} />
      <ChallengeSheet
        target={sheet ? { id: 'b', name: 'Kiro', avatar: 'green', record: t('ui.pvp.youLead', { a: 4, b: 3 }) } : null}
        onClose={() => setSheet(false)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Frame name="Waiting for the answer">
          <WaitingStep match={m.waiting} />
        </Frame>
        <Frame name="Outcomes: they said no, no answer">
          <div className="grid gap-2">
            <Outcome match={m.declined} />
            <Outcome match={m.expired} />
          </div>
        </Frame>
        <Frame name="The coin: you pick first (replay)">
          <div className="grid gap-2">
            <CoinToss key={`a${coin}`} match={m.coinMine} onDone={nop} />
            <PixelButton size="sm" onClick={() => setCoin((c) => c + 1)}>
              Replay
            </PixelButton>
          </div>
        </Frame>
        <Frame name="The coin: they pick first">
          <CoinToss key={`b${coin}`} match={m.coinTheirs} onDone={nop} />
        </Frame>
        <Frame name="Draft: your pick (Gengar taken by them)" w="max-w-xl">
          <DraftStep match={m.myPick} inline />
        </Frame>
        <Frame name="Draft: their pick, last seconds" w="max-w-xl">
          <DraftStep match={m.theirPick} inline />
        </Frame>
        <Frame name="Draft: set your order (they're ready; tap two to swap)">
          <OrderStep match={m.orderDraft} inline />
        </Frame>
        <Frame name="Classic: ready to battle?">
          <OrderStep match={m.classic} inline />
        </Frame>
        <Frame name="Classic at Lv.100: ready, waiting for them">
          <OrderStep match={m.classicReady} inline />
        </Frame>
      </div>
    </div>
  )
}
