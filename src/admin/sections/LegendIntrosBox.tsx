// Admin → Config → Legendary intros (docs/53): every legend's own cinematic, to watch here without reaching its raid or
// its boss fight. A raid's plays the raid intro itself (its words, three sample sides); a boss's plays on a battle stage
// with its name card and a Charizard sent out. The switch is on the Switches tab.
import { useMemo, useState } from 'react'
import { getSpecies, speciesName, type PokeType } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { StageCanvas } from '@/components/StageCanvas'
import { BOSS_CINEMAS, RAID_CINEMAS } from '@/fx/timelines/cinema'
import { legendLook } from '@/fx/timelines/legend'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { RaidIntro } from '@/screens/events/RaidIntro'
import type { RaidRun } from '@/store/raidBattle'
import { useGame } from '@/store/game'
import { typeName } from '@/lib/format'
import { Box } from '../widgets'

type Watching = { kind: 'raid' | 'boss'; dex: number; shiny: boolean } | null

export function LegendIntrosBox() {
  const data = useGame((s) => s.data)
  const [watching, setWatching] = useState<Watching>(null)
  const [shiny, setShiny] = useState(false)
  const rows = [
    ...Object.keys(RAID_CINEMAS).map((d) => ({ kind: 'raid' as const, dex: Number(d) })),
    ...Object.keys(BOSS_CINEMAS).map((d) => ({ kind: 'boss' as const, dex: Number(d) })),
  ]
  return (
    <Box
      title="Legendary intros"
      icon="sparkle"
      hint="Each legend's own entrance (Mewtwo's lab, Articuno's ice cavern…) instead of the shared one, and no warning tapes on a legend's raid. On (Switches tab): raids and boss fights play them; the others keep the shared entrance until theirs is made. Watch any of them here."
    >
      <label className="flex min-h-[44px] items-center gap-2 text-lg">
        <input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} />
        Shiny
      </label>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {rows.map((r) => (
          <li
            key={`${r.kind}${r.dex}`}
            className="flex items-center justify-between gap-2 bg-panel p-2 shadow-card"
          >
            <span className="text-lg">
              {speciesName(data, r.dex)}{' '}
              <small className="text-muted">{r.kind === 'raid' ? 'raid' : 'boss fight'}</small>
            </span>
            <PixelButton size="sm" onClick={() => setWatching({ ...r, shiny })}>
              Watch
            </PixelButton>
          </li>
        ))}
      </ul>
      {watching?.kind === 'raid' && (
        <RaidPreview dex={watching.dex} shiny={watching.shiny} onDone={() => setWatching(null)} />
      )}
      {watching?.kind === 'boss' && (
        <BossPreview dex={watching.dex} shiny={watching.shiny} onDone={() => setWatching(null)} />
      )}
    </Box>
  )
}

/** The raid intro as a raid would open it: the legend, its bars, the player and two NPC sides with sample leads. */
function RaidPreview({ dex, shiny, onDone }: { dex: number; shiny: boolean; onDone: () => void }) {
  const data = useGame((s) => s.data)
  const run = useMemo(() => {
    const side = (kind: 'me' | 'npc', owner: string, lead: number) => ({
      kind,
      owner,
      mons: [{ dex: lead, name: speciesName(data, lead) }],
    })
    return {
      id: -dex,
      state: {
        boss: { dex, name: speciesName(data, dex), shiny, level: 70 },
        bars: 4,
        sides: [side('me', 'You', 6), side('npc', 'Ace Trainer Kai', 9), side('npc', 'Ace Trainer Mia', 3)],
      },
    } as unknown as RaidRun
  }, [data, dex, shiny])
  return (
    <RaidIntro
      run={run}
      onDone={onDone}
      legend={{ cinema: RAID_CINEMAS[dex], skippable: true, quiet: true }}
    />
  )
}

/** A boss's entrance on a battle stage, over the page, with its name card and a Charizard sent out. */
function BossPreview({ dex, shiny, onDone }: { dex: number; shiny: boolean; onDone: () => void }) {
  const data = useGame((s) => s.data)
  const scene = useMemo(() => {
    const sp = data.species[dex] ? getSpecies(data, dex) : null
    const types: PokeType[] = sp ? [sp.type1, ...(sp.type2 ? [sp.type2] : [])] : ['psychic']
    return {
      timeline: BOSS_CINEMAS[dex]!.makeBattle({
        own: spriteKey(6, true),
        foe: spriteKey(dex, false, shiny),
        look: legendLook(dex, types[0]!),
        name: speciesName(data, dex),
        level: 'Lv.65',
        types: types.map((ty) => typeName(ty)).join(' / '),
      }),
      ready: Promise.all([loadSprite(6, true), loadSprite(dex, false, shiny)]),
    }
  }, [data, dex, shiny])
  return (
    <div
      role="dialog"
      aria-label={speciesName(data, dex)}
      className="fixed inset-0 z-[120] grid place-items-center bg-[#05060d] p-4"
      onClick={onDone}
    >
      <div className="w-full max-w-[960px]">
        <StageCanvas
          timeline={scene.timeline}
          ready={scene.ready}
          onEnd={() => setTimeout(onDone, 600)}
          label={speciesName(data, dex)}
        />
      </div>
    </div>
  )
}
