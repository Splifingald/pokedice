// The developer's gifts' rules (docs/15 §23). They never open by themselves (the user's call, 2026-11-02): only from
// How to play's list of the game's features.
import { useT } from '@/i18n/react'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'

/** The banner, drawn in code: three gifts on the night strip, and a few sparkles. */
function GiftBanner() {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-3 bg-night pb-3" aria-hidden>
      <PixelIcon name="sparkle" size={18} className="mb-14" />
      <PixelIcon name="gift" size={48} />
      <PixelIcon name="gift" size={84} className="-mb-1" />
      <PixelIcon name="gift" size={48} />
      <PixelIcon name="sparkle" size={18} className="mb-16" />
    </div>
  )
}

function useDevGiftRules(): RuleRow[] {
  const { t } = useT()
  return [
    { icon: 'mail', title: t('ui.rules.gift.msg.title'), text: t('ui.rules.gift.msg.text') },
    { icon: 'potion', title: t('ui.rules.gift.items.title'), text: t('ui.rules.gift.items.text') },
    { icon: 'ball', title: t('ui.rules.gift.mons.title'), text: t('ui.rules.gift.mons.text') },
    { icon: 'gift', title: t('ui.rules.gift.where.title'), text: t('ui.rules.gift.where.text') },
  ]
}

export function DevGiftRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = useDevGiftRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.rules.gift.title')}
      picture={<GiftBanner />}
      icon="gift"
      rules={rules}
    />
  )
}
