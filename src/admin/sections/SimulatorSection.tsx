// Admin simulator: one battle, a team grinding one area, or a whole campaign — all on the unsaved working copy.
import { useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { useAdminData } from '../store'
import { BattleSim } from './simulator/BattleSim'
import { AreaTestSim, CampaignSim } from './simulator/CampaignSim'

const TABS = [
  { id: 'battle', label: 'Battle' },
  { id: 'area', label: 'Area test' },
  { id: 'campaign', label: 'Campaign' },
] as const
type TabId = (typeof TABS)[number]['id']

export function SimulatorSection() {
  const data = useAdminData()
  const [tab, setTab] = useState<TabId>('battle')
  if (!data) return <p className="text-xl text-danger">The working copy doesn't compile — fix the invalid rows first.</p>

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-3xl">Simulator</h2>
      <p className="text-base text-muted">Everything here runs on your unsaved working copy, so you can try a change before saving it.</p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Simulator mode">
        {TABS.map((t) => (
          <PixelButton
            key={t.id}
            id={`sim-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`sim-panel-${t.id}`}
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </PixelButton>
        ))}
      </div>
      {/* Every tab stays mounted, so switching doesn't throw away a result (or a running simulation). */}
      {TABS.map((t) => (
        <div key={t.id} id={`sim-panel-${t.id}`} role="tabpanel" aria-labelledby={`sim-tab-${t.id}`} hidden={tab !== t.id}>
          {t.id === 'battle' ? <BattleSim data={data} /> : t.id === 'area' ? <AreaTestSim data={data} /> : <CampaignSim data={data} />}
        </div>
      ))}
    </div>
  )
}
