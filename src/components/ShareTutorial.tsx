// Prof. Oak's share prompt: once per region, when the player holds its 4th badge (between fights). The button opens
// the native share sheet on phones, or copies the link where there is none (desktop). Remembered in localStorage.
import { useState } from 'react'
import { badgeCase, dayCareTutorialDue, leaderboardTutorialDue, regionOf } from '@/engine'
import { useT } from '@/i18n/react'
import { pushToast, useGame } from '@/store/game'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

const seenKey = (region: string) => `pokedice.sharePrompt.${region}`
const seen = (region: string) => {
  try {
    return localStorage.getItem(seenKey(region)) === '1'
  } catch {
    return true
  }
}

export function ShareTutorial() {
  const { t } = useT()
  const region = useGame((s) => (s.save ? regionOf(s.save) : null))
  const due = useGame(
    (s) =>
      !!s.save &&
      badgeCase(s.save, s.data).filter((b) => b.earned).length >= 4 &&
      !dayCareTutorialDue(s.save, s.data) &&
      !leaderboardTutorialDue(s.save, s.data),
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  const [closed, setClosed] = useState<string[]>([])
  const open = !!region && due && idle && !closed.includes(region) && !seen(region)

  const close = () => {
    if (!region) return
    try {
      localStorage.setItem(seenKey(region), '1')
    } catch {
      /* private mode: may show again next visit */
    }
    setClosed((c) => [...c, region])
  }

  const share = async () => {
    const url = window.location.origin
    try {
      if (navigator.share) await navigator.share({ title: 'Pokédice', text: t('ui.share.text'), url })
      else {
        await navigator.clipboard.writeText(url)
        pushToast(t('ui.share.copied'), 'good')
      }
      close()
    } catch {
      /* share sheet cancelled: keep the pop-up */
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('ui.share.title')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <img
            src="/characters/prof-oak.png"
            alt={t('ui.newGame.oak')}
            width={64}
            height={64}
            className="shrink-0"
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="text-xl leading-snug">
            <b>{t('ui.oak.prefix')}</b> {t('ui.share.body')}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <PixelButton onClick={close}>{t('ui.share.later')}</PixelButton>
          <PixelButton variant="primary" size="lg" onClick={() => void share()}>
            {t('ui.share.button')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
