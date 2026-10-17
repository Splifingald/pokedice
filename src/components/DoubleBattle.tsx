// Double battles (docs/31): the tag on an encounter fought 2 v 2, its INFO button, and the rules — shown once, at the
// first double battle's preview, then on INFO. The numbers and regions come from the config.
import { useState } from 'react'
import { doublesConfig } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { mutateSave, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'
import { SpriteImg } from './SpriteImg'

/** Two against two on a route: Plusle and Minun facing Solrock and Lunatone. */
function DoubleBanner() {
  return (
    <div className="absolute inset-0">
      <img src={artUrl('hills')} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" />
      <div className="absolute bottom-1 left-3 flex items-end">
        <SpriteImg dex={311} size={72} back />
        <SpriteImg dex={312} size={60} back className="-ml-6" />
      </div>
      <div className="absolute right-3 top-2 flex items-end">
        <SpriteImg dex={338} size={52} className="-mr-4" />
        <SpriteImg dex={337} size={64} />
      </div>
    </div>
  )
}

export function useDoubleRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = doublesConfig(data)
  const regions = joinList(data.regions.filter((r) => cfg.regions.includes(r.id)).map((r) => r.name))
  return [
    {
      icon: 'vs',
      title: t('ui.rules.double.when.title'),
      text: t('ui.rules.double.when.text', { regions, chance: cfg.wildChance }),
    },
    { icon: 'speed', title: t('ui.rules.double.order.title'), text: t('ui.rules.double.order.text') },
    { icon: 'sword', title: t('ui.rules.double.aim.title'), text: t('ui.rules.double.aim.text') },
    { icon: 'ball', title: t('ui.rules.double.rewards.title'), text: t('ui.rules.double.rewards.text') },
  ]
}

export function DoubleRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = useDoubleRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.rules.double.title')}
      picture={<DoubleBanner />}
      icon="vs"
      rules={rules}
    />
  )
}

const markSeen = () => mutateSave((s) => (s.doubleRulesSeen ? null : { ...s, doubleRulesSeen: true }))

/**
 * The tag on a double battle's preview: DOUBLE BATTLE and its INFO button. The first time one shows, the rules open by
 * themselves.
 */
export function DoubleTag({
  className,
  firstTime = true,
}: {
  className?: string
  /** Off: the rules wait for INFO even the first time (the kitchen sink shows the tag on its own). */
  firstTime?: boolean
}) {
  const { t } = useT()
  const seen = useGame((s) => !!s.save?.doubleRulesSeen)
  const [open, setOpen] = useState(firstTime && !seen)
  const close = () => {
    setOpen(false)
    markSeen()
  }
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 bg-gold px-2 pb-0.5 pt-px text-xl leading-tight text-ink shadow-ring">
        <PixelIcon name="vs" size={18} />
        {t('ui.double.tag')}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('ui.events.infoLabel', { name: t('ui.rules.double.title') })}
        className="min-h-[44px] min-w-[44px] bg-paper px-2 text-lg leading-none text-ink shadow-ring"
      >
        {t('ui.events.info')}
      </button>
      <DoubleRulesModal open={open} onClose={close} />
    </div>
  )
}
