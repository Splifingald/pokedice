// Phones and tablets play upright (docs/15 §6): turned sideways, the whole game waits behind this card until the
// device is upright again. Nothing to dismiss: turning the device back is the only way on.
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n/react'
import { lockPortrait, useSideways } from '@/lib/orientation'

/** A pixel phone that tips from sideways to upright, in steps; still and upright under reduced motion. */
function TurningPhone() {
  return (
    <svg
      viewBox="0 0 10 16"
      width={60}
      height={96}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="rotate-hint"
    >
      <rect x="1" y="0" width="8" height="1" fill="rgb(var(--c-ink))" />
      <rect x="1" y="15" width="8" height="1" fill="rgb(var(--c-ink))" />
      <rect x="0" y="1" width="1" height="14" fill="rgb(var(--c-ink))" />
      <rect x="9" y="1" width="1" height="14" fill="rgb(var(--c-ink))" />
      <rect x="1" y="1" width="8" height="14" fill="rgb(var(--c-panel))" />
      <rect x="2" y="2" width="6" height="10" fill="rgb(var(--c-sky-line))" />
      <rect x="4" y="13" width="2" height="1" fill="rgb(var(--c-ink))" />
    </svg>
  )
}

/** The card's content, on its own so the kitchen sink can show it in place. */
export function RotateView({ titleId }: { titleId?: string }) {
  const { t } = useT()
  return (
    <div className="pixel-panel flex w-full max-w-sm flex-col items-center gap-3 p-4 text-center">
      <TurningPhone />
      <h2 id={titleId} className="text-title leading-none">
        {t('ui.rotate.title')}
      </h2>
      <p className="font-pixel-sm text-body text-muted">{t('ui.rotate.text')}</p>
    </div>
  )
}

/** Over everything, while a phone or a tablet is held sideways; the game behind it can't be reached meanwhile. */
export function RotateCover() {
  const sideways = useSideways()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => lockPortrait(), [])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!sideways || !root) return
    root.inert = true
    ref.current?.focus()
    return () => {
      root.inert = false
    }
  }, [sideways])

  if (!sideways || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-parchment p-3 outline-none"
    >
      <RotateView titleId={titleId} />
    </div>,
    document.body,
  )
}
