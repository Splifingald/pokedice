// Kitchen sink: friend invite rewards (docs/15 §25) — the gauge in every state (nothing yet, on the way, a reward
// ready, one opened and the next ahead, every reward won, a tier holding several gifts), the Friends page's card (ready
// with OPEN IT, asking the server, every reward won), the compact gauge of Prof. Oak's invite, the reward's pop-up
// (with who did it, and without), the rules (the first time and INFO), and the opening, the gifts' own.
import { useState } from 'react'
import {
  DEFAULT_CONFIG,
  GIFT_LATEST,
  inviteGauge,
  type GameData,
  type GiftLanded,
  type InviteStatus,
} from '@/engine'
import { GiftMoment } from '@/components/Gifts'
import {
  InviteGaugeBar,
  InviteGaugeCompact,
  InviteReadyModal,
  InviteRewardsCard,
  InviteRulesModal,
} from '@/components/friends/InviteRewards'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { useGame } from '@/store/game'

const status = (count: number, claimed: number[] = [], pending = 0): InviteStatus => ({
  count,
  pending,
  claimed,
  latest: count ? { name: 'Misty', avatar: 'green' } : null,
})

/** The game's data with the default tiers, or with a tier of several gifts (the admin can set up to six). */
const withTiers = (data: GameData, many: boolean): GameData => {
  const tiers = DEFAULT_CONFIG.inviteRewards.tiers
  return {
    ...data,
    config: {
      ...data.config,
      inviteRewards: {
        access: 'all',
        tiers: many
          ? [
              ...tiers,
              {
                friends: 6,
                gifts: [
                  { kind: 'pokemon', dex: 25, level: 20, shiny: true, region: GIFT_LATEST },
                  { kind: 'item', key: 'rare-candy', qty: 10, region: GIFT_LATEST },
                ],
              },
              { friends: 10, gifts: [{ kind: 'gold', amount: 50000, region: GIFT_LATEST }] },
            ]
          : tiers,
      },
    },
  }
}

const DITTO: GiftLanded[] = [
  {
    gift: { kind: 'pokemon', dex: 132, level: 10, shiny: true, region: GIFT_LATEST },
    region: 'kanto',
    moved: false,
    isNew: true,
  },
]

type Open = null | 'rules-first' | 'rules-info' | 'ready' | 'ready-anon' | 'moment'

export function InviteBits() {
  const real = useGame((s) => s.data)
  const data = withTiers(real, false)
  const many = withTiers(real, true)
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  const g = (s: InviteStatus, d = data) => inviteGauge(s, d)
  const label = 'font-pixel-sm text-[16px] text-muted'
  return (
    <div className="grid w-full max-w-md gap-3">
      <p className={label}>Nothing yet · on the way (1 pending)</p>
      <InviteGaugeBar gauge={g(status(0))} />
      <InviteGaugeBar gauge={g(status(1, [], 1))} />
      <p className={label}>Two reached, one opened · all opened · six tiers, one with two gifts</p>
      <InviteGaugeBar gauge={g(status(2, [1]))} />
      <InviteGaugeBar gauge={g(status(4, [1, 2, 3, 4]))} />
      <InviteGaugeBar gauge={g(status(5, [1, 2, 3, 4], 2), many)} />
      <p className={label}>The Friends page’s card: ready · asking the server · every reward won</p>
      <InviteRewardsCard gauge={g(status(3, [1], 1))} onOpen={() => setOpen('moment')} />
      <InviteRewardsCard gauge={g(status(1))} onOpen={() => {}} busy />
      <InviteRewardsCard gauge={g(status(4, [1, 2, 3, 4]))} />
      <InviteRewardsCard gauge={g(status(0, [], 0))} />
      <p className={label}>Prof. Oak’s invite</p>
      <InviteGaugeCompact gauge={g(status(1, [1], 2))} />
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen('rules-first')}>
          Rules: the first time
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('ready')}>
          A reward is ready
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('ready-anon')}>
          Ready (no name)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('moment')}>
          Open: a shiny Ditto
        </PixelButton>
      </div>
      <InfoButton name="invite rewards" onClick={() => setOpen('rules-info')} />
      <InviteRulesModal
        open={open === 'rules-first' || open === 'rules-info'}
        onClose={close}
        onGo={open === 'rules-first' ? close : undefined}
      />
      <InviteReadyModal
        open={open === 'ready' || open === 'ready-anon'}
        gauge={g(status(3, [1, 2]))}
        latest={open === 'ready' ? { name: 'Misty', avatar: 'green' } : null}
        onLater={close}
        onOpen={() => setOpen('moment')}
      />
      {open === 'moment' && <GiftMoment landed={DITTO} onDone={close} source="invite" />}
    </div>
  )
}
