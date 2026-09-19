import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { isAreaUnlocked, regionOf, regionOfArea, regionSpecies, unlockedRegions } from '@/engine'
import { PixelIcon } from '@/components/icons'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { SpriteImg } from '@/components/SpriteImg'
import { dexNo } from '@/lib/format'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

type Filter = 'all' | 'caught' | 'missing' | 'catchable'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'caught', label: 'caught' },
  { id: 'missing', label: 'missing' },
  { id: 'catchable', label: 'catchable now' },
]
const JUMPS = [1, 26, 51, 76, 101, 126]

export function PokedexScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [view, setView] = useState<SheetView | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  // A page per region the player has been to, plus 'all'. One region = no tabs at all.
  const [page, setPage] = useState<string>(() => (save ? regionOf(save) : 'all'))

  const owned = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of save?.box ?? []) m.set(p.dex, Math.max(m.get(p.dex) ?? 0, p.level))
    return m
  }, [save])

  // Missing species you can meet right now: in a wild pool (or as a legendary) of an area you've opened.
  const catchable = useMemo(() => {
    const set = new Set<number>()
    if (!save) return set
    for (const a of data.areas) {
      // "Catchable now" means without leaving: an unlocked area of the region you are standing in.
      if (regionOfArea(a) !== regionOf(save) || !isAreaUnlocked(save, a.id, data)) continue
      for (const w of a.wildPool) if (w.weight > 0 && !save.pokedex.includes(w.dex)) set.add(w.dex)
      for (const b of a.legendaryBoss ?? []) if (!save.pokedex.includes(b.dex)) set.add(b.dex)
    }
    return set
  }, [save, data])

  if (!save) return null
  const caught = new Set(save.pokedex)
  const pages = unlockedRegions(save, data)
  // Every region's page counts only what that region can actually give you — its pools, bosses and starters.
  const inPage = page === 'all' ? null : regionSpecies(data, page)
  const pageList = inPage ? data.speciesList.filter((s) => inPage.has(s.dex)) : data.speciesList
  const total = pageList.length
  const n = pageList.filter((s) => caught.has(s.dex)).length
  const needle = q.trim().toLowerCase()
  const asNumber = /^#?\d+$/.test(needle) ? Number(needle.replace('#', '')) : null
  const list = pageList
    .filter((s) =>
      filter === 'all'
        ? true
        : filter === 'caught'
          ? caught.has(s.dex)
          : filter === 'missing'
            ? !caught.has(s.dex)
            : catchable.has(s.dex),
    )
    // Uncaught names stay hidden: searching by name only finds what you've caught.
    .filter(
      (s) =>
        !needle ||
        (asNumber != null ? s.dex === asNumber : caught.has(s.dex) && s.name.toLowerCase().includes(needle)),
    )

  const jump = (from: number) => {
    const target = list.find((s) => s.dex >= from) ?? list[list.length - 1]
    if (target)
      document
        .getElementById(`dex-${target.dex}`)
        ?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-5xl">Pokédex</h1>
        <div className="text-3xl">
          {n}/{total}
        </div>
      </div>
      {pages.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pokédex">
          {[...pages.map((r) => ({ id: r.id, label: r.name })), { id: 'all', label: 'All' }].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPage(t.id)}
              aria-pressed={page === t.id}
              className={cx('pixel-btn min-h-[40px] px-3 text-xl', page === t.id ? 'bg-gold' : 'bg-panel')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="h-4 border-2 border-ink bg-ink p-[2px]">
        <div
          className="h-full bg-danger"
          style={{ width: `${(n / total) * 100}%`, transition: 'width 600ms' }}
        />
      </div>

      {n >= total && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="pixel-panel-dark flex flex-col items-center gap-2 p-5 text-center"
        >
          <PixelIcon name="star" size={40} />
          <div className="text-5xl text-gold">POKÉDEX COMPLETE!</div>
          <div className="text-2xl">
            All {total} Pokémon caught{page === 'all' ? '' : ` in ${pages.find((r) => r.id === page)?.name}`}.
            You are a true Pokédice Master.
          </div>
        </motion.div>
      )}

      {/* Search, filters and the jump bar stay under the top bar while the grid scrolls. */}
      <div className="sticky top-14 z-30 -mx-3 flex flex-col gap-2 border-b-[3px] border-ink bg-parchment px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="dex-search" className="sr-only">
            Search the Pokédex by name or number
          </label>
          <input
            id="dex-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or #number"
            className="min-h-[44px] w-full border-[3px] border-ink bg-panel px-2 text-xl md:min-h-[38px] md:w-56"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cx(
                  'pixel-btn min-h-[44px] min-w-[44px] px-2 text-lg md:min-h-[36px]',
                  filter === f.id ? 'bg-gold' : 'bg-panel',
                )}
              >
                {f.label}
                {f.id === 'catchable' && <span className="font-pixel-sm text-base"> ({catchable.size})</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Jump to number">
          {JUMPS.map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => jump(j)}
              className="pixel-btn min-h-[44px] shrink-0 bg-panel px-2 font-pixel-sm text-lg md:min-h-[32px]"
            >
              {dexNo(j)}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && (
        <p className="copy text-muted">
          {filter === 'catchable'
            ? "You've caught everything the areas you've opened have to offer — clear the next area."
            : 'No Pokémon match.'}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 xs:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">
        {list.map((s) => {
          const has = caught.has(s.dex)
          const lv = owned.get(s.dex)
          return (
            <button
              key={s.dex}
              id={`dex-${s.dex}`}
              type="button"
              onClick={() => setView({ kind: 'dex', dex: s.dex })}
              className={cx(
                'pixel-panel flex scroll-mt-48 flex-col items-center p-1 hover:bg-white',
                !has && 'bg-parchment',
              )}
              title={has ? s.name : '??? — where to find it'}
            >
              <span className="self-start font-mono text-xs text-muted">{dexNo(s.dex)}</span>
              <SpriteImg dex={s.dex} size={64} silhouette={!has} />
              <span className="w-full truncate text-center text-base leading-none">
                {has ? s.name : '???'}
              </span>
              <span className="text-sm leading-none text-muted">
                {has ? (lv ? `Lv.${lv}` : 'seen') : catchable.has(s.dex) ? 'nearby' : ' '}
              </span>
            </button>
          )
        })}
      </div>

      <SheetModal view={view} onClose={() => setView(null)} />
    </div>
  )
}
