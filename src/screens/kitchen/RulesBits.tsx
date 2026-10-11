// Kitchen sink: a feature's rules in the special events' pop-up, as it opens when the feature unlocks (Later / Let's
// go!) and from the INFO button at the bottom of its page (Got it).
import { useState } from 'react'
import { DayCareRulesModal, VersusRulesModal } from '@/components/FeatureRules'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'

type Open = null | 'dc-unlock' | 'dc-info' | 'vs-unlock' | 'vs-info'

export function RulesBits() {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  return (
    <div className="grid w-full max-w-md gap-2">
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen('dc-unlock')}>Day Care opens</PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('vs-unlock')}>Versus opens</PixelButton>
      </div>
      <InfoButton name="Day Care" onClick={() => setOpen('dc-info')} />
      <InfoButton name="Versus" onClick={() => setOpen('vs-info')} />
      <DayCareRulesModal open={open === 'dc-unlock' || open === 'dc-info'} onClose={close} onGo={open === 'dc-unlock' ? close : undefined} />
      <VersusRulesModal open={open === 'vs-unlock' || open === 'vs-info'} onClose={close} onGo={open === 'vs-unlock' ? close : undefined} />
    </div>
  )
}
