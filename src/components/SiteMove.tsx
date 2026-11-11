// The new address (docs/72): the cover on the old address while the save is packed and sent (a second or two, the game
// stopped writing), and the pop-up on the new one, once, when the save has come over. It has no page, so its pop-up is
// its rules (docs/15 §20), and How to play lists them again while the switch is on.
import { useT } from '@/i18n/react'
import { NEW_ORIGIN } from '@/save/move'
import { arrivalSeen, useSiteMove } from '@/lib/siteMove'
import { PixelIcon } from './icons'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RulesModal, type RuleRow } from './RulesModal'
import { SpriteImg } from './SpriteImg'

/** The new address as players read it: no scheme. */
export const NEW_HOST = new URL(NEW_ORIGIN).host

/** On the old address: covers the game while it hands the save over, so nothing is played that wouldn't come along. */
export function SiteMoveCover({ show = false }: { show?: boolean }) {
  const { t } = useT()
  const leaving = useSiteMove((s) => s.leaving)
  if (!leaving && !show) return null
  return (
    <div
      className="light-scope fixed inset-0 z-[130] flex flex-col items-center justify-center gap-4 bg-night px-4 text-center text-white"
      role="status"
      aria-live="polite"
    >
      <PixelIcon name="ball" size={48} />
      <p className="max-w-sm font-pixel text-2xl leading-tight">{t('ui.move.leaving', { host: NEW_HOST })}</p>
    </div>
  )
}

export function useMovedRules(): RuleRow[] {
  const { t } = useT()
  return [
    {
      icon: 'map',
      title: t('ui.move.rules.address.title'),
      text: t('ui.move.rules.address.text', { host: NEW_HOST }),
    },
    { icon: 'heart', title: t('ui.move.rules.save.title'), text: t('ui.move.rules.save.text') },
    { icon: 'star', title: t('ui.move.rules.home.title'), text: t('ui.move.rules.home.text') },
    { icon: 'bell', title: t('ui.move.rules.push.title'), text: t('ui.move.rules.push.text') },
  ]
}

/** The rules: once as the save arrives, then from How to play (OK either way: there is nothing to go to). */
export function MovedRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = useMovedRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.move.title')}
      picture={<MovedBanner />}
      icon="map"
      rules={rules}
    />
  )
}

/** The banner: Pidgeot, who flies you anywhere, over the new address. */
function MovedBanner() {
  return (
    <div
      className="light-scope absolute inset-0 flex flex-col items-center justify-center gap-1 bg-night"
      aria-hidden
    >
      <SpriteImg dex={18} size={80} />
      <span className="bg-gold px-2 pb-0.5 font-pixel-sm text-[16px] tracking-[0.08em] text-ink shadow-ring-line">
        {NEW_HOST}
      </span>
    </div>
  )
}

/** On the new address: once, between fights, the first of the one-time pop-ups (engine/popups.ts `moved`). */
export function MovedPopup() {
  const open = useMyTurn('moved')
  useOnScreen('moved', open)
  return <MovedRulesModal open={open} onClose={arrivalSeen} />
}
