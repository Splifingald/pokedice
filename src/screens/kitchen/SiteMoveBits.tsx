// Kitchen sink (dev only): the new address (docs/72) — the cover the old address shows while it hands the save over,
// and the pop-up the new one shows once the save has arrived (its rules).
import { useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { MovedRulesModal, SiteMoveCover } from '@/components/SiteMove'

export function SiteMoveBits() {
  const [rules, setRules] = useState(false)
  const [cover, setCover] = useState(false)
  return (
    <div className="flex flex-wrap items-end gap-6">
      <PixelButton size="sm" onClick={() => setRules(true)}>
        Arrived pop-up
      </PixelButton>
      <PixelButton
        size="sm"
        onClick={() => {
          setCover(true)
          setTimeout(() => setCover(false), 3000)
        }}
      >
        Leaving cover (3 s)
      </PixelButton>
      <MovedRulesModal open={rules} onClose={() => setRules(false)} />
      <SiteMoveCover show={cover} />
    </div>
  )
}
