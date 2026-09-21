import { useState } from 'react'
import { teamOf, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { BoxSortPicker, sortBox, type BoxSort } from '@/components/BoxSort'
import { PixelIcon } from '@/components/icons'
import { ItemPanel } from '@/components/ItemPanel'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { reorderTeam } from '@/store/actions'
import { useGame } from '@/store/game'

/** The Box gets a search field once it holds more than this. */
const SEARCH_FROM = 20

export function TeamScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [view, setView] = useState<SheetView | null>(null)
  const [sort, setSort] = useState<BoxSort>('dex')
  const [q, setQ] = useState('')
  if (!save) return null
  const team = teamOf(save)
  const name = (p: PokemonInstance) => data.species[p.dex]?.name ?? t('ui.common.unknown')
  const boxAll = save.box.filter((p) => !save.team.includes(p.id))
  const needle = q.trim().toLowerCase()
  const box = sortBox(boxAll.filter((p) => !needle || name(p).toLowerCase().includes(needle)), sort, data)
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
          {t('ui.team.makeLead')}
        </PixelButton>
      )}
      <ItemPanel inst={p} />
    </>
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-5xl">{t('ui.team.title')}</h1>
      <ol className="flex flex-col gap-2">
        {team.map((p, i) => (
          <li key={p.id}>
            <MonCard
              inst={p}
              showXp
              showDice
              onClick={() => open(p)}
              badge={i === 0 ? <PixelIcon name="crown" size={20} title={t('ui.team.lead')} /> : null}
            >
              <div className="flex flex-col gap-1">
                <PixelButton size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('ui.team.moveUp', { name: name(p) })}>
                  ▲
                </PixelButton>
                <PixelButton size="sm" disabled={i === team.length - 1} onClick={() => move(i, 1)} aria-label={t('ui.team.moveDown', { name: name(p) })}>
                  ▼
                </PixelButton>
              </div>
            </MonCard>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-2" aria-labelledby="box-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="box-title" className="text-3xl">
            {t('ui.team.box', { count: boxAll.length })}
          </h2>
          {boxAll.length > 1 && <BoxSortPicker sort={sort} onChange={setSort} />}
        </div>
        {boxAll.length > SEARCH_FROM && (
          <>
            <label htmlFor="box-search" className="sr-only">
              {t('ui.team.searchBoxLabel')}
            </label>
            <input
              id="box-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('ui.team.searchBox')}
              className="min-h-[44px] w-full border-[3px] border-ink bg-panel px-2 text-xl md:min-h-[38px] md:w-64"
            />
          </>
        )}
        {boxAll.length === 0 && <p className="copy text-muted">{t('ui.team.boxEmpty')}</p>}
        {boxAll.length > 0 && box.length === 0 && <p className="copy text-muted">{t('ui.team.boxNoMatch', { query: q })}</p>}
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
