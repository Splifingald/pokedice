// The battle powers' rules (docs/15 §20, docs/35): Mega Evolution's gems, Gigantamax and Z-Moves. Each pops up once,
// when its badge is won with its switch on (queued behind the other one-time pop-ups), then from its INFO button (the
// Mart's Mega Gems for Mega Evolution, the Pokémon sheet for all three). The numbers come from the config.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dayCareTutorialDue,
  donationDue,
  eventUnlockDue,
  extremeRulesDue,
  generalRulesDue,
  getRegion,
  giftRulesDue,
  inviteRulesDue,
  leaderboardTutorialDue,
  powerHome,
  powerLeader,
  portalRulesDue,
  powerRulesDue,
  regionCaseOf,
  regionOfferDue,
  trickRulesDue,
  tradeRulesDue,
  versusRulesDue,
  type GameData,
  type PowerKind,
} from '@/engine'
import { artUrl, pictureOf } from '@/fx/areaArt'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { markPowerRulesSeen } from '@/store/actions'
import { useGame } from '@/store/game'
import { InfoButton, RulesModal, type RuleRow, type RulesPicture } from './RulesModal'

const TITLE: Record<PowerKind, string> = {
  mega: 'ui.powers.mega.title',
  gmax: 'ui.powers.gmax.title',
  z: 'ui.powers.z.title',
}

/** The picture of the area whose leader opens the power (Shalour City, Motostoke, Brooklet Hill); the Frontier else. */
export function powerPicture(data: GameData, kind: PowerKind): RulesPicture {
  const home = powerHome(data, kind)
  const badge = regionCaseOf(data, home.region, [], false)?.badges[home.badge - 1]
  const pic = badge ? pictureOf(badge.areaId) : null
  return { src: pic?.url ?? artUrl('frontier'), focus: '50% 45%' }
}

export function usePowerRules(kind: PowerKind): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const home = powerHome(data, kind)
  const open: RuleRow = {
    icon: 'badge',
    title: t('ui.rules.powers.open.title', { leader: powerLeader(data, kind) }),
    text: t('ui.rules.powers.open.text', {
      leader: powerLeader(data, kind),
      region: getRegion(data, home.region)?.name ?? home.region,
    }),
  }
  if (kind === 'mega') {
    const cfg = data.config.megaEvolution.gems
    const [first, ...later] = cfg.rewards
    const gem = (key: string) => data.items[key]?.name ?? key
    const price = Object.values(data.items).find((i) => i.effect.kind === 'megaGem')?.price ?? 0
    return [
      open,
      {
        icon: 'sparkle',
        title: t('ui.rules.mega.gem.title'),
        text: [
          first
            ? t('ui.rules.mega.gem.first', { leader: powerLeader(data, 'mega'), gem: gem(first.gem) })
            : '',
          later.length
            ? t('ui.rules.mega.gem.later', {
                badges: joinList(later.map((r) => String(r.badge))),
                gems: joinList(later.map((r) => gem(r.gem))),
              })
            : '',
          t('ui.rules.mega.gem.shop', { price: money(price) }),
        ]
          .filter(Boolean)
          .join(' '),
      },
      {
        icon: 'up',
        title: t('ui.rules.mega.turns.title', { n: cfg.turns }),
        text: t('ui.rules.mega.turns.text', { n: cfg.turns }),
      },
      { icon: 'vs', title: t('ui.rules.powers.auto.title'), text: t('ui.rules.mega.auto.text') },
    ]
  }
  if (kind === 'gmax') {
    const b = data.config.gigantamax.boost
    const turns = data.config.gigantamax.turns
    return [
      open,
      {
        icon: 'up',
        title: t('ui.rules.gmax.boost.title', { dice: b.dice, heal: b.healPercent }),
        text: t(`ui.rules.gmax.boost.text.${turns === 1 ? 'one' : 'other'}`, {
          dice: b.dice,
          heal: b.healPercent,
          n: turns,
        }),
      },
      { icon: 'vs', title: t('ui.rules.powers.auto.title'), text: t('ui.rules.gmax.auto.text') },
    ]
  }
  const z = data.config.zMove
  return [
    open,
    {
      icon: 'sword',
      title: t('ui.rules.z.types.title'),
      text: t('ui.rules.z.types.text', {
        freeze: z.freezeChance,
        paralyze: z.paralyzeChance,
        burn: z.burnStacks,
        heal: z.healPercent,
        reckless: z.recklessPercent,
        back: z.recklessRecoilPercent,
        power: z.damagePercent,
      }),
    },
    { icon: 'dice', title: t('ui.rules.z.once.title'), text: t('ui.rules.z.once.text') },
    { icon: 'vs', title: t('ui.rules.powers.auto.title'), text: t('ui.rules.z.auto.text') },
  ]
}

export function PowerRulesModal({
  kind,
  open,
  onClose,
  onGo,
}: {
  kind: PowerKind
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const rules = usePowerRules(kind)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t(TITLE[kind])}
      picture={powerPicture(data, kind)}
      icon={kind === 'z' ? 'sword' : 'up'}
      rules={rules}
      onGo={onGo}
    />
  )
}

/** INFO under a power (the Mart's Mega Gems, the Pokémon sheet): its rules again. */
export function PowerInfo({ kind, className }: { kind: PowerKind; className?: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <InfoButton name={t(TITLE[kind])} onClick={() => setOpen(true)} className={className} />
      <PowerRulesModal kind={kind} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * A power has opened (its badge won, its switch on): once, between fights, its rules. Mega Evolution's Let's go! leads
 * to the Mart, where the gems are; the others' close it. It waits behind every other one-time pop-up.
 */
export function PowersUnlockPopup() {
  const navigate = useNavigate()
  const kind = useGame((s) =>
    !s.save ||
    dayCareTutorialDue(s.save, s.data) ||
    leaderboardTutorialDue(s.save, s.data) ||
    donationDue(s.save, s.data) ||
    regionOfferDue(s.save, s.data) ||
    eventUnlockDue(s.save, s.data) ||
    versusRulesDue(s.save, s.data) ||
    extremeRulesDue(s.save, s.data) ||
    generalRulesDue(s.save, s.data) ||
    !!portalRulesDue(s.save, s.data) ||
    trickRulesDue(s.save, s.data) ||
    giftRulesDue(s.save, s.data) ||
    inviteRulesDue(s.save, s.data) ||
    (s.auth.status === 'signed_in' && tradeRulesDue(s.save, s.data))
      ? null
      : powerRulesDue(s.save, s.data),
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  if (!kind) return null
  const seen = () => markPowerRulesSeen(kind)
  return (
    <PowerRulesModal
      kind={kind}
      open={idle}
      onClose={seen}
      onGo={() => {
        seen()
        if (kind === 'mega') navigate('/shop')
      }}
    />
  )
}
