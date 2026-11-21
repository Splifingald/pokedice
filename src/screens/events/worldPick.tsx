// Small worlds (docs/21): the partner pick, the professor's lab in the world's colours. Apart from world.tsx so the
// screens that show a world's pieces (the Mart, the battle) don't load the lab and its canvas sprites.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRegion, worldFor } from '@/engine'
import { PartnerMoment } from '@/components/PartnerMoment'
import { useGame } from '@/store/game'
import { useServerNow } from '@/store/serverTime'
import { welcomeGiftAllowed } from '@/store/welcomeGift'
import { enterSmallWorld, worldName } from '@/store/worlds'
import { useWorldPick } from './world'

/** The partner pick: the professor's lab in the world's colours, its three partners. Mounted once, in GameLayout. */
export function WorldPick() {
  const navigate = useNavigate()
  const open = useWorldPick((s) => s.open)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const now = useServerNow(5000)
  const world = save ? worldFor(save, data, now) : null
  // The world closed while the lab was open: nothing to pick for.
  useEffect(() => {
    if (open && !world && now != null) useWorldPick.setState({ open: false })
  }, [open, world, now])
  // Ask the server about the starting gift (docs/64 §4.7) while the lab is open, so the pick doesn't wait for it.
  useEffect(() => {
    if (open) void welcomeGiftAllowed()
  }, [open])
  if (!open || !world) return null
  const region = getRegion(data, world.regionId)
  return (
    <PartnerMoment
      starters={world.starters.filter((d) => data.species[d])}
      regionId={world.regionId}
      regionName={worldName(world, data)}
      level={region?.starterLevel ?? 5}
      theme={world.theme}
      onLeave={() => useWorldPick.setState({ open: false })}
      onPick={(dex) => {
        useWorldPick.setState({ open: false })
        // The starting gift's present comes with the fresh start once the server allows it (cached by then).
        void welcomeGiftAllowed().then((welcome) => {
          if (enterSmallWorld(dex, welcome)) navigate('/home')
        })
      }}
    />
  )
}
