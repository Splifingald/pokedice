// Welcome-back gifts (docs/56): the words of the developer's message the server writes when a player comes back after
// days away — in the player's language, from the numbers the server put in it (engine/welcomeBack.ts) — and its rules,
// read again from INFO under that message in My messages (docs/15 §20: the message's own line is the rule where it
// happens). The pop-up, the wrapped gift and its opening are the developer's messages' own (ReplyPopup, Gifts).
import { useState } from 'react'
import { welcomeBackCooldown, welcomeBackTiers, type WelcomeBackNote } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { useRewardText } from './friends/InviteRewards'
import { PixelIcon } from './icons'
import { InfoButton, RulesModal, type RuleRow } from './RulesModal'

/** The message's words: how long they were away, then its rule (from how many days, how often). */
export function useWelcomeWords() {
  const { tPlural } = useT()
  return (note: WelcomeBackNote) =>
    [
      tPlural('ui.welcome.body', note.days, { n: note.days }),
      `${tPlural('ui.welcome.ruleAway', note.from, { n: note.from })} ${tPlural('ui.welcome.ruleCooldown', note.cooldown, { n: note.cooldown })}`,
    ].join('\n\n')
}

/** The rules, with the admin's numbers as the game has them now: from how many days, each tier's gifts, how often. */
export function useWelcomeBackRules(): RuleRow[] {
  const { t, tPlural } = useT()
  const data = useGame((s) => s.data)
  const reward = useRewardText()
  const tiers = welcomeBackTiers(data)
  const cooldown = welcomeBackCooldown(data)
  const from = tiers[0]?.minDays ?? 1
  return [
    {
      icon: 'calendar',
      title: tPlural('ui.rules.welcome.away.title', from, { n: from }),
      text: t('ui.rules.welcome.away.text'),
    },
    {
      icon: 'gift',
      title: t('ui.rules.welcome.tiers.title'),
      text: tiers
        .map((tier) => `${tPlural('ui.trades.days', tier.minDays)} → ${reward(tier.gifts)}`)
        .join(' · '),
    },
    {
      icon: 'history',
      title: tPlural('ui.rules.welcome.once.title', cooldown, { n: cooldown }),
      text: t('ui.rules.welcome.once.text'),
    },
    { icon: 'star', title: t('ui.rules.gift.where.title'), text: t('ui.rules.gift.where.text') },
  ]
}

/** The rules' banner, drawn in code: the morning sun over the gift on the night strip. */
function WelcomeBanner() {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-3 bg-night pb-3" aria-hidden>
      <PixelIcon name="calendar" size={40} className="mb-3" />
      <PixelIcon name="gift" size={84} className="-mb-1" />
      <PixelIcon name="daySun" size={44} className="mb-12" />
      <PixelIcon name="sparkle" size={18} className="mb-16" />
    </div>
  )
}

/** The rules, from INFO (OK). */
export function WelcomeBackRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.welcome.rulesTitle')}
      picture={<WelcomeBanner />}
      icon="gift"
      rules={useWelcomeBackRules()}
    />
  )
}

/**
 * INFO under a welcome-back message (My messages), opening its rules. Named beside it, so it never reads as the gifts'
 * own INFO at the bottom of the list.
 */
export function WelcomeBackInfo({ className }: { className?: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className={cx('flex items-center justify-end gap-2', className)}>
      <span
        className="flex items-center gap-1.5 font-pixel-sm text-[16px] leading-none text-muted"
        aria-hidden
      >
        <PixelIcon name="calendar" size={16} />
        {t('ui.welcome.rulesTitle')}
      </span>
      <InfoButton compact name={t('ui.welcome.infoName')} onClick={() => setOpen(true)} />
      <WelcomeBackRulesModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
