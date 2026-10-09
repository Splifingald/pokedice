import { useState } from 'react'
import { POKE_TYPES, teamOf, type PokemonInstance, type PokeType } from '@/engine'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { sortBox, type BoxSort } from '@/components/BoxSort'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { MonTile, TILE_GRID } from '@/components/MonTile'
import { PageHead } from '@/components/PageHead'
import { FilterChips, SearchField, Seg } from '@/components/Segmented'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { countdown, typeName } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { typeColor } from '@/theme/util'
import { TeamCards } from './team/TeamCards'

type Sort = Exclude<BoxSort, 'type'>

export function TeamScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  // Inside a Pokémon Center the team can change, so the rule has nothing to warn about.
  const atCenter = useGame((s) => s.run.phase === 'center')
  const now = useNow(30_000)
  const [view, setView] = useState<SheetView | null>(null)
  const [sort, setSort] = useState<Sort>('dex')
  const [type, setType] = useState<PokeType | 'all'>('all')
  const [q, setQ] = useState('')
  if (!save) return null
  const team = teamOf(save)
  const name = (p: PokemonInstance) => data.species[p.dex]?.name ?? t('ui.common.unknown')
  const typesOf = (p: PokemonInstance) => {
    const s = data.species[p.dex]
    return s ? [s.type1, ...(s.type2 ? [s.type2] : [])] : []
  }
  const boxAll = save.box.filter((p) => !save.team.includes(p.id))
  const boxTypes = POKE_TYPES.filter((ty) => boxAll.some((p) => typesOf(p).includes(ty)))
  const needle = searchFold(q)
  const box = sortBox(
    boxAll.filter(
      (p) =>
        (!needle || searchFold(name(p)).includes(needle)) && (type === 'all' || typesOf(p).includes(type)),
    ),
    sort,
    data,
  )
  const open = (p: PokemonInstance) => setView({ kind: 'inst', id: p.id })

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <PageHead icon="navTeam" title={t('ui.team.title')} count={`${team.length}/${data.config.maxTeamSize}`}>
        {!atCenter && (
          <button
            type="button"
            onClick={() => pushToast(t('ui.team.swapsRule'), 'info')}
            className="inline-flex min-h-[44px] items-center gap-1.5 bg-well px-2.5 font-pixel-sm text-[15px] text-muted shadow-ring-line md:min-h-[36px]"
          >
            <PixelIcon name="lock" size={16} />
            {t('ui.team.swapsHint')}
          </button>
        )}
      </PageHead>

      <TeamCards team={team} onOpen={open} />
      {team.length > 1 && (
        <p className="-mt-1 text-center font-pixel-sm text-[15px] leading-tight text-muted">
          {t('ui.team.dragTip')}
        </p>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="box-title">
        <div className="mt-1 flex items-baseline gap-2">
          <h2 id="box-title" className="text-[24px] leading-none">
            {t('ui.team.boxHeading')}
          </h2>
          <span className="font-pixel-sm text-[17px] text-muted">{boxAll.length}</span>
        </div>
        {boxAll.length === 0 && <p className="copy text-muted">{t('ui.team.boxEmpty')}</p>}
        {boxAll.length > 1 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SearchField
                id="box-search"
                value={q}
                onChange={setQ}
                label={t('ui.team.searchBoxLabel')}
                placeholder={t('ui.team.searchBox')}
                className="min-w-0 flex-[1_1_150px]"
              />
              <Seg
                label={t('ui.team.sortBox')}
                value={sort}
                onChange={setSort}
                options={[
                  { id: 'dex', label: t('ui.team.sortDex') },
                  { id: 'level', label: t('ui.team.sortLevel') },
                  { id: 'newest', label: t('ui.team.sortNewest') },
                ]}
              />
            </div>
            {boxTypes.length > 1 && (
              <FilterChips
                label={t('ui.team.filterType')}
                value={type}
                onChange={setType}
                options={[
                  { id: 'all', label: t('ui.team.allTypes') },
                  ...boxTypes.map((ty) => ({
                    id: ty,
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        <i
                          className="h-2.5 w-2.5 shadow-ring-thin"
                          style={{ background: typeColor(ty) }}
                          aria-hidden
                        />
                        {typeName(ty)}
                      </span>
                    ),
                  })),
                ]}
              />
            )}
          </>
        )}
        {boxAll.length > 0 && box.length === 0 && (
          <p className="copy text-muted">
            {q ? t('ui.team.boxNoMatch', { query: q }) : t('ui.team.boxNoType')}
          </p>
        )}
        <ul className={TILE_GRID}>
          {box.map((p) => {
            const fossil = p.revivesAt != null && p.fossil ? data.items[p.fossil] : undefined
            const reviving = p.revivesAt != null
            const left = reviving ? Math.max(0, p.revivesAt! - now) : 0
            const sub = reviving
              ? left > 0
                ? countdown(left)
                : t('ui.mon.soon')
              : t('ui.common.level.short', { n: p.level })
            return (
              <li key={p.id}>
                <MonTile
                  dex={p.dex}
                  name={name(p)}
                  sub={sub}
                  icon={reviving ? <ItemSprite item={fossil} size={40} /> : undefined}
                  label={[
                    name(p),
                    p.shiny ? t('ui.mon.shiny') : null,
                    reviving
                      ? t('ui.mon.revivesIn', { time: sub })
                      : t('ui.common.level.short', { n: p.level }),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => open(p)}
                  tags={
                    p.shiny && <PixelIcon name="star" size={12} className="absolute left-[5px] top-[5px]" />
                  }
                />
              </li>
            )
          })}
        </ul>
      </section>

      <SheetModal view={view} onClose={() => setView(null)} manage />
    </div>
  )
}
