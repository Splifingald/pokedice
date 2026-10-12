// Trades' rules (docs/15 §20, docs/23): the special events' pop-up, once when trades open to the player, then from
// the INFO button at the bottom of the Trades page. The numbers come from the config, so a rebalance shows up here.
import { useLocation, useNavigate } from 'react-router-dom'
import {
  dayCareTutorialDue,
  donationDue,
  eventUnlockDue,
  leaderboardTutorialDue,
  regionOfferDue,
  tradeCfg,
  tradeRulesDue,
  versusRulesDue,
} from '@/engine'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { seeTradeRules } from '@/store/trades'
import { RulesModal, type RuleRow } from '../RulesModal'
import { useSharePromptWaiting } from '../ShareTutorial'
import { MiniSprite } from '../SpriteImg'
import { TRADES_PICTURE } from './TradeBits'

export function useTradesRules(): RuleRow[] {
  const { t, tPlural } = useT()
  const data = useGame((s) => s.data)
  const cfg = tradeCfg(data)
  // The trade evolutions by name, from the admin's list: "Kadabra, Machoke, Graveler…".
  const evos = cfg.evolveOnTrade
    .map(([from]) => data.species[from]?.name)
    .filter((n): n is string => !!n)
    .slice(0, 3)
  return [
    {
      icon: 'trade',
      title: t('ui.rules.tr.list.title'),
      text: t('ui.rules.tr.list.text', {
        n: cfg.maxListings,
        days: tPlural('ui.trades.days', cfg.listingDays),
      }),
    },
    {
      icon: 'up',
      title: t('ui.rules.tr.level.title'),
      text: t('ui.rules.tr.level.text', { level: t('ui.common.level.short', { n: cfg.levelCap }) }),
    },
    {
      icon: <MiniSprite dex={4} size={24} />,
      title: t('ui.rules.tr.lose.title'),
      text: t('ui.rules.tr.lose.text'),
    },
    ...(evos.length
      ? [
          {
            icon: <MiniSprite dex={cfg.evolveOnTrade[0]![0]} size={24} />,
            title: t('ui.rules.tr.evolve.title', { names: evos.join(t('ui.common.listSep')) }),
            text: t('ui.rules.tr.evolve.text'),
          },
        ]
      : []),
  ]
}

export function TradesRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useTradesRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.trades.title')}
      picture={TRADES_PICTURE}
      icon="trade"
      rules={rules}
      onGo={onGo}
    />
  )
}

/**
 * Trades have opened to this player (signed in, the switch on, enough badges): once, between fights, the rules and a
 * button straight to them. It waits its turn behind Prof. Oak's tutorials and invite, and the other one-time pop-ups.
 */
export function TradesUnlockPopup() {
  const navigate = useNavigate()
  const onTrades = useLocation().pathname.startsWith('/trades')
  const due = useGame(
    (s) =>
      isSupabaseConfigured &&
      s.auth.status === 'signed_in' &&
      !!s.save &&
      tradeRulesDue(s.save, s.data) &&
      !dayCareTutorialDue(s.save, s.data) &&
      !leaderboardTutorialDue(s.save, s.data) &&
      !donationDue(s.save, s.data) &&
      !regionOfferDue(s.save, s.data) &&
      !eventUnlockDue(s.save, s.data) &&
      !versusRulesDue(s.save, s.data),
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  // Prof. Oak's invite comes at the same 2nd badge: it goes first.
  const invite = useSharePromptWaiting()
  if (!due || invite) return null
  return (
    <TradesRulesModal
      open={idle && !onTrades}
      onClose={seeTradeRules}
      onGo={() => {
        seeTradeRules()
        navigate('/trades')
      }}
    />
  )
}
