import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  badgeCase,
  isAreaClosed,
  isAreaUnlocked,
  progressOf,
  regionOf,
  regionOfArea,
  shopSells,
  type Area,
  type Evolution,
  type GameData,
  type ItemDef,
  type RegionId,
} from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { evolutionHow, PokemonSheet, useVisibleEvolutions } from './PokemonSheet'
import { MiniSprite } from './SpriteImg'
import { areaStatus, lockReason } from '@/screens/home/areas'
import { AreaStrip } from './AreaStrip'
import { travelTo } from '@/store/travel'

interface Spot {
  area: Area
  minLevel: number
  maxLevel: number
  /** Share of the area's wild pool — or of its loot table for a fossil (0 for a legendary). */
  share: number
  legendary: boolean
  /** Set when the species is revived from a fossil found here rather than met in the grass. */
  fossil?: ItemDef
  /** Set when this is where an item (an evolution stone…) turns up in the loot, not a Pokémon. */
  loot?: { item: ItemDef; entryId: string; unique: boolean }
}

const byRoute = (a: Spot, b: Spot) => Number(a.area.hidden) - Number(b.area.hidden) || a.area.orderIndex - b.area.orderIndex

/**
 * Every area of `region` where a species turns up in the wild or as a legendary, main chain first, secret areas
 * last.
 *
 * Only the region being played: its areas are the only ones the player can reach, the only ones whose lock state
 * `isAreaUnlocked` can answer for (it reads the live region's progress), and the only ones the card's travel button
 * can enter. Listing another region's routes offered a Kanto player a walk to Mount Silver.
 */
export function whereToFind(dex: number, data: GameData, region: RegionId): Spot[] {
  const out: Spot[] = []
  for (const area of data.areas) {
    if (regionOfArea(area) !== region) continue
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

    // Omanyte, Kabuto and Aerodactyl are wild nowhere: they are dug out of an area's loot table as a fossil, and
    // without this the only Pokémon in the game you have to go looking for had no entry telling you where.
    const lootTotal = area.lootPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
    for (const entry of area.lootPool) {
      if (entry.weight <= 0) continue
      const item = data.items[entry.itemKey]
      if (item?.effect.kind !== 'fossil' || item.effect.dex !== dex) continue
      out.push({
        area,
        // A fossil revives at its own level, whatever the area does to wild ones.
        minLevel: item.effect.level,
        maxLevel: item.effect.level,
        share: lootTotal ? entry.weight / lootTotal : 0,
        legendary: false,
        fossil: item,
      })
    }
  }
  return out.sort(byRoute)
}

/** Every area of `region` whose loot table holds `itemKey` — same order, and same one-region rule, as `whereToFind`. */
export function whereToFindItem(itemKey: string, data: GameData, region: RegionId): Spot[] {
  const item = data.items[itemKey]
  if (!item) return []
  const out: Spot[] = []
  for (const area of data.areas) {
    if (regionOfArea(area) !== region) continue
    const lootTotal = area.lootPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
    for (const entry of area.lootPool) {
      if (entry.itemKey !== itemKey || entry.weight <= 0) continue
      out.push({
        area,
        minLevel: 0,
        maxLevel: 0,
        share: lootTotal ? entry.weight / lootTotal : 0,
        legendary: false,
        loot: { item, entryId: entry.id, unique: entry.unique },
      })
    }
  }
  return out.sort(byRoute)
}

export const rarity = (share: number) => t(share >= 0.15 ? 'ui.dex.common' : share >= 0.06 ? 'ui.dex.uncommon' : 'ui.dex.rare')

/**
 * One place a species (or an item) turns up: the area's strip, its name, how it shows there, and the same GO as the
 * Areas list (travel there; Home's CONTINUE then plays it). A locked area says why; a secret one keeps its name.
 */
function SpotCard({ spot, onTravel }: { spot: Spot; onTravel?: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  if (!save) return null
  const { area } = spot
  const st = areaStatus(save, data, area)
  const locked = st === 'locked'
  const secret = area.hidden && locked
  const closed = !locked && isAreaClosed(save, area.id, data)
  const levels = area.scalesToTeam && !spot.fossil
    ? t('ui.dex.scaling')
    : spot.minLevel === spot.maxLevel
      ? t('ui.common.level.short', { n: spot.minLevel })
      : t('ui.map.levelRange', { min: spot.minLevel, max: spot.maxLevel })
  const name = secret ? t('ui.dex.aSecretArea') : area.name
  const go = () => {
    if (st !== 'here' && !travelTo(area)) return
    onTravel?.()
    navigate('/home')
  }
  return (
    <li
      className={cx(
        'relative flex min-h-[62px] items-center gap-2 py-1.5 pl-1.5 pr-[78px]',
        locked
          ? 'bg-well text-muted shadow-ring-line'
          : st === 'here'
            ? 'bg-paper shadow-[inset_0_0_0_3px_#ff8a3d]'
            : st === 'cleared'
              ? 'bg-paper shadow-[inset_0_0_0_3px_#34c97a]'
              : 'bg-paper shadow-ring',
      )}
    >
      <AreaStrip
        area={area}
        h={48}
        className={cx('h-12 w-[72px] shrink-0 shadow-halo', locked && 'grayscale-[0.7]', secret && 'blur-[1px]')}
      />
      <span className="grid min-w-0 gap-[3px]">
        <b className="truncate text-[18px] font-normal leading-none">{name}</b>
        <small className="font-pixel-sm text-[14px] leading-tight text-muted">
          {spot.loot
            ? spot.loot.unique
              ? t('ui.dex.lootOnce') + (progressOf(save, area.id).uniqueFound?.includes(spot.loot.entryId) ? t('ui.dex.alreadyFoundSuffix') : '')
              : t('ui.dex.lootSpot', { rarity: rarity(spot.share) })
            : spot.fossil
              ? t('ui.dex.fossilSpot', { item: spot.fossil.name, levels, rarity: rarity(spot.share) })
              : spot.legendary
                ? t('ui.dex.legendarySpot', { levels })
                : t('ui.dex.wildSpot', { levels, rarity: rarity(spot.share) })}
          {locked && ` · ${lockReason(save, data, area) || t('ui.dex.locked')}`}
          {closed && t('ui.dex.closedSuffix')}
        </small>
      </span>
      {locked || closed ? (
        <span className="absolute right-2.5 top-1/2 grid h-11 w-[60px] -translate-y-1/2 place-items-center bg-well-deep shadow-ring-line" aria-hidden>
          <PixelIcon name="lock" size={16} />
        </span>
      ) : (
        <button
          type="button"
          onClick={go}
          aria-label={st === 'here' ? t('ui.home.playHere', { area: area.name }) : t('ui.home.goTo', { area: area.name })}
          className="pixel-btn frame-primary absolute right-2.5 top-1/2 h-11 w-[60px] -translate-y-1/2 text-[24px] uppercase leading-none tracking-[0.06em]"
        >
          {t('ui.home.go')}
        </button>
      )}
    </li>
  )
}

/** The areas of the region being played where `dex` turns up, plus a hint when the run is pinning the player down. */
function useSpots(dex: number) {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const region = save ? regionOf(save) : null
  // Travel waits while an encounter is under way; between encounters every GO works.
  const busy = useGame((s) => s.run.phase !== 'idle')
  const here = save?.currentAreaId
  const spots = useMemo(() => (region ? whereToFind(dex, data, region) : []), [dex, data, region])
  return { spots, travelHint: busy && spots.some((s) => s.area.id !== here) }
}

function SpotList({ spots, onTravel }: { spots: Spot[]; onTravel?: () => void }) {
  return (
    <ul className="grid gap-1.5">
      {spots.map((s) => (
        <SpotCard key={`${s.area.id}-${s.legendary}-${s.fossil?.key ?? ''}-${s.loot?.entryId ?? ''}`} spot={s} onTravel={onTravel} />
      ))}
    </ul>
  )
}

/** Where the item an evolution needs comes from: the areas that drop it, and the Poké Mart if it sells it here. */
function ItemSources({ itemKey, onTravel }: { itemKey: string; onTravel?: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const region = save ? regionOf(save) : null
  const spots = useMemo(() => (region ? whereToFindItem(itemKey, data, region) : []), [itemKey, data, region])
  const item = data.items[itemKey]
  if (!save || !region || !item) return null
  const inShop = shopSells(item, save, region)
  const badges = inShop ? badgeCase(save, data).filter((b) => b.earned).length : 0
  // What the Mart still waits for, the way the Shop words it: badges first, then reaching its area.
  const shopNeeds = !inShop
    ? null
    : badges < item.shopBadges
      ? t(`ui.shop.needsBadges.${item.shopBadges === 1 ? 'one' : 'other'}`, { count: item.shopBadges })
      : item.shopArea && !isAreaUnlocked(save, item.shopArea, data)
        ? t('ui.shop.needsArea', { area: data.areas.find((a) => a.id === item.shopArea)?.name ?? t('ui.shop.someNewArea') })
        : null
  return (
    <div className="flex flex-col gap-2 border-l-[3px] border-edge/30 pl-2">
      <h4 className="flex items-center gap-1.5 text-xl leading-none">
        <ItemSprite item={item} size={24} />
        {t('ui.dex.whereToFindItem', { item: item.name })}
      </h4>
      {spots.length > 0 && <SpotList spots={spots} onTravel={onTravel} />}
      {inShop && (
        <p className="pixel-panel p-2 text-lg leading-tight">
          {t('ui.dex.itemInShop')}
          {shopNeeds && <span className="text-muted"> · {shopNeeds}</span>}
        </p>
      )}
      {spots.length === 0 && !inShop && <p className="copy text-muted">{t('ui.dex.itemNowhere')}</p>}
    </div>
  )
}

const EVOLVES_TEXT = {
  from: { item: 'ui.dex.evolvesFromItem', level: 'ui.dex.evolvesFromLevel' },
  into: { item: 'ui.dex.evolvesIntoItem', level: 'ui.dex.evolvesIntoLevel' },
} as const

/**
 * One evolution step as a card naming the other species (a silhouette until it is caught) that opens its entry — and,
 * for a stone, where to find that stone. "From" on the evolved species' entry, "into" on the one that evolves.
 */
function EvolutionStep({
  dex,
  evo,
  direction,
  onOpenDex,
  onTravel,
}: {
  dex: number
  evo: Evolution
  direction: 'from' | 'into'
  onOpenDex?: (dex: number) => void
  onTravel?: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const known = useGame((s) => !!s.save?.pokedex.includes(dex))
  const button = (
    <button
      type="button"
      onClick={() => onOpenDex?.(dex)}
      className="flex min-h-[52px] w-full items-center gap-2 bg-paper px-2 py-1.5 text-left shadow-ring hover:bg-paper"
    >
      <MiniSprite dex={dex} size={40} silhouette={!known} />
      <span className="text-[18px] leading-tight">
        {t(EVOLVES_TEXT[direction][evo.item ? 'item' : 'level'], {
          name: known ? (data.species[dex]?.name ?? '') : t('ui.common.unknown'),
          how: evolutionHow(evo, data),
        })}
      </span>
    </button>
  )
  if (!evo.item) return button
  return (
    <div className="flex flex-col gap-2">
      {button}
      <ItemSources itemKey={evo.item} onTravel={onTravel} />
    </div>
  )
}

/**
 * What an uncaught species evolves into (the branches this save may see), and for a stone where to find it. A caught
 * one's sheet already lists its evolutions, so it only gets the stones' sources (EvolutionItems).
 */
function EvolvesInto({ dex, onOpenDex, onTravel }: { dex: number; onOpenDex?: (dex: number) => void; onTravel?: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const evolutions = useVisibleEvolutions(data.species[dex]!)
  if (evolutions.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[22px] leading-none">{t('ui.sheet.evolvesInto')}</h3>
      {evolutions.map((e) => (
        <EvolutionStep
          key={`${e.toDex}-${e.item ?? e.level}`}
          dex={e.toDex}
          evo={e}
          direction="into"
          onOpenDex={onOpenDex}
          onTravel={onTravel}
        />
      ))}
    </section>
  )
}

/** An uncaught species: its silhouette, where it can be found (or what it evolves from), and what it evolves into. */
function MissingEntry({ dex, onOpenDex, onTravel }: { dex: number; onOpenDex?: (dex: number) => void; onTravel?: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { spots, travelHint } = useSpots(dex)
  const from = data.speciesList.flatMap((s) => {
    const evo = s.evolutions.find((e) => e.toDex === dex)
    return evo ? [{ species: s, evo }] : []
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="grid h-[104px] w-[112px] shrink-0 place-items-center bg-sky shadow-ring">
          <MiniSprite dex={dex} size={80} silhouette />
        </div>
        <p className="font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.dex.catchToLearn')}</p>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-[22px] leading-none">{t('ui.dex.whereToFindHeading')}</h3>
        {spots.length > 0 && <SpotList spots={spots} onTravel={onTravel} />}
        {from.map(({ species, evo }) => (
          <EvolutionStep key={species.dex} dex={species.dex} evo={evo} direction="from" onOpenDex={onOpenDex} onTravel={onTravel} />
        ))}
        {spots.length === 0 && from.length === 0 && <p className="copy text-muted">{t('ui.dex.notSpotted')}</p>}
        {travelHint && <p className="font-pixel-sm text-[15px] text-muted">{t('ui.home.finishFirst')}</p>}
      </section>
      <EvolvesInto dex={dex} onOpenDex={onOpenDex} onTravel={onTravel} />
    </div>
  )
}

/** A caught species' spots, under its sheet — so the player can go back for another (or a shiny). */
function CaughtSpots({ dex, onTravel }: { dex: number; onTravel?: () => void }) {
  const { t } = useT()
  const { spots, travelHint } = useSpots(dex)
  // Evolved-only species: the sheet's evolution track already says where they come from.
  if (spots.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[22px] leading-none">{t('ui.dex.whereToFindHeading')}</h3>
      <SpotList spots={spots} onTravel={onTravel} />
      {travelHint && <p className="font-pixel-sm text-[15px] text-muted">{t('ui.home.finishFirst')}</p>}
    </section>
  )
}

/** A caught species that evolves with an item: where to get that item. */
function EvolutionItems({ dex, onTravel }: { dex: number; onTravel?: () => void }) {
  const data = useGame((s) => s.data)
  const evolutions = useVisibleEvolutions(data.species[dex]!)
  const items = [...new Set(evolutions.flatMap((e) => (e.item ? [e.item] : [])))]
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      {items.map((key) => (
        <ItemSources key={key} itemKey={key} onTravel={onTravel} />
      ))}
    </section>
  )
}

/** A Pokédex entry: the full sheet (and where to find it) once caught, otherwise just where to find it. */
export function DexEntry({ dex, onOpenDex, onTravel }: { dex: number; onOpenDex?: (dex: number) => void; onTravel?: () => void }) {
  const save = useGame((s) => s.save)
  if (!save) return null
  if (!save.pokedex.includes(dex)) return <MissingEntry dex={dex} onOpenDex={onOpenDex} onTravel={onTravel} />
  const best = save.box.filter((p) => p.dex === dex).sort((a, b) => b.level - a.level)[0]
  return (
    <PokemonSheet dex={dex} inst={best} onOpenDex={onOpenDex}>
      <EvolutionItems dex={dex} onTravel={onTravel} />
      <CaughtSpots dex={dex} onTravel={onTravel} />
    </PokemonSheet>
  )
}
