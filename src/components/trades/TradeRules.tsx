// Trades' rules (docs/15 §20, docs/23): the special events' pop-up, once when trades open to the player, then from
// the INFO button at the bottom of the Trades page. The numbers come from the config, so a rebalance shows up here.
import { tradeCfg } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { RulesModal, type RuleRow } from '../RulesModal'
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
