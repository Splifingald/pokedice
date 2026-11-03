// The Safari's round asked before it begins (docs/61 §4, docs/15 §28): a pop-up saying the price, or that this round is
// free, the player's ₽, and HOME beside the button that begins it (a player's report, 2026-11-03).
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { TrickSprite } from '@/components/TrickOrTreat'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useGame } from '@/store/game'
import { confirmSafariRound } from '@/store/run'
import { closeSafariAsk, useSafariAsk, type SafariAsk } from '@/store/safariAsk'

/** What the pop-up shows, from what it's given (the game, or the kitchen sink). */
export function SafariAskView({
  ask,
  gold,
  areaName,
  onGo,
  onHome,
  onClose,
}: {
  ask: SafariAsk | null
  gold: number
  areaName: string
  onGo: () => void
  onHome: () => void
  onClose: () => void
}) {
  const { t } = useT()
  const free = !!ask && ask.price === 0
  const poor = !!ask && !free && gold < ask.price
  return (
    <Modal open={!!ask} onClose={onClose} title={areaName} className="max-w-sm">
      {ask && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 bg-paper p-3 shadow-ring-line">
            <TrickSprite kind="ball" theme="safari" size={40} className="shrink-0" />
            <span className="grid min-w-0 gap-1">
              <b className="text-[24px] font-normal leading-none">
                {free ? t('ui.safari.ask.freeTitle') : t('ui.safari.ask.paidTitle', { price: ask.price })}
              </b>
              <small className="font-pixel-sm text-[16px] leading-tight text-muted">
                {free ? t('ui.safari.ask.freeText', { price: ask.next }) : t('ui.safari.ask.purse', { gold: money(gold) })}
              </small>
            </span>
          </div>
          {poor && (
            <p className="m-0 font-pixel-sm text-[16px] leading-tight text-danger" role="alert">
              {t('ui.safari.tooPoor', { price: ask.price })}
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <PixelButton size="lg" className="whitespace-nowrap px-2" onClick={onHome}>
              {t('ui.nav.home')}
            </PixelButton>
            <PixelButton
              variant="primary"
              size="lg"
              className="whitespace-nowrap px-2"
              disabled={poor}
              onClick={onGo}
            >
              {free ? t('ui.safari.ask.start') : t('ui.safari.ask.pay', { price: ask.price })}
            </PixelButton>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** The pop-up in the game: raised by the round's first card (rollNext), wherever the player asked for it. */
export function SafariAskPopup() {
  const navigate = useNavigate()
  const ask = useSafariAsk((s) => s.ask)
  const gold = useGame((s) => s.save?.gold ?? 0)
  const areaName = useGame((s) => s.data.areas.find((a) => a.id === ask?.areaId)?.name ?? '')
  return (
    <SafariAskView
      ask={ask}
      gold={gold}
      areaName={areaName}
      onGo={() => {
        confirmSafariRound()
        if (useGame.getState().run.phase !== 'idle') navigate('/area')
      }}
      onHome={() => {
        closeSafariAsk()
        navigate('/home')
      }}
      onClose={closeSafariAsk}
    />
  )
}
