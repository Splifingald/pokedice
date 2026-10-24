// "Your team helped Gary catch Mew! +1 Ultra Ball": the gifts friends' raids left you, shown between fights on their turn
// in the one-time pop-ups' queue (engine/popups.ts: after Prof. Oak's tutorials), once claimed (store/raidGifts.ts).
// The items are in the bag already.
import { useEffect } from 'react'
import { useT } from '@/i18n/react'
import { collectRaidGifts, dismissRaidGifts, useRaidGifts } from '@/store/raidGifts'
import { useGame } from '@/store/game'
import { ItemSprite } from './ItemSprite'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useMyTurn, useOnScreen } from './popupTurn'
import { MiniSprite } from './SpriteImg'

export function RaidGiftPopup() {
  const { t } = useT()
  const status = useGame((s) => s.auth.status)
  const userId = useGame((s) => s.auth.userId)
  const data = useGame((s) => s.data)
  const gifts = useRaidGifts((s) => s.gifts)
  const turn = useMyTurn('raidGifts')

  // On opening the game and signing in; then whenever the tab comes back (throttled).
  useEffect(() => {
    if (status === 'signed_in') void collectRaidGifts(true)
  }, [status, userId])
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && void collectRaidGifts()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  const open = gifts.length > 0 && turn
  useOnScreen('raidGifts', open)
  return (
    <Modal open={open} onClose={dismissRaidGifts} title={t('ui.raid.gifts.title')}>
      <div className="flex flex-col gap-3">
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {gifts.map((g) => {
            const item = data.items[g.itemKey]
            return (
              <li key={g.id} className="flex items-center gap-2 bg-paper px-2 py-1.5 shadow-card">
                <MiniSprite dex={g.dex} size={40} className="-my-1" />
                <span className="min-w-0 flex-1 text-[18px] leading-tight">
                  {t('ui.raid.gifts.line', { name: g.raider, mon: data.species[g.dex]?.name ?? '' })}
                </span>
                {item && (
                  <span className="flex shrink-0 items-center gap-1 font-pixel-sm text-[16px]">
                    <ItemSprite item={item} size={24} />+1
                    <span className="sr-only">{item.name}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="copy m-0 text-base text-muted">{t('ui.raid.gifts.note')}</p>
        <div className="flex justify-end">
          <PixelButton variant="primary" onClick={dismissRaidGifts}>
            {t('ui.common.ok')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
