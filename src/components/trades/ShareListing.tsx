// A listing's link (docs/23 §2): https://<site>/t/<code>, copied, or through the phone's share sheet, as friend
// invites are. A private listing opens this straight after it's posted: the link is the only way to it.
// The link goes with a message naming the Pokémon, its level and what it's for: every link's preview is the same
// picture, so a chat would otherwise not say what's on offer.
import type { TradeVisibility, TradeWant } from '@/engine'
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
  level: number
  shiny: boolean
  want: TradeWant
  visibility: TradeVisibility
}

export function ShareListingModal({ listing, onClose }: { listing: Shared | null; onClose: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const species = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')
  const name = listing ? species(listing.dex) : ''
  const url = listing ? tradeUrl(listing.code) : ''
  let text = ''
  if (listing) {
    const mon = listing.shiny ? t('ui.trades.share.shiny', { mon: name }) : name
    const want =
      listing.want.kind === 'species' ? species(listing.want.dex) : t(`ui.trades.want.${listing.want.kind}`)
    text = [
      t('ui.trades.share.text', { mon, level: t('ui.common.level.short', { n: listing.level }) }),
      t('ui.trades.share.wants', { want }),
    ].join('\n')
  }
  return (
    <Modal open={!!listing} onClose={onClose} title={t('ui.trades.share.title')}>
      {listing && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <b className="text-[20px] font-normal leading-none">{name}</b>
            <VisChip visibility={listing.visibility} />
          </div>
          <div className="flex items-start gap-2 bg-paper py-1.5 pl-3 pr-1.5 shadow-field">
            <div className="grid min-w-0 flex-1 gap-1">
              <p className="copy m-0 whitespace-pre-line text-[17px]" data-testid="trade-share-text">
                {text}
              </p>
              <code className="truncate font-pixel-sm text-[16px]" data-testid="trade-link">
                {url.replace(/^https?:\/\//, '')}
              </code>
            </div>
            <PixelButton
              size="sm"
              onClick={() =>
                void copyText(`${text}\n${url}`, t('ui.trades.share.copied'), t('ui.friends.copyFailed'))
              }
            >
              {t('ui.friends.copy')}
            </PixelButton>
          </div>
          <p className="copy m-0 text-[17px] text-muted">{t(`ui.trades.share.note.${listing.visibility}`)}</p>
          <PixelButton
            variant="primary"
            className="w-full"
            onClick={() =>
              void shareOrCopy({ title: 'Pokédice', text, url }, t('ui.trades.share.copied'), {
                withText: true,
              })
            }
          >
            {t('ui.trades.share.button')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}
