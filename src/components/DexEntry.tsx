import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAreaUnlocked, type Area, type GameData } from '@/engine'
import { dexNo } from '@/lib/format'
import { useGame } from '@/store/game'
import { enterArea } from '@/store/run'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { evolutionHow, PokemonSheet } from './PokemonSheet'
import { SpriteImg } from './SpriteImg'
import { AreaBanner } from '@/components/AreaBanner'

interface Spot {
  area: Area
  minLevel: number
  maxLevel: number
  /** Share of the area's wild pool (0 for a legendary). */
  share: number
  legendary: boolean
}

/** Every area where a species turns up in the wild or as a legendary, main chain first, secret areas last. */
function whereToFind(dex: number, data: GameData): Spot[] {
  const out: Spot[] = []
  for (const area of data.areas) {
    const total = area.wildPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
    const hits = area.wildPool.filter((e) => e.dex === dex && e.weight > 0)
    if (hits.length && total) {
      out.push({
        area,
        minLevel: Math.min(...hits.map((h) => h.minLevel)),
        maxLevel: Math.max(...hits.map((h) => h.maxLevel)),
        share: hits.reduce((sum, h) => sum + h.weight, 0) / total,
        legendary: false,
      })
    }
    const boss = area.legendaryBoss?.find((b) => b.dex === dex)
    if (boss) out.push({ area, minLevel: boss.level, maxLevel: boss.level, share: 0, legendary: true })
  }
  return out.sort((a, b) => Number(a.area.hidden) - Number(b.area.hidden) || a.area.orderIndex - b.area.orderIndex)
}

const rarity = (share: number) => (share >= 0.15 ? 'common' : share >= 0.06 ? 'uncommon' : 'rare')

function SpotCard({ spot, onTravel }: { spot: Spot; onTravel?: () => void }) {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const runArea = useGame((s) => s.run.areaId)
  const navigate = useNavigate()
  if (!save) return null
  const { area } = spot
  const unlocked = isAreaUnlocked(save, area.id, data)
  const secret = area.hidden && !unlocked
  const levels = area.scalesToTeam
    ? 'levels scale to your team'
    : spot.minLevel === spot.maxLevel
      ? `Lv.${spot.minLevel}`
      : `Lv.${spot.minLevel}–${spot.maxLevel}`
  return (
    <li className="pixel-panel overflow-hidden p-0">
      {area.bannerUrl && (
        <AreaBanner url={area.bannerUrl} className={cx('h-16', !unlocked && 'opacity-70 grayscale', secret && 'blur-[1px]')} />
      )}
      <div className="flex flex-wrap items-center gap-2 p-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-2xl leading-none">
            {!unlocked && <PixelIcon name="lock" size={16} title="Locked" />}
            <span className="truncate">{secret ? 'A secret area' : area.name}</span>
          </div>
          <div className="text-lg text-muted">
            {spot.legendary ? `Legendary · ${levels}` : `${levels} · ${rarity(spot.share)}`}
            {!unlocked && ' · locked'}
          </div>
        </div>
        {unlocked && runArea === area.id && (
          <span className="border-2 border-ink bg-gold px-1.5 text-base leading-tight text-ink">you are here</span>
        )}
        {unlocked && !runArea && (
          <PixelButton
            size="sm"
            variant="primary"
            onClick={() => {
              if (!enterArea(area.id)) return
              onTravel?.()
              navigate('/area')
            }}
          >
            GO THERE
          </PixelButton>
        )}
      </div>
    </li>
  )
}

/** An uncaught species: its silhouette, and where it can be found (or what it evolves from). */
function MissingEntry({ dex, onOpenDex, onTravel }: { dex: number; onOpenDex?: (dex: number) => void; onTravel?: () => void }) {
  const data = useGame((s) => s.data)
  const pokedex = useGame((s) => s.save?.pokedex)
  const runArea = useGame((s) => s.run.areaId)
  const spots = useMemo(() => whereToFind(dex, data), [dex, data])
  const from = data.speciesList
    .map((s) => ({ species: s, evo: s.evolutions.find((e) => e.toDex === dex) }))
    .filter((x) => !!x.evo)
  const runName = runArea ? data.areas.find((a) => a.id === runArea)?.name : null
  const canTravelSomewhere = spots.some((s) => s.area.id !== runArea)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SpriteImg dex={dex} size={112} silhouette className="border-[3px] border-ink bg-parchment" />
        <div className="min-w-0">
          <div className="font-mono text-sm text-muted">{dexNo(dex)}</div>
          <div className="text-4xl leading-none">???</div>
          <p className="copy text-muted">Not caught yet.</p>
        </div>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-2xl">Where to find it</h3>
        {spots.length > 0 && (
          <ul className="flex flex-col gap-2">
            {spots.map((s) => (
              <SpotCard key={`${s.area.id}-${s.legendary}`} spot={s} onTravel={onTravel} />
            ))}
          </ul>
        )}
        {from.map(({ species, evo }) => {
          const known = pokedex?.includes(species.dex)
          return (
            <button
              key={species.dex}
              type="button"
              onClick={() => onOpenDex?.(species.dex)}
              className="pixel-panel flex w-full items-center gap-2 p-2 text-left hover:bg-white"
            >
              <SpriteImg dex={species.dex} size={48} silhouette={!known} />
              <span className="text-xl leading-tight">
                Evolves from {known ? species.name : '???'} {evo!.item ? `with a ${evolutionHow(evo!, data)}` : `at ${evolutionHow(evo!, data)}`}
              </span>
            </button>
          )
        })}
        {spots.length === 0 && from.length === 0 && <p className="copy text-muted">Nobody has spotted it in the wild yet…</p>}
        {runName && canTravelSomewhere && (
          <p className="copy text-muted">You're exploring {runName}: leave it (MAP) to travel somewhere else.</p>
        )}
      </section>
    </div>
  )
}

/** A Pokédex entry: the full sheet once caught, otherwise where to find it. */
export function DexEntry({ dex, onOpenDex, onTravel }: { dex: number; onOpenDex?: (dex: number) => void; onTravel?: () => void }) {
  const save = useGame((s) => s.save)
  if (!save) return null
  if (!save.pokedex.includes(dex)) return <MissingEntry dex={dex} onOpenDex={onOpenDex} onTravel={onTravel} />
  const best = save.box.filter((p) => p.dex === dex).sort((a, b) => b.level - a.level)[0]
  return <PokemonSheet dex={dex} inst={best} onOpenDex={onOpenDex} />
}
