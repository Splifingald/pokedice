// Kitchen sink (dev only): friendship streaks and the Friend Market (docs/57) — the coins plate, a streak badge kept
// and waiting, the tiers' ladder at each tier, today's gauge (empty, midway, capped), the Friendship card (loading,
// failed, no streak, streaks waiting), a friend's streak (none, waiting, kept, at the top, after a lost one), the
// market's shiny of the week (to buy, too poor, sold out), its items (to buy, short, sold out), its plate, the rules
// card and INFO, and a purchase's opening.
import { useState, type ReactNode } from 'react'
import { DEFAULT_CONFIG, marketRows, type FriendStreak, type GiftLanded } from '@/engine'
import {
  CapGauge,
  CoinPlate,
  FriendshipCard,
  FriendshipRulesModal,
  FriendStreakBlock,
  MarketHead,
  MarketItemCard,
  MarketShinyCard,
  StreakBadge,
  StreakLadder,
  useFriendshipRules,
} from '@/components/friends/Friendship'
import { GiftMoment } from '@/components/Gifts'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { RulesCard } from '@/components/RulesCard'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

const TODAY = '2026-11-04'
const YESTERDAY = '2026-11-03'
const WEEK = '2026-11-02'
const F = {
  misty: '22222222-0000-4000-8000-000000000002',
  brock: '22222222-0000-4000-8000-000000000003',
  erika: '22222222-0000-4000-8000-000000000004',
  leaf: '22222222-0000-4000-8000-000000000005',
}
const FRIENDS = [
  { userId: F.misty, name: 'Misty' },
  { userId: F.brock, name: 'Brock' },
  { userId: F.erika, name: 'Erika', rich: true },
  { userId: F.leaf, name: 'Leaf' },
]
const streak = (friend: string, n: number, lastDay: string, best = n): FriendStreak => ({
  friend,
  streak: n,
  best,
  lastDay,
  lastKind: 'raid',
})
const STREAKS: FriendStreak[] = [
  streak(F.misty, 12, YESTERDAY),
  streak(F.brock, 3, TODAY),
  streak(F.erika, 34, YESTERDAY),
  streak(F.leaf, 5, '2026-10-30', 9),
]

function Frame({ name, children, w = 'max-w-[460px]' }: { name: string; children: ReactNode; w?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className={`w-full ${w}`}>{children}</div>
    </div>
  )
}

export function FriendshipBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [info, setInfo] = useState(false)
  const [moment, setMoment] = useState(false)
  const [rulesSeen, setRulesSeen] = useState(false)
  const rules = useFriendshipRules()
  // The kitchen sink reads the game's own numbers, the switch aside.
  const kData = {
    ...data,
    config: { ...data.config, friendship: data.config.friendship ?? DEFAULT_CONFIG.friendship },
  }
  const fresh = marketRows(kData, WEEK)
  const bought = marketRows(kData, WEEK, { shiny: 1, 'rare-candy': 8, 'talent-candy': 2 })
  const shiny = fresh.find((r) => r.kind === 'pokemon')
  const shinyOut = bought.find((r) => r.kind === 'pokemon')
  const nop = () => {}
  const landed: GiftLanded[] = [
    {
      gift: { kind: 'pokemon', dex: shiny?.dex ?? 175, level: 15, shiny: true, region: 'latest' },
      region: 'kanto',
      moved: false,
      isNew: true,
    },
  ] as GiftLanded[]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Frame name="Coins: sm, md, lg" w="w-auto">
          <span className="flex items-center gap-2">
            <CoinPlate n={7} size="sm" />
            <CoinPlate n={128} />
            <CoinPlate n={1240} size="lg" />
          </span>
        </Frame>
        <Frame name="Streak badge: kept, waiting, lost (nothing)" w="w-auto">
          <span className="flex items-center gap-4 p-2">
            <StreakBadge streak={3} state="kept" />
            <StreakBadge streak={12} state="waiting" />
            <StreakBadge streak={5} state="lost" />
          </span>
        </Frame>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Frame name="Ladder: day 2 (Friends)">
          <StreakLadder streak={2} data={kData} />
        </Frame>
        <Frame name="Ladder: day 9 (Great friends)">
          <StreakLadder streak={9} data={kData} />
        </Frame>
        <Frame name="Ladder: day 40 (Best friends)">
          <StreakLadder streak={40} data={kData} />
        </Frame>
        <Frame name="Today: empty, midway, capped">
          <div className="grid gap-2">
            <CapGauge earned={0} cap={50} />
            <CapGauge earned={23} cap={50} />
            <CapGauge earned={50} cap={50} />
          </div>
        </Frame>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Frame name="Friendship card: streaks waiting">
          <FriendshipCard
            balance={186}
            earned={11}
            streaks={STREAKS}
            friends={FRIENDS}
            today={TODAY}
            onMarket={nop}
            onInfo={() => setInfo(true)}
          />
        </Frame>
        <Frame name="Friendship card: no streak yet">
          <FriendshipCard
            balance={0}
            earned={0}
            streaks={[]}
            friends={FRIENDS}
            today={TODAY}
            onMarket={nop}
            onInfo={nop}
          />
        </Frame>
        <Frame name="Friendship card: loading">
          <FriendshipCard
            balance={0}
            earned={0}
            streaks={[]}
            friends={[]}
            today={TODAY}
            state="loading"
            onMarket={nop}
            onInfo={nop}
          />
        </Frame>
        <Frame name="Friendship card: failed">
          <FriendshipCard
            balance={0}
            earned={0}
            streaks={[]}
            friends={[]}
            today={TODAY}
            state="error"
            onMarket={nop}
            onInfo={nop}
          />
        </Frame>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Frame name="A friend's streak: waiting today">
          <FriendStreakBlock s={STREAKS[0]} today={TODAY} name="Misty" />
        </Frame>
        <Frame name="A friend's streak: kept today">
          <FriendStreakBlock s={STREAKS[1]} today={TODAY} name="Brock" />
        </Frame>
        <Frame name="A friend's streak: at the top">
          <FriendStreakBlock s={{ ...STREAKS[2]!, lastDay: TODAY }} today={TODAY} name="Erika" />
        </Frame>
        <Frame name="A friend's streak: lost (best kept)">
          <FriendStreakBlock s={STREAKS[3]} today={TODAY} name="Leaf" />
        </Frame>
        <Frame name="A friend's streak: none yet">
          <FriendStreakBlock s={undefined} today={TODAY} name="Leaf" />
        </Frame>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Frame name="Market plate">
          <MarketHead balance={186} restock="4d 6h" />
        </Frame>
        <div />
        {shiny && (
          <Frame name="Shiny of the week: to buy">
            <MarketShinyCard row={shiny} balance={186} busy={false} onBuy={nop} restock="Next one in 4d 6h" />
          </Frame>
        )}
        {shiny && (
          <Frame name="Shiny of the week: too poor">
            <MarketShinyCard row={shiny} balance={40} busy={false} onBuy={nop} restock="Next one in 4d 6h" />
          </Frame>
        )}
        {shinyOut && (
          <Frame name="Shiny of the week: sold out">
            <MarketShinyCard
              row={shinyOut}
              balance={186}
              busy={false}
              onBuy={nop}
              restock="Next one in 4d 6h"
            />
          </Frame>
        )}
      </div>
      <Frame name="Items: to buy · 2 left (×1 only) · sold out" w="max-w-[920px]">
        <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
          {fresh
            .filter((r) => r.kind === 'item')
            .map((r) => (
              <MarketItemCard key={`a${r.key}`} row={r} balance={186} busy={false} onBuy={nop} />
            ))}
          {bought
            .filter((r) => r.kind === 'item' && r.key !== 'friend-ball')
            .map((r) => (
              <MarketItemCard key={`b${r.key}`} row={r} balance={20} busy={false} onBuy={nop} />
            ))}
        </ul>
      </Frame>
      <div className="grid gap-3 md:grid-cols-2">
        <Frame name="Rules card (first visit)">
          {rulesSeen ? (
            <PixelButton size="sm" onClick={() => setRulesSeen(false)}>
              Show it again
            </PixelButton>
          ) : (
            <RulesCard
              title={t('ui.fship.title')}
              icon="heart"
              rules={rules}
              onDone={() => setRulesSeen(true)}
            />
          )}
        </Frame>
        <Frame name="INFO and a purchase's opening">
          <div className="grid gap-2">
            <InfoButton name={t('ui.fship.title')} onClick={() => setInfo(true)} />
            <PixelButton size="sm" onClick={() => setMoment(true)}>
              Play the opening
            </PixelButton>
          </div>
        </Frame>
      </div>
      <FriendshipRulesModal open={info} onClose={() => setInfo(false)} />
      {moment && <GiftMoment landed={landed} source="market" onDone={() => setMoment(false)} />}
    </div>
  )
}
