// The Day Care's and Versus's rules (docs/15), in the special events' pop-up: once when each opens, then from the INFO
// button at the bottom of its page. The numbers come from the config, so a rebalance shows up in the text.
import { leagueConfig, versusLeagueFor, VERSUS_LEVEL, VERSUS_TEAM_SIZE, winTrophies } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { visitDayCare } from '@/store/actions'
import { useGame } from '@/store/game'
import { EggSprite } from './EggSprite'
import { RulesCard } from './RulesCard'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'

/** The Day Care's yard, framed on the whole cottage, chimney to fence. */
export const DAY_CARE_PICTURE: RulesPicture = { src: artUrl('daycare'), focus: '50% 27%' }
/** Versus's stadium at night, framed like Home's widget (on the crowd and the centre circle). */
export const VERSUS_PICTURE: RulesPicture = { src: '/backgrounds/versus.png', focus: '50% 75%' }

export function useDayCareRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = data.config.dayCare
  const lv = (n: number) => t('ui.common.level.short', { n })
  return [
    {
      icon: 'heart',
      title: t('ui.rules.dc.train.title'),
      text: t('ui.rules.dc.train.text', {
        slots: cfg.slots,
        xp: cfg.xpPerTick,
        minutes: cfg.tickMinutes,
        max: lv(data.config.maxLevel),
      }),
    },
    {
      icon: <EggSprite size={20} />,
      title: t('ui.rules.dc.eggs.title'),
      text: t('ui.rules.dc.eggs.text', {
        h: cfg.breedHours,
        d: cfg.breedDittoHours,
        ditto: data.species[132]?.name ?? 'Ditto',
      }),
    },
    {
      icon: 'friends',
      title: t('ui.rules.dc.friends.title'),
      text: t('ui.rules.dc.friends.text', { n: cfg.friendSlots }),
    },
    {
      icon: 'coin',
      title: t('ui.rules.dc.rush.title'),
      text: t('ui.rules.dc.rush.text', {
        price: money(cfg.rushPrice),
        odds: cfg.shinyChance > 0 ? Math.round(1 / cfg.shinyChance) : '∞',
      }),
    },
  ]
}

export function useVersusRules(): RuleRow[] {
  const { t } = useT()
  const league = useGame((s) => !!s.save && versusLeagueFor(s.save, s.data))
  const data = useGame((s) => s.data)
  const level = t('ui.common.level.short', { n: VERSUS_LEVEL })
  if (league) {
    // The weekly league (docs/44): its numbers from the config.
    const cfg = leagueConfig(data)
    const a = winTrophies(1, cfg)
    const b = winTrophies(2, cfg)
    const c = winTrophies(3, cfg)
    return [
      {
        icon: 'calendar',
        title: t('ui.rules.league.week.title'),
        text: t('ui.rules.league.week.text', { size: cfg.groupSize }),
      },
      {
        icon: 'sword',
        title: t('ui.rules.league.fight.title'),
        text: t('ui.rules.league.fight.text', { level }),
      },
      {
        icon: 'trophy',
        title: t('ui.rules.league.trophies.title'),
        text: t('ui.rules.league.trophies.text', { a, b, c, safe: cfg.safeBelow }),
      },
      {
        icon: 'gift',
        title: t('ui.rules.league.rewards.title'),
        text: t('ui.rules.league.rewards.text', { gold: cfg.goldPerTrophy }),
      },
    ]
  }
  return [
    {
      icon: 'shield',
      title: t('ui.rules.vs.team.title'),
      text: t('ui.rules.vs.team.text', { n: VERSUS_TEAM_SIZE, level }),
    },
    { icon: 'vs', title: t('ui.rules.vs.fair.title'), text: t('ui.rules.vs.fair.text', { level }) },
    { icon: 'sword', title: t('ui.rules.vs.auto.title'), text: t('ui.rules.vs.auto.text') },
    { icon: 'trophy', title: t('ui.rules.vs.board.title'), text: t('ui.rules.vs.board.text') },
  ]
}

/**
 * The Day Care's rules where they apply (docs/43 §7): a card at the top of its panel on the first visit, the same rows
 * as the INFO button's pop-up; GOT IT marks the Day Care visited, for good.
 */
export function DayCareRulesCard() {
  const { t } = useT()
  const rules = useDayCareRules()
  return <RulesCard title={t('ui.home.dayCare')} icon="heart" rules={rules} onDone={visitDayCare} />
}

/** The Day Care's rules, from its page's INFO button (the same rows as the first visit's card). */
export function DayCareRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useDayCareRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.home.dayCare')}
      picture={DAY_CARE_PICTURE}
      icon="heart"
      rules={rules}
      onGo={onGo}
    />
  )
}

export function VersusRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useVersusRules()
  const league = useGame((s) => !!s.save && versusLeagueFor(s.save, s.data))
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t(league ? 'ui.league.title' : 'ui.versus.title')}
      picture={VERSUS_PICTURE}
      icon="vs"
      rules={rules}
      onGo={onGo}
    />
  )
}
