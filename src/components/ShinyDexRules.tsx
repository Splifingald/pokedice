// The shiny Pokédex's rules (docs/39, docs/15 §20): once, at the first league beaten, then from the INFO button at
// the bottom of the Pokédex. The odds come from the save and the config, so the Shiny Charm shows up in the text.
import { wildShinyChance } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { oneInText } from '@/lib/format'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'
import { Seg } from './Segmented'

/** The region's Pokédex, its shiny page, or the Unown's letters (docs/41). */
export type DexView = 'all' | 'shiny' | 'unown'

/** The Pokédex's pages, at its top once another than the first is open (`views`: the ones open, besides it). */
export function DexViewSwitch({
  value,
  onChange,
  views = ['shiny'],
}: {
  value: DexView
  onChange: (v: DexView) => void
  views?: readonly Exclude<DexView, 'all'>[]
}) {
  const { t } = useT()
  return (
    <Seg<DexView>
      label={t('ui.dex.view')}
      value={value}
      onChange={onChange}
      options={[
        { id: 'all', label: t('ui.dex.viewAll') },
        ...(views.includes('shiny')
          ? [
              {
                id: 'shiny' as const,
                label: (
                  <>
                    <PixelIcon name="sparkle" size={14} />
                    {t('ui.dex.viewShiny')}
                  </>
                ),
              },
            ]
          : []),
        ...(views.includes('unown') ? [{ id: 'unown' as const, label: t('ui.dex.viewUnown') }] : []),
      ]}
    />
  )
}

/** The crystal cave: glints of every colour, as shinies are. */
export const SHINY_DEX_PICTURE: RulesPicture = { src: artUrl('crystal'), focus: '50% 35%' }

export function useShinyDexRules(): RuleRow[] {
  const { t } = useT()
  const chance = useGame((s) => (s.save ? wildShinyChance(s.save, s.data) : s.data.config.shinyChance))
  return [
    { icon: 'sparkle', title: t('ui.rules.shinyDex.page.title'), text: t('ui.rules.shinyDex.page.text') },
    { icon: 'star', title: t('ui.rules.shinyDex.kept.title'), text: t('ui.rules.shinyDex.kept.text') },
    {
      icon: 'ball',
      title: t('ui.rules.shinyDex.hunt.title'),
      text: t('ui.rules.shinyDex.hunt.text', { odds: chance > 0 ? oneInText(chance) : '∞' }),
    },
    { icon: 'navDex', title: t('ui.rules.shinyDex.region.title'), text: t('ui.rules.shinyDex.region.text') },
  ]
}

export function ShinyDexRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useShinyDexRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.dex.shinyTitle')}
      picture={SHINY_DEX_PICTURE}
      icon="sparkle"
      rules={rules}
      onGo={onGo}
    />
  )
}
