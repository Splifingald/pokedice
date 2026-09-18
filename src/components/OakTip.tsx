// Professor Oak's one-time tips (catch screen, auto-mode…): shown once per device, remembered in localStorage.
import { useState, type ReactNode } from 'react'
import { PixelButton } from './PixelButton'

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
  return (
    <div className="flex w-full items-start gap-2 border-[3px] border-ink bg-parchment p-2 text-left">
      <img
        src="/characters/prof-oak.png"
        alt="Professor Oak"
        width={56}
        height={56}
        className="shrink-0"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-lg leading-snug">
          <b>PROF. OAK:</b> {children}
        </div>
        <PixelButton size="sm" className="self-end" onClick={onClose}>
          GOT IT
        </PixelButton>
      </div>
    </div>
  )
}
