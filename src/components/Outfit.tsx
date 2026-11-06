// Outfits (docs/59): the chip that names a Pokémon's outfit on its sheet (a tap shows the rules again), the rules, and
// their one-time pop-up as the first Pokémon in an outfit arrives.
import { markOutfitRulesSeen } from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { mutateSave } from '@/store/game'
import { useState } from 'react'
import { Chip } from './Chip'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RulesModal, type RuleRow } from './RulesModal'
import { SpriteImg } from './SpriteImg'

/** An outfit's name ("Santa hat"). */
export const outfitName = (key: string): string => t(`ui.outfit.${key}`)

/**
 * The outfit's chip, beside the shiny one: a red tag with the outfit's name. A button: it opens the rules (the
 * feature's INFO, docs/15 §20, as the talent box is the hidden talents').
 */
export function OutfitChip({ outfit }: { outfit: string }) {
  useT()
  const [info, setInfo] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setInfo(true)}
        aria-label={`${outfitName(outfit)}: ${t('ui.outfit.title')}`}
      >
        <Chip tone="red">{outfitName(outfit)}</Chip>
      </button>
      <OutfitRulesModal open={info} onClose={() => setInfo(false)} />
    </>
  )
}

export function useOutfitRules(): RuleRow[] {
  useT()
  return [
    { icon: 'sparkle', title: t('ui.outfit.rules.look.title'), text: t('ui.outfit.rules.look.text') },
    { icon: 'up', title: t('ui.outfit.rules.evolve.title'), text: t('ui.outfit.rules.evolve.text') },
    { icon: 'gift', title: t('ui.outfit.rules.gift.title'), text: t('ui.outfit.rules.gift.text') },
  ]
}

/** The rules: once as the first Pokémon in an outfit arrives (Later / Let's go!), then from the chip (OK). */
export function OutfitRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  useT()
  const rules = useOutfitRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.outfit.title')}
      picture={<OutfitBanner />}
      icon="gift"
      rules={rules}
      onGo={onGo}
    />
  )
}

/** The banner: Santa Pikachu on a winter-night ground (the plain Pikachu where the game can't load the outfit). */
function OutfitBanner() {
  return (
    <div className="light-scope absolute inset-0 flex items-center justify-center bg-night" aria-hidden>
      <SpriteImg dex={25} outfit="santa" size={96} />
    </div>
  )
}

const seen = () => mutateSave((s) => (s.outfitRulesSeen ? null : markOutfitRulesSeen(s)))

/**
 * Once, between fights, when the first Pokémon in an outfit has arrived with the switch on. It takes its turn in the
 * one-time pop-ups' queue (engine/popups.ts), after the hidden talents'. Let's go! has nowhere to lead.
 */
export function OutfitRulesPopup() {
  const open = useMyTurn('outfits')
  useOnScreen('outfits', open)
  return <OutfitRulesModal open={open} onClose={seen} onGo={seen} />
}
