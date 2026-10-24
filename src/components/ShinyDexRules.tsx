// The shiny Pokédex's rules (docs/39, docs/15 §20): once, at the first league beaten, then from the INFO button at
// the bottom of the Pokédex. The odds come from the save and the config, so the Shiny Charm shows up in the text.
import { useNavigate } from 'react-router-dom'
import { wildShinyChance } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { oneInText } from '@/lib/format'
import { markShinyDexSeen } from '@/store/actions'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'
import { Seg } from './Segmented'

/** The region's Pokédex, or its shiny page. */
export type DexView = 'all' | 'shiny'

/** The Pokédex's two pages, at its top once the shiny one is open. */
export function DexViewSwitch({ value, onChange }: { value: DexView; onChange: (v: DexView) => void }) {
  const { t } = useT()
  return (
    <Seg
      label={t('ui.dex.view')}
      value={value}
      onChange={onChange}
      options={[
        { id: 'all', label: t('ui.dex.viewAll') },
        {
          id: 'shiny',
          label: (
            <>
              <PixelIcon name="sparkle" size={14} />
              {t('ui.dex.viewShiny')}
            </>
          ),
        },
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

/**
 * The shiny Pokédex has opened (the switch, a league beaten): once, between fights, its rules and a button straight to
 * its page. It takes its turn in the one-time pop-ups' queue (engine/popups.ts), never on the Pokédex itself.
 */
export function ShinyDexUnlockPopup() {
  const navigate = useNavigate()
  const open = useMyTurn('shinyDex')
  useOnScreen('shinyDex', open)
  // Gone the moment its turn ends: its button leads to another page, which a fading pop-up would cover.
  if (!open) return null
  return (
    <ShinyDexRulesModal
      open={open}
      onClose={markShinyDexSeen}
      onGo={() => {
        markShinyDexSeen()
        navigate('/pokedex?view=shiny')
      }}
    />
  )
}
