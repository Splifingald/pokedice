// Admin → Config → Intros (docs/56): every champion's own cinematic, to watch here without reaching its League. Each
// plays on a battle stage with its sample picture and team (Red with his Pikachu…), its card, and its lead thrown out.
// The switch is on the Switches tab. Below it, the Gym Leaders' one film (docs/68), to watch in each type's colours.
import { useEffect, useMemo, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { StageCanvas } from '@/components/StageCanvas'
import { sampleParams, type ChampionCinema } from '@/fx/timelines/cinema/champion'
import { CHAMPION_CINEMAS } from '@/fx/timelines/cinema/champions'
import { GYM_CINEMA_TYPES, gymCinemaFor } from '@/fx/timelines/cinema/gymLeader'
import { gymPicture } from '@/fx/areaArt'
import type { PokeType } from '@/engine/types'
import { loadPicture, loadSprite } from '@/fx/sprites'
import { setArtUnderStage } from '@/fx/scenes'
import { Box } from '../widgets'

export function ChampionIntrosBox() {
  const [watching, setWatching] = useState<ChampionCinema | null>(null)
  const rows = Object.values(CHAMPION_CINEMAS)
  return (
    <Box
      title="Champion intros"
      icon="crown"
      hint="Each League Champion's own entrance (Red on Mt. Silver's summit, Leon's stadium…) instead of the trainer stepping onto the field. On (Switches tab): every champion's fight plays its own, rematches too. Watch any of them here."
    >
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 bg-panel p-2 shadow-card">
            <span className="text-lg">{c.sample.name}</span>
            <PixelButton size="sm" onClick={() => setWatching(c)}>
              Watch
            </PixelButton>
          </li>
        ))}
      </ul>
      {watching && <ChampionPreview cinema={watching} onDone={() => setWatching(null)} />}
    </Box>
  )
}

export function GymIntrosBox() {
  const [watching, setWatching] = useState<PokeType | null>(null)
  return (
    <Box
      title="Gym Leader intros"
      icon="crown"
      hint="One stadium entrance for every Gym Leader, lit in its gym type's colours, with the leader's own picture and name. On (Switches tab): every Gym Leader's fight plays it. Watch it in any type's colours here, with a leader of that type."
    >
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
        {GYM_CINEMA_TYPES.map((type) => (
          <li key={type} className="flex items-center justify-between gap-2 bg-panel p-2 shadow-card">
            <span className="text-lg capitalize">{type}</span>
            <PixelButton size="sm" onClick={() => setWatching(type)}>
              Watch
            </PixelButton>
          </li>
        ))}
      </ul>
      {watching && (
        <ChampionPreview
          cinema={gymCinemaFor(watching)}
          ground={gymPicture(watching)?.url}
          onDone={() => setWatching(null)}
        />
      )}
    </Box>
  )
}

/**
 * A champion's entrance on a battle stage, over the page: its sample picture, card and lead; over its battle's ground
 * when it has one (a gym's type picture), as in the fight.
 */
function ChampionPreview({
  cinema,
  ground,
  onDone,
}: {
  cinema: ChampionCinema
  ground?: string
  onDone: () => void
}) {
  // Over a ground picture the stage draws none of its own (as in a battle): set before the timeline is made.
  useMemo(() => setArtUnderStage(!!ground), [ground])
  useEffect(() => () => setArtUnderStage(false), [])
  const scene = useMemo(() => {
    const s = cinema.sample
    return {
      timeline: cinema.makeBattle(sampleParams(s)),
      ready: Promise.all([
        loadPicture(s.trainer),
        loadSprite(6, true),
        ...[s.lead, s.ace, ...cinema.extras].map((d) => loadSprite(d, false)),
      ]),
    }
  }, [cinema])
  return (
    <div
      role="dialog"
      aria-label={cinema.sample.name}
      className="fixed inset-0 z-[120] grid place-items-center bg-[#05060d] p-4"
      onClick={onDone}
    >
      <div
        className="w-full max-w-[960px] bg-cover bg-center [image-rendering:pixelated]"
        style={ground ? { backgroundImage: `url(${ground})` } : undefined}
      >
        <StageCanvas
          timeline={scene.timeline}
          ready={scene.ready}
          onEnd={() => setTimeout(onDone, 600)}
          label={cinema.sample.name}
        />
      </div>
    </div>
  )
}
