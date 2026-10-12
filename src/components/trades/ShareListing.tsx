// A listing's link (docs/23 §2): https://<site>/t/<code>, copied, or through the phone's share sheet, as friend
// invites are. A private listing opens this straight after it's posted: the link is the only way to it.
import type { TradeVisibility } from '@/engine'
import { useT } from '@/i18n/react'
import { copyText, shareOrCopy } from '@/lib/share'
import { tradeUrl } from '@/lib/trades'
import { useGame } from '@/store/game'
import { Modal } from '../Modal'
import { PixelButton } from '../PixelButton'
import { VisChip } from './TradeBits'

export interface Shared {
  code: string
  dex: number
  visibility: TradeVisibility
}

export function ShareListingModal({ listing, onClose }: { listing: Shared | null; onClose: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const name = listing ? (data.species[listing.dex]?.name ?? t('ui.common.pokemon')) : ''
  const url = listing ? tradeUrl(listing.code) : ''
  return (
    <Modal open={!!listing} onClose={onClose} title={t('ui.trades.share.title')}>
      {listing && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <b className="text-[20px] font-normal leading-none">{name}</b>
            <VisChip visibility={listing.visibility} />
          </div>
          <div className="flex items-center gap-2 bg-paper py-1.5 pl-3 pr-1.5 shadow-field">
            <code className="min-w-0 flex-1 truncate font-pixel-sm text-[15px]" data-testid="trade-link">
              {url.replace(/^https?:\/\//, '')}
            </code>
            <PixelButton
              size="sm"
              onClick={() => void copyText(url, t('ui.trades.share.copied'), t('ui.friends.copyFailed'))}
            >
              {t('ui.friends.copy')}
            </PixelButton>
          </div>
          <p className="copy m-0 text-[17px] text-muted">{t(`ui.trades.share.note.${listing.visibility}`)}</p>
          <PixelButton
            variant="primary"
            className="w-full"
            onClick={() =>
              void shareOrCopy(
                { title: 'Pokédice', text: t('ui.trades.share.text', { mon: name }), url },
                t('ui.trades.share.copied'),
              )
            }
          >
            {t('ui.trades.share.button')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}
