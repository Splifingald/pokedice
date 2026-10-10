import { useMemo, type ReactNode } from 'react'
import {
  choiceFormsOf,
  COPIES_FOE_DICE,
  effectiveStats,
  evolutionGate,
  evolutionsIn,
  getSpecies,
  lowHpFormOf,
  megaDie,
  megaFormsOf,
  megaUnlocked,
  gmaxFormsOf,
  gmaxUnlocked,
  type DieType,
  type Evolution,
  type GameData,
  type Milestone,
  type PokemonInstance,
  type Species,
} from '@/engine'
import { typeName } from '@/lib/format'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx, typeColor } from '@/theme/util'
import { Chip } from './Chip'
import { CryButton } from './CryButton'
import { DiceSet } from './DiceSet'
import { FaceDice, facesStatuses, StatusLines } from './FaceDice'
import { HpBar } from './HpBar'
import { PixelIcon, type IconName } from './icons'
import { ItemSprite } from './ItemSprite'
import { RevivalBar, XpBar } from './MonCard'
import { SheetSection } from './SheetSection'
import { MiniSprite, SpriteImg } from './SpriteImg'
import { StatChip, statHint, statLabel, type StatKind } from './StatChip'
import { TypeBadge } from './TypeBadge'
import { TypeMatchups } from './TypeMatchups'

/** A stat as a big number over its name (Speed, Rerolls, Catch value); the hint is the tooltip. */
function StatTile({ stat, value }: { stat: StatKind; value: ReactNode }) {
  useT()
  return (
    <div className="grid justify-items-center bg-paper px-1 pb-2 pt-1.5 shadow-ring-line" title={statHint(stat)}>
      <b className="text-[26px] font-normal leading-none tabular-nums">{value}</b>
      <small className="font-pixel-sm text-[13px] text-muted">{statLabel(stat)}</small>
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
      className="inline-flex items-center gap-0.5 align-middle hover:bg-paper"
      onClick={() => onOpenDex(toDex)}
      aria-label={t('ui.sheet.openDex', { name, how })}
    >
      {body}
    </button>
  )
}

function DieSwatch({ type }: { type: DieType }) {
  return <span className="inline-block h-4 w-4 shrink-0 border-2 border-edge" style={{ background: typeColor(type), borderRadius: 2 }} aria-hidden />
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
export function useVisibleEvolutions(species: Species): Evolution[] {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  return useMemo(() => {
    if (!save) return species.evolutions
    const allowed = evolutionGate(save, data)
    // A regional evolution shows only where it happens (Pikachu → Alolan Raichu in Alola, → Raichu elsewhere).
    return evolutionsIn(species.evolutions, allowed.region).filter((e) => allowed(e.toDex))
  }, [species, save, data])
}

/** A milestone row: the level (or the stone) in a navy chip, what happens, and — for one still ahead — how close. */
function MilestoneRow({
  chip,
  progress,
  next,
  reached,
  children,
}: {
  chip: ReactNode
  progress?: number
  next?: boolean
  reached?: boolean
  children: ReactNode
}) {
  const { t } = useT()
  return (
    <li className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-x-2 gap-y-[3px] text-[17px] leading-[1.1]">
      {chip}
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1">
          {children}
          {reached && <span className="sr-only">{t('ui.sheet.reached')}</span>}
        </span>
        {next && <Chip tone="gold">{t('ui.sheet.next')}</Chip>}
      </span>
      {progress != null && (
        <span className="col-start-2 block h-1 bg-line" aria-hidden>
          <i className="block h-full bg-type-water" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </li>
  )
}

const LevelChip = ({ level, reached }: { level: number; reached?: boolean }) => (
  <span
    className={cx(
      'px-1.5 pb-[3px] pt-0.5 text-center font-pixel-sm text-[14px] leading-none',
      reached ? 'bg-line text-muted' : 'light-scope bg-night text-gold-light',
    )}
  >
    {t('ui.common.level.short', { n: level })}
  </span>
)

/**
 * What it learns next: the milestones still ahead (the first one marked NEXT, each with how close it is), stone
 * evolutions, Mega Evolution once Kalos is reached, and Gigantamax once Galar is. Milestones already reached fold
 * away under a summary, so the sheet leads with what's coming.
 */
function MilestoneTrack({ species, level, onOpenDex }: { species: Species; level: number | null; onOpenDex?: (dex: number) => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const evolutions = useVisibleEvolutions(species)
  // Mega Evolution joins the curve at its level, once the player has reached Kalos — not before, so it spoils nothing.
  const megas = save && megaUnlocked(save, data) ? megaFormsOf(data, species.dex) : []
  // Gigantamax has no level: a line under the curve once the player has reached Galar.
  const gmax = save && gmaxUnlocked(save, data) ? gmaxFormsOf(data, species.dex)[0] : undefined
  const megaLevel = data.config.megaEvolution.level
  type Row = { level: number; m: Milestone } | { level: number; mega: true }
  const ms: Row[] = [
    ...[...species.milestones].sort((a, b) => a.level - b.level).map((m) => ({ level: m.level, m })),
    ...(megas.length ? [{ level: megaLevel, mega: true as const }] : []),
  ].sort((a, b) => a.level - b.level)
  const ahead = level == null ? ms : ms.filter((r) => r.level > level)
  const done = level == null ? [] : ms.filter((r) => r.level <= level)
  const byLevel = evolutions.filter((e) => e.level != null)
  const byStone = evolutions.filter((e) => e.level == null)
  const evoNames = (evos: Evolution[]) =>
    evos.map((e, i) => (
      <span key={e.toDex}>
        {i > 0 && ' / '}
        <EvoLink toDex={e.toDex} how={evolutionHow(e, data)} onOpenDex={onOpenDex} />
      </span>
    ))
  const what = (row: Row) => (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {'mega' in row ? (
        <DiceSet dice={[...new Set(megas.map((x) => megaDie(species, x)))]} size={16} />
      ) : (
        <MilestoneGlyph m={row.m} species={species} />
      )}
      {'mega' in row ? (
        <span>
          {t(
            megas[0]?.form?.mechanic === 'primal'
              ? 'ui.sheet.msPrimal'
              : megas[0]?.form?.mechanic === 'ultra'
                ? 'ui.sheet.msUltra'
                : 'ui.sheet.msMega',
          )}{' '}
          {megas.map((x, j) => (
            <span key={x.dex}>
              {j > 0 && ' / '}
              <span className="inline-flex items-center gap-0.5 align-middle">
                <MiniSprite dex={x.dex} size={28} className="-my-2" />
                <b className="font-normal">{x.name}</b>
              </span>{' '}
              ({t('ui.sheet.msAddDie', { to: typeName(megaDie(species, x)) })})
            </span>
          ))}
        </span>
      ) : row.m.effect === 'EVOLVE' && byLevel.length > 0 ? (
        <span>
          {t('ui.sheet.evolvesInto')} {evoNames(byLevel)}
        </span>
      ) : (
        <span>{milestoneLabel(row.m, species, data, evolutions)}</span>
      )}
    </span>
  )
  // Progress toward a row runs from the milestone before it (or Lv.1).
  const progressTo = (row: Row) => {
    if (level == null) return undefined
    const before = ms.filter((r) => r.level < row.level).pop()?.level ?? 1
    return Math.max(0, Math.min(1, (level - before) / Math.max(1, row.level - before)))
  }
  return (
    <SheetSection title={t('ui.sheet.whatsNext')}>
      {ahead.length === 0 && !byStone.length ? (
        <p className="font-pixel-sm text-[16px] text-muted">{t('ui.sheet.fullyGrown')}</p>
      ) : (
        <ol className="grid gap-2">
          {ahead.map((row, i) => (
            <MilestoneRow
              key={i}
              chip={<LevelChip level={row.level} />}
              progress={progressTo(row)}
              next={level != null && i === 0}
            >
              {what(row)}
            </MilestoneRow>
          ))}
          {byStone.map((e) => (
            <MilestoneRow key={`stone-${e.toDex}`} chip={<StoneChip itemKey={e.item} />}>
              <span>
                {evolutionHow(e, data)}: {t('ui.sheet.evolvesInto')}{' '}
                <EvoLink toDex={e.toDex} how={evolutionHow(e, data)} onOpenDex={onOpenDex} />
              </span>
            </MilestoneRow>
          ))}
        </ol>
      )}
      {byLevel.length > 1 && <p className="font-pixel-sm text-[15px] text-muted">{t('ui.sheet.oneAtRandom')}</p>}
      {megas.length > 0 && <p className="copy font-pixel-sm text-[15px] text-muted">{t('ui.sheet.megaNote')}</p>}
      {gmax && (
        <p className="copy flex items-center gap-1 font-pixel-sm text-[15px]">
          <MiniSprite dex={gmax.dex} size={28} className="-my-2" />
          <span>
            {t(`ui.sheet.gmaxNote.${data.config.gigantamax.turns === 1 ? 'one' : 'other'}`, {
              to: typeName(megaDie(species, gmax)),
              n: data.config.gigantamax.turns,
            })}
          </span>
        </p>
      )}
      {done.length > 0 && (
        <details className="group">
          <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 font-pixel-sm text-[16px] text-muted md:min-h-[32px]">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▶
            </span>
            {t(`ui.sheet.reachedCount.${done.length === 1 ? 'one' : 'other'}`, { n: done.length })}
          </summary>
          <ol className="mt-1 grid gap-2 opacity-80">
            {done.map((row, i) => (
              <MilestoneRow key={i} chip={<LevelChip level={row.level} reached />} reached>
                {what(row)}
              </MilestoneRow>
            ))}
          </ol>
        </details>
      )}
    </SheetSection>
  )
}

function StoneChip({ itemKey }: { itemKey?: string | null }) {
  const item = useGame((s) => (itemKey ? s.data.items[itemKey] : undefined))
  return (
    <span className="grid place-items-center">
      <ItemSprite item={item} size={28} />
    </span>
  )
}

/**
 * Detail sheet body: sprite, types, HP and XP, speed / rerolls / catch value, every die as its six real faces (what
 * its status faces do, with the game's numbers) and what it learns next. The sheet around it carries the name and
 * number. Tapping an evolution calls `onOpenDex` (the sheet opens its Pokédex entry on top).
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
  const hints = useGame((s) => s.settings.typeHints) ?? false
  const types = species.type2 ? [species.type1, species.type2] : [species.type1]
  const lowHp = lowHpFormOf(data, species.dex)
  // One row per die type, in the order the Pokémon throws them, with how many it throws.
  const groups: { type: DieType; n: number }[] = []
  for (const d of stats.dice) {
    const g = groups.find((x) => x.type === d)
    if (g) g.n++
    else groups.push({ type: d, n: 1 })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="grid h-[104px] w-[112px] shrink-0 place-items-center bg-sky shadow-ring">
          <SpriteImg dex={dex} size={96} shiny={inst?.shiny} />
        </div>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {types.map((ty) => (
              <TypeBadge key={ty} type={ty} />
            ))}
            {inst?.shiny && (
              <Chip tone="gold">
                <PixelIcon name="star" size={12} /> {t('ui.mon.shinyTag')}
              </Chip>
            )}
            {inst?.revivesAt == null && <CryButton dex={dex} name={species.name} className="ml-auto" />}
          </div>
          {inst?.revivesAt != null ? (
            <RevivalBar inst={inst} />
          ) : inst ? (
            <>
              <HpBar hp={inst.currentHp} max={stats.maxHp} />
              <XpBar inst={inst} />
            </>
          ) : (
            <StatChip
              stat="hp"
              size={18}
              className="font-pixel-sm text-[16px]"
              value={t('ui.sheet.hpRange', {
                low: effectiveStats(species, 1, data).maxHp,
                high: effectiveStats(species, 100, data).maxHp,
              })}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <StatTile stat="speed" value={species.speed} />
        <StatTile stat="rerolls" value={stats.rerolls} />
        <StatTile stat="catch" value={species.catchValue} />
      </div>

      <SheetSection
        title={t('ui.sheet.dice')}
        hint={t(`ui.sheet.perRoll.${stats.dice.length === 1 ? 'one' : 'other'}`, { n: stats.dice.length })}
      >
        {COPIES_FOE_DICE.has(species.dex) && (
          <p className="copy font-pixel-sm text-[15px]">
            <b className="font-pixel font-normal">{t('ui.sheet.transformTitle')}</b> {t('ui.sheet.transformBody')}
          </p>
        )}
        {lowHp?.form?.swapDie && (
          <p className="copy font-pixel-sm text-[15px]">
            {t('ui.sheet.lowHpForm', {
              from: typeName(lowHp.form.swapDie.from),
              to: typeName(lowHp.form.swapDie.to),
            })}
          </p>
        )}
        {choiceFormsOf(data, species.dex).length > 0 && (
          <p className="copy font-pixel-sm text-[15px]">{t('ui.sheet.choiceForm', { n: data.config.formChangesPerBattle })}</p>
        )}
        <ul className="grid gap-3">
          {groups.map(({ type, n }) => {
            const faces = data.diceTypes[type]?.faces ?? []
            return (
              <li key={type} className="grid gap-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <b className="text-[18px] font-normal leading-none">{typeName(type)}</b>
                  <em className="font-pixel-sm not-italic text-muted">×{n}</em>
                  {data.diceTypes[type]?.description && (
                    <small className="ml-auto font-pixel-sm text-[14px] text-muted">{data.diceTypes[type]!.description}</small>
                  )}
                </span>
                <FaceDice type={type} faces={faces} />
                <StatusLines statuses={facesStatuses(faces)} />
              </li>
            )
          })}
        </ul>
      </SheetSection>

      <MilestoneTrack species={species} level={inst ? inst.level : null} onOpenDex={onOpenDex} />

      {hints && (
        <SheetSection title={t('ui.types.title')}>
          <TypeMatchups types={types} dice={stats.dice} />
        </SheetSection>
      )}

      {children}
    </div>
  )
}
