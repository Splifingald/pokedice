// Admin → Config → Intros (docs/54): every champion's own cinematic, to watch here without reaching its League. Each
// plays on a battle stage with its sample picture and team (Red with his Pikachu…), its card, and its lead thrown out.
// The switch is on the Switches tab.
import { useMemo, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { StageCanvas } from '@/components/StageCanvas'
import { sampleParams, type ChampionCinema } from '@/fx/timelines/cinema/champion'
import { CHAMPION_CINEMAS } from '@/fx/timelines/cinema/champions'
import { loadPicture, loadSprite } from '@/fx/sprites'
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

/** A champion's entrance on a battle stage, over the page: its sample picture, card and lead. */
function ChampionPreview({ cinema, onDone }: { cinema: ChampionCinema; onDone: () => void }) {
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
      <div className="w-full max-w-[960px]">
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
