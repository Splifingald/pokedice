// A feature's rules where they apply (docs/43 §7, the user's call, 2026-10-26): the first time a feature's page opens,
// its rules sit at the top of that page as a card — the same rows as its rules pop-up (`RuleList`), read beside the
// thing they explain — rather than a pop-up over Home. GOT IT puts the card away for good (the feature's "seen" flag);
// the INFO button at the foot of the page shows the same rules again (`RulesModal`, OK). Features with no page of
// their own (day and night, the battle powers, a small world's opening, the push question) keep their pop-ups.
import { useId } from 'react'
import { useT } from '@/i18n/react'
import { PixelIcon, type IconName } from './icons'
import { PixelButton } from './PixelButton'
import { RuleList, type RuleRow } from './RulesModal'

export function RulesCard({
  title,
  icon,
  rules,
  onDone,
}: {
  /** The feature's name: "How Versus works". */
  title: string
  icon: IconName
  rules: RuleRow[]
  /** GOT IT: marks the rules seen, so the card doesn't come back. */
  onDone: () => void
}) {
  const { t } = useT()
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 bg-sky p-3 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-sky-line))]"
    >
      <h2 id={id} className="m-0 flex items-center gap-2 text-[22px] font-normal leading-none">
        <PixelIcon name={icon} size={22} className="shrink-0" />
        {t('ui.rules.cardTitle', { name: title })}
      </h2>
      <RuleList rules={rules} />
      <PixelButton size="sm" className="self-end" onClick={onDone}>
        {t('ui.oak.gotIt')}
      </PixelButton>
    </section>
  )
}
