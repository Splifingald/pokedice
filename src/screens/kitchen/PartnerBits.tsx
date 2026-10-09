// Kitchen sink: the partner moment in each lab. It is a flow, so its states (the drop, the choice, the question, the
// partner) are played through rather than laid out side by side.
import { useState } from 'react'
import type { Region } from '@/engine'
import { PartnerMoment } from '@/components/PartnerMoment'
import { PixelButton } from '@/components/PixelButton'
import { useGame } from '@/store/game'

export function PartnerBits() {
  const data = useGame((s) => s.data)
  const [region, setRegion] = useState<Region | null>(null)
  const [picked, setPicked] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2">
      {data.regions.slice(0, 4).map((r) => (
        <PixelButton key={r.id} size="sm" onClick={() => setRegion(r)}>
          {r.name} lab
        </PixelButton>
      ))}
      {picked && <span className="font-pixel-sm text-[15px] text-muted">Picked: {picked}</span>}
      {region && (
        <PartnerMoment
          starters={region.starters.filter((d) => data.species[d])}
          regionId={region.id}
          regionName={region.name}
          level={data.config.starterLevel}
          onLeave={() => setRegion(null)}
          onPick={(dex) => {
            setPicked(data.species[dex]?.name ?? String(dex))
            setRegion(null)
          }}
        />
      )}
    </div>
  )
}
