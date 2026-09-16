import { useState } from 'react'
import { teamOf, type PokemonInstance } from '@/engine'
import { ItemPanel } from '@/components/ItemPanel'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { reorderTeam } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

type Sort = 'dex' | 'level' | 'type' | 'newest'
const SORTS: { id: Sort; label: string }[] = [
  { id: 'dex', label: 'No.' },
  { id: 'level', label: 'Level' },
  { id: 'type', label: 'Type' },
  { id: 'newest', label: 'Newest' },
]
/** The Box gets a search field once it holds more than this. */
const SEARCH_FROM = 20

export function TeamScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [view, setView] = useState<SheetView | null>(null)
  const [sort, setSort] = useState<Sort>('dex')
  const [q, setQ] = useState('')
  if (!save) return null
  const team = teamOf(save)
  const name = (p: PokemonInstance) => data.species[p.dex]?.name ?? '???'
  const type1 = (p: PokemonInstance) => data.species[p.dex]?.type1 ?? ''
  const boxAll = save.box.filter((p) => !save.team.includes(p.id))
  const needle = q.trim().toLowerCase()
  const box = boxAll
    .filter((p) => !needle || name(p).toLowerCase().includes(needle))
    .sort((a, b) =>
      sort === 'level'
        ? b.level - a.level || a.dex - b.dex
        : sort === 'type'
          ? type1(a).localeCompare(type1(b)) || a.dex - b.dex
          : sort === 'newest'
            ? b.caughtAt - a.caughtAt
            : a.dex - b.dex || b.level - a.level,
    )
  const move = (i: number, d: -1 | 1) => {
    const ids = [...save.team]
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    reorderTeam(ids)
  }
  const open = (p: PokemonInstance) => setView({ kind: 'inst', id: p.id })

  // Inside the details sheet: "Make lead" for a team member, then "Use an item".
  const sheetExtra = (p: PokemonInstance) => (
    <>
      {save.team.includes(p.id) && save.team[0] !== p.id && (
        <PixelButton variant="primary" className="self-start" onClick={() => reorderTeam([p.id, ...save.team.filter((x) => x !== p.id)])}>
          Make lead
        </PixelButton>
      )}
      <ItemPanel inst={p} />
    </>
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-5xl">Team</h1>
      <ol className="flex flex-col gap-2">
        {team.map((p, i) => (
          <li key={p.id}>
            <MonCard
              inst={p}
              showXp
              showDice
              onClick={() => open(p)}
              badge={i === 0 ? <span className="border-2 border-ink bg-gold px-1 text-sm leading-tight text-ink">LEAD</span> : null}
            >
              <div className="flex flex-col gap-1">
                <PixelButton size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${name(p)} up`}>
                  ▲
                </PixelButton>
                <PixelButton size="sm" disabled={i === team.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${name(p)} down`}>
                  ▼
                </PixelButton>
              </div>
            </MonCard>
          </li>
        ))}
      </ol>
      <p className="copy text-muted">
        Tap a Pokémon for its details — make it lead, or use Potions and Rare Candy from there. Team changes happen at a
        Pokémon Center (or when a catch offers a swap). Fainted Pokémon regain {data.config.regenPercentPerHour} % of their HP
        every hour, or heal fully at a Center.
      </p>

      <section className="flex flex-col gap-2" aria-labelledby="box-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="box-title" className="text-3xl">
            Box ({boxAll.length})
          </h2>
          {boxAll.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sort the Box">
              <span className="text-lg text-muted">Sort</span>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sort === s.id}
                  onClick={() => setSort(s.id)}
                  className={cx('pixel-btn min-h-[44px] px-2 text-lg md:min-h-[32px]', sort === s.id ? 'bg-gold' : 'bg-panel')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {boxAll.length > SEARCH_FROM && (
          <>
            <label htmlFor="box-search" className="sr-only">
              Search the Box by name
            </label>
            <input
              id="box-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the Box"
              className="min-h-[44px] w-full border-[3px] border-ink bg-panel px-2 text-xl md:min-h-[38px] md:w-64"
            />
          </>
        )}
        {boxAll.length === 0 && <p className="copy text-muted">Pokémon you catch beyond your team of three wait here.</p>}
        {boxAll.length > 0 && box.length === 0 && <p className="copy text-muted">No Pokémon in the Box match “{q}”.</p>}
        <ul className="flex flex-col gap-2">
          {box.map((p) => (
            <li key={p.id}>
              <MonCard inst={p} onClick={() => open(p)} />
            </li>
          ))}
        </ul>
      </section>

      <SheetModal view={view} onClose={() => setView(null)} instExtra={sheetExtra} />
    </div>
  )
}
