// Professor Oak's one-time tips (catch screen, auto-mode…): shown once per device, remembered in localStorage.
import { useState, type ReactNode } from 'react'
import { useT } from '@/i18n/react'
import { PixelButton } from './PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'

const tipSeen = (key: string) => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return true
  }
}
const markTipSeen = (key: string) => {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* private mode: the tip may show again */
  }
}

/** [show, dismiss] for the tip stored under `key`. */
export function useOneTimeTip(key: string): [boolean, () => void] {
  const [show, setShow] = useState(() => !tipSeen(key))
  return [
    show,
    () => {
      setShow(false)
      markTipSeen(key)
    },
  ]
}

export function OakTip({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { t } = useT()
  return (
    <div className="flex w-full items-start gap-2 bg-[#fff8ec] p-2 shadow-[inset_0_0_0_2px_#24304f,inset_0_-4px_0_#f3e2c4] text-left">
      <TrainerSprite src="/characters/prof-oak.png" alt={t('ui.newGame.oak')} size={56} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-lg leading-snug">
          <b>{t('ui.oak.prefix')}</b> {children}
        </div>
        <PixelButton size="sm" className="self-end" onClick={onClose}>
          {t('ui.oak.gotIt')}
        </PixelButton>
      </div>
    </div>
  )
}
