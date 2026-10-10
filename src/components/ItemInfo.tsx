// An item's card in a pop-up: its sprite, what it does, its description and how many you hold. Opened from lists
// that only name items (an area's "Also found here").
import { useT } from '@/i18n/react'
import { effectText } from '@/i18n/text'
import { useGame } from '@/store/game'
import { ItemSprite } from './ItemSprite'
import { Modal } from './Modal'

export function ItemInfo({ itemKey, onClose }: { itemKey: string | null; onClose: () => void }) {
  const { t } = useT()
  const item = useGame((s) => (itemKey ? s.data.items[itemKey] : undefined))
  const owned = useGame((s) => (itemKey ? (s.save?.inventory[itemKey] ?? 0) : 0))
  return (
    <Modal open={!!item} onClose={onClose} title={item?.name}>
      {item && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center bg-paper shadow-ring-line">
              <ItemSprite item={item} size={48} />
            </span>
            <p className="m-0 text-[20px] leading-tight">{effectText(item)}</p>
          </div>
          {item.description && <p className="copy m-0 text-muted">{item.description}</p>}
          <p className="m-0 font-pixel-sm text-[16px] text-muted">{t('ui.item.inBag', { n: owned })}</p>
        </div>
      )}
    </Modal>
  )
}
