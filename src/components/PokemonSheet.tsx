import { useMemo, type ReactNode } from 'react'
import {
  COPIES_FOE_DICE,
  effectiveStats,
  evolutionGate,
  getSpecies,
  type DieType,
  type Evolution,
  type GameData,
  type Milestone,
  type PokemonInstance,
  type Species,
} from '@/engine'
import { dexNo, typeName } from '@/lib/format'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx, typeColor } from '@/theme/util'
import { DiceSet } from './DiceSet'
import { DieFaces } from './Die'
import { HpBar } from './HpBar'
import { PixelIcon, type IconName } from './icons'
import { XpBar } from './MonCard'
import { MiniSprite, SpriteImg } from './SpriteImg'
import { STAT_INFO, StatChip, statHint, statLabel, type StatKind } from './StatChip'
import { TypeBadge } from './TypeBadge'
import { TypeMatchups } from './TypeMatchups'

function StatTile({ stat, value }: { stat: StatKind; value: ReactNode }) {
  useT()
  const { icon } = STAT_INFO[stat]
  return (
    <div className="pixel-panel flex items-center gap-2 px-2 py-1.5" title={statHint(stat)}>
      <PixelIcon name={icon} size={24} />
      <span className="sr-only">{statLabel(stat)}</span>
      <div className="ml-auto font-mono text-xl leading-none tabular-nums">{value}</div>
    </div>
  )
}

/** "Lv.28", or the stone that does it ("Thunder Stone"). */
export function evolutionHow(e: { level: number | null; item?: string | null }, data: GameData): string {
  if (e.item) return data.items[e.item]?.name ?? e.item
  return t('ui.common.level.short', { n: e.level ?? '?' })
}

function milestoneLabel(m: Milestone, species: Species, data: GameData, evolutions: Evolution[]): string {
  const to = typeName(m.dieType ?? species.type1)
  switch (m.effect) {
    case 'UPGRADE_DIE':
      return t('ui.sheet.msUpgradeDie', { to })
    case 'REPLACE_DIE':
      return t('ui.sheet.msReplaceDie', { from: typeName(m.fromDieType ?? 'base'), to })
    case 'ADD_DIE':
      return t('ui.sheet.msAddDie', { to })
    case 'ADD_REROLL':
      return t(`ui.sheet.msAddReroll.${(m.amount ?? 1) === 1 ? 'one' : 'other'}`, { amount: m.amount ?? 1 })
    case 'ADD_HP':
      return t('ui.sheet.msAddHp', { amount: m.amount ?? 0 })
    case 'EVOLVE':
      return t('ui.sheet.msEvolve', {
        names: evolutions.map((e) => data.species[e.toDex]?.name ?? `#${e.toDex}`).join(' / '),
      })
  }
}

/** An evolution target inline: animated mini + name, tappable to open its Pokédex entry. */
function EvoLink({ toDex, how, onOpenDex }: { toDex: number; how: string; onOpenDex?: (dex: number) => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const name = data.species[toDex]?.name ?? `#${toDex}`
  const body = (
    <>
      <MiniSprite dex={toDex} size={28} className="-my-2" />
      <b className="underline">{name}</b>
    </>
  )
  if (!onOpenDex) return <span className="inline-flex items-center gap-0.5 align-middle">{body}</span>
  return (
    <button
      type="button"
      className="inline-flex items-center gap-0.5 align-middle hover:bg-white"
      onClick={() => onOpenDex(toDex)}
      aria-label={t('ui.sheet.openDex', { name, how })}
    >
      {body}
    </button>
  )
}

function DieSwatch({ type }: { type: DieType }) {
  return <span className="inline-block h-4 w-4 shrink-0 border-2 border-ink" style={{ background: typeColor(type), borderRadius: 2 }} aria-hidden />
}

function MilestoneGlyph({ m, species }: { m: Milestone; species: Species }) {
  if (m.effect === 'REPLACE_DIE') {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden>
        <DieSwatch type={m.fromDieType ?? 'base'} />
        <span className="font-mono text-xs leading-none">→</span>
        <DieSwatch type={m.dieType ?? species.type1} />
      </span>
    )
  }
  if (m.effect === 'UPGRADE_DIE' || m.effect === 'ADD_DIE') {
    return <DieSwatch type={m.dieType ?? species.type1} />
  }
  const icon: IconName = m.effect === 'ADD_REROLL' ? 'reroll' : m.effect === 'ADD_HP' ? 'heart' : 'up'
  return <PixelIcon name={icon} size={16} />
}

/**
 * The evolutions this save may see. A branch into a later generation — Golbat into Crobat, Chansey into Blissey — is
 * held until that region is unlocked, so the sheet must not name it either: it would spoil a region the player has
 * not been offered and promise an evolution that will not happen.
 */
function useVisibleEvolutions(species: Species): Evolution[] {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  return useMemo(() => {
    if (!save) return species.evolutions
    const allowed = evolutionGate(save, data)
    return species.evolutions.filter((e) => allowed(e.toDex))
  }, [species, save, data])
}

/**
 * Milestones on a side gauge that fills in blue up to the Pokémon's level. An EVOLVE milestone shows what it becomes
 * (animated mini + name, tappable); a stone evolution has no level, so it gets a row of its own at the end.
 */
function MilestoneTrack({ species, level, onOpenDex }: { species: Species; level: number | null; onOpenDex?: (dex: number) => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const evolutions = useVisibleEvolutions(species)
  const ms = [...species.milestones].sort((a, b) => a.level - b.level)
  const next = level == null ? undefined : ms.find((m) => m.level > level)
  const byLevel = evolutions.filter((e) => e.level != null)
  const byStone = evolutions.filter((e) => e.level == null)
  const evoNames = (evos: Evolution[]) =>
    evos.map((e, i) => (
      <span key={e.toDex}>
        {i > 0 && ' / '}
        <EvoLink toDex={e.toDex} how={evolutionHow(e, data)} onOpenDex={onOpenDex} />
      </span>
    ))
  return (
    <section>
      <h3 className="mb-1 text-xl">{t('ui.sheet.milestones')}</h3>
      {ms.length === 0 && !byStone.length ? (
        <div className="text-lg text-muted">{t('ui.sheet.none')}</div>
      ) : (
        <ol>
          {ms.map((m, i) => {
            const from = i === 0 ? 1 : ms[i - 1]!.level
            const fill = level == null ? 0 : Math.max(0, Math.min(1, (level - from) / Math.max(1, m.level - from)))
            const reached = level != null && level >= m.level
            return (
              <li key={i} className="flex items-stretch gap-2.5">
                <div className="flex w-5 shrink-0 flex-col items-center" aria-hidden>
                  <div className="relative min-h-[12px] w-2.5 flex-1 border-x-2 border-ink bg-[#3e3552]">
                    <div className="absolute inset-x-0 top-0 bg-type-water" style={{ height: `${fill * 100}%` }} />
                  </div>
                  <span
                    className={cx('h-5 w-5 shrink-0 border-[3px] border-ink', reached ? 'bg-type-water' : 'bg-panel')}
                    style={{ borderRadius: 2 }}
                  />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 pt-3 text-lg leading-tight">
                  <MilestoneGlyph m={m} species={species} />
                  <span className="min-w-0">
                    <span className="font-mono text-sm">{t('ui.common.level.short', { n: m.level })}</span>{' '}
                    {m.effect === 'EVOLVE' && byLevel.length > 0 ? (
                      <>
                        {t('ui.sheet.evolvesInto')} {evoNames(byLevel)}
                      </>
                    ) : (
                      milestoneLabel(m, species, data, evolutions)
                    )}
                    <span className="sr-only">{reached ? t('ui.sheet.reached') : ''}</span>
                  </span>
                  {m === next && <span className="ml-auto shrink-0 bg-gold px-1 text-base leading-tight text-ink">{t('ui.sheet.next')}</span>}
                </div>
              </li>
            )
          })}
          {byStone.map((e) => (
            <li key={`stone-${e.toDex}`} className="flex items-stretch gap-2.5">
              <div className="flex w-5 shrink-0 flex-col items-center" aria-hidden>
                <div className="relative min-h-[12px] w-2.5 flex-1 border-x-2 border-ink bg-[#3e3552]" />
                <span className="h-5 w-5 shrink-0 border-[3px] border-ink bg-panel" style={{ borderRadius: 2 }} />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 pt-3 text-lg leading-tight">
                <PixelIcon name="up" size={16} />
                <span className="min-w-0">
                  <span className="font-mono text-sm">{evolutionHow(e, data)}</span> {t('ui.sheet.evolvesInto')}{' '}
                  <EvoLink toDex={e.toDex} how={evolutionHow(e, data)} onOpenDex={onOpenDex} />
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {byLevel.length > 1 && <p className="mt-1 text-base text-muted">{t('ui.sheet.oneAtRandom')}</p>}
    </section>
  )
}

/**
 * Detail sheet: sprite, types, HP, speed / rerolls / catch value, the dice set and the milestones (evolutions among
 * them). Tapping an evolution calls `onOpenDex` (the modal opens its Pokédex entry on top).
 */
export function PokemonSheet({
  dex,
  inst,
  children,
  onOpenDex,
}: {
  dex: number
  inst?: PokemonInstance
  children?: ReactNode
  onOpenDex?: (dex: number) => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const species = getSpecies(data, dex)
  const level = inst?.level ?? 1
  const stats = effectiveStats(species, level, data)
  const uniqueTypes = [...new Set(stats.dice)]
  const hints = useGame((s) => s.settings.typeHints) ?? false
  const types = species.type2 ? [species.type1, species.type2] : [species.type1]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SpriteImg dex={dex} size={128} shiny={inst?.shiny} className="border-[3px] border-ink bg-parchment" />
        <div className="min-w-0">
          <div className="font-mono text-sm text-muted">{dexNo(dex)}</div>
          <div className="text-4xl leading-none">{species.name}</div>
          <div className="mt-1 flex gap-1">
            <TypeBadge type={species.type1} />
            {species.type2 && <TypeBadge type={species.type2} />}
          </div>
          {inst && (
            <div className="mt-1 flex items-center gap-2 text-xl">
              {t('ui.common.level.short', { n: inst.level })}
              {inst.shiny && (
                <span className="inline-flex items-center gap-1 border-2 border-ink px-1 text-base leading-tight">
                  <PixelIcon name="star" size={12} /> {t('ui.mon.shinyTag')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {inst ? (
        <div className="flex flex-col gap-1">
          <HpBar hp={inst.currentHp} max={stats.maxHp} />
          <XpBar inst={inst} />
        </div>
      ) : (
        <div className="text-lg">
          <StatChip
            stat="hp"
            size={18}
            value={t('ui.sheet.hpRange', {
              low: effectiveStats(species, 1, data).maxHp,
              high: effectiveStats(species, 100, data).maxHp,
            })}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatTile stat="speed" value={species.speed} />
        <StatTile stat="rerolls" value={stats.rerolls} />
        <StatTile stat="catch" value={species.catchValue} />
      </div>

      <section>
        <h3 className="mb-1 text-xl">{t('ui.sheet.diceCount', { count: stats.dice.length })}</h3>
        {COPIES_FOE_DICE.has(species.dex) && (
          <p className="copy mb-1.5 text-base">
            <b>{t('ui.sheet.transformTitle')}</b> {t('ui.sheet.transformBody')}
          </p>
        )}
        <DiceSet dice={stats.dice} size={30} />
        <div className="mt-2 flex flex-col gap-1.5">
          {uniqueTypes.map((die) => (
            <div key={die} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-base uppercase">{typeName(die)}</span>
              <div>
                <DieFaces type={die} faces={data.diceTypes[die]?.faces ?? []} size={28} />
                {data.diceTypes[die]?.description && <div className="copy text-sm text-muted">{data.diceTypes[die]!.description}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <MilestoneTrack species={species} level={inst ? inst.level : null} onOpenDex={onOpenDex} />

      {hints && (
        <section>
          <h3 className="mb-1 text-xl">{t('ui.types.title')}</h3>
          <TypeMatchups types={types} dice={stats.dice} />
        </section>
      )}

      {children}
    </div>
  )
}
