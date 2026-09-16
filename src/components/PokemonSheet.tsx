import type { ReactNode } from 'react'
import { effectiveStats, getSpecies, type GameData, type Milestone, type PokemonInstance, type Species } from '@/engine'
import { cap, dexNo } from '@/lib/format'
import { useGame } from '@/store/game'
import { cx, typeColor } from '@/theme/util'
import { DiceSet } from './DiceSet'
import { DieFaces } from './Die'
import { HpBar } from './HpBar'
import { PixelIcon, type IconName } from './icons'
import { XpBar } from './MonCard'
import { SpriteImg } from './SpriteImg'
import { TypeBadge } from './TypeBadge'

function StatTile({ icon, label, value, hint }: { icon: IconName; label: string; value: number; hint: string }) {
  return (
    <div className="pixel-panel flex items-center gap-2 px-2 py-1.5" title={hint}>
      <PixelIcon name={icon} size={24} />
      <div className="ml-auto text-right leading-none">
        <div className="font-mono text-xl tabular-nums">{value}</div>
        <div className="font-pixel-sm text-sm text-muted">{label}</div>
      </div>
    </div>
  )
}

function milestoneLabel(m: Milestone, species: Species, data: GameData): string {
  const die = cap(m.dieType ?? species.type1)
  switch (m.effect) {
    case 'UPGRADE_DIE':
      return `Base die → ${die} die`
    case 'ADD_DIE':
      return `+1 ${die} die`
    case 'ADD_REROLL':
      return `+${m.amount ?? 1} reroll${(m.amount ?? 1) > 1 ? 's' : ''}`
    case 'ADD_HP':
      return `+${m.amount ?? 0} max HP`
    case 'EVOLVE':
      return `Evolves into ${species.evolutions.map((e) => data.species[e.toDex]?.name ?? `#${e.toDex}`).join(' / ')}`
  }
}

function MilestoneGlyph({ m, species }: { m: Milestone; species: Species }) {
  if (m.effect === 'UPGRADE_DIE' || m.effect === 'ADD_DIE') {
    return (
      <span
        className="inline-block h-4 w-4 shrink-0 border-2 border-ink"
        style={{ background: typeColor(m.dieType ?? species.type1), borderRadius: 2 }}
        aria-hidden
      />
    )
  }
  const icon: IconName = m.effect === 'ADD_REROLL' ? 'reroll' : m.effect === 'ADD_HP' ? 'heart' : 'up'
  return <PixelIcon name={icon} size={16} />
}

/** Milestones on a side gauge that fills in blue up to the Pokémon's level. */
function MilestoneTrack({ species, level }: { species: Species; level: number | null }) {
  const data = useGame((s) => s.data)
  const ms = [...species.milestones].sort((a, b) => a.level - b.level)
  const next = level == null ? undefined : ms.find((m) => m.level > level)
  return (
    <section>
      <h3 className="mb-1 text-xl">Milestones</h3>
      {ms.length === 0 ? (
        <div className="text-lg text-muted">None</div>
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
                    <span className="font-mono text-sm">Lv.{m.level}</span> {milestoneLabel(m, species, data)}
                    <span className="sr-only">{reached ? ' (reached)' : ''}</span>
                  </span>
                  {m === next && <span className="ml-auto shrink-0 bg-gold px-1 text-base leading-tight text-ink">next</span>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/**
 * Detail sheet: sprite, types, HP, speed / rerolls / catch value, the dice set, milestones and evolutions. Tapping an
 * evolution calls `onOpenDex` (the modal opens its Pokédex entry on top).
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
  const data = useGame((s) => s.data)
  const species = getSpecies(data, dex)
  const level = inst?.level ?? 1
  const stats = effectiveStats(species, level, data)
  const uniqueTypes = [...new Set(stats.dice)]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SpriteImg dex={dex} size={128} className="border-[3px] border-ink bg-parchment" />
        <div className="min-w-0">
          <div className="font-mono text-sm text-muted">{dexNo(dex)}</div>
          <div className="text-4xl leading-none">{species.name}</div>
          <div className="mt-1 flex gap-1">
            <TypeBadge type={species.type1} />
            {species.type2 && <TypeBadge type={species.type2} />}
          </div>
          {inst && <div className="mt-1 text-xl">Lv.{inst.level}</div>}
        </div>
      </div>

      {inst ? (
        <div className="flex flex-col gap-1">
          <HpBar hp={inst.currentHp} max={stats.maxHp} />
          <XpBar inst={inst} />
        </div>
      ) : (
        <div className="text-lg">
          HP {effectiveStats(species, 1, data).maxHp} at Lv.1 → {effectiveStats(species, 100, data).maxHp} at Lv.100
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatTile icon="speed" label="Speed" value={species.speed} hint="Speed: the faster Pokémon acts first" />
        <StatTile icon="reroll" label="Rerolls" value={stats.rerolls} hint="Rerolls: how many times per battle it can reroll dice" />
        <StatTile icon="ball" label="Catch" value={species.catchValue} hint="Catch value: the catch die plus a ball must reach this (1 = always)" />
      </div>

      <section>
        <h3 className="mb-1 text-xl">Dice ({stats.dice.length})</h3>
        <DiceSet dice={stats.dice} size={30} />
        <div className="mt-2 flex flex-col gap-1.5">
          {uniqueTypes.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-16 text-base uppercase">{t}</span>
              <DieFaces type={t} faces={data.diceTypes[t]?.faces ?? []} size={28} />
            </div>
          ))}
        </div>
      </section>

      <MilestoneTrack species={species} level={inst ? inst.level : null} />

      {species.evolutions.length > 0 && (
        <section>
          <h3 className="mb-1 text-xl">Evolves into</h3>
          <div className="flex flex-wrap gap-2">
            {species.evolutions.map((e) => {
              const name = data.species[e.toDex]?.name ?? `#${e.toDex}`
              const content = (
                <>
                  <SpriteImg dex={e.toDex} size={96} />
                  <span className="text-xl leading-none">{name}</span>
                  <span className="text-base text-muted">Lv.{e.level}</span>
                </>
              )
              return onOpenDex ? (
                <button
                  key={e.toDex}
                  type="button"
                  onClick={() => onOpenDex(e.toDex)}
                  className="pixel-panel flex flex-col items-center px-3 pb-1.5 pt-1 hover:bg-white"
                  aria-label={`${name} (Lv.${e.level}) — open its Pokédex entry`}
                >
                  {content}
                </button>
              ) : (
                <div key={e.toDex} className="pixel-panel flex flex-col items-center px-3 pb-1.5 pt-1">
                  {content}
                </div>
              )
            })}
          </div>
          {species.evolutions.length > 1 && <p className="mt-1 text-base text-muted">One is chosen at random.</p>}
        </section>
      )}
      {children}
    </div>
  )
}
