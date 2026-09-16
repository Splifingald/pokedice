import { lazy, Suspense, useState } from 'react'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

const HelpContent = lazy(() => import('@/screens/Help').then((m) => ({ default: m.HelpContent })))

/** "?" — opens the rules and the type chart in a modal, usable anywhere (even mid-battle). */
export function HelpButton({ size = 'sm', label = false }: { size?: 'sm' | 'md' | 'lg'; label?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <PixelButton size={size} variant="secondary" onClick={() => setOpen(true)} aria-label="How to play" title="How to play">
        ?{label && <span>How to play</span>}
      </PixelButton>
      <Modal open={open} onClose={() => setOpen(false)} title="How to play" className="max-w-3xl">
        <Suspense fallback={<p className="text-xl">Loading…</p>}>
          <HelpContent />
        </Suspense>
      </Modal>
    </>
  )
}
