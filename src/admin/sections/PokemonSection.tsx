import { useEffect, useMemo, useState } from 'react'
import type { Row } from '@/config/mapping'
import {
  computeDamage,
  createRng,
  expandDice,
  POKE_TYPES,
  rollAll,
  uniformLevels,
  type DiceEntry,
  type DieType,
  type Evolution,
  type GameData,
  type Milestone,
  type MilestoneEffect,
} from '@/engine'
import { DiceSet } from '@/components/DiceSet'
import { DieFaces } from '@/components/Die'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { dexNo } from '@/lib/format'
import { cx, typeColor } from '@/theme/util'
import { DataTable } from '../DataTable'
import { rowKey, updateRow, useAdmin, useAdminData } from '../store'
import { Field, NumInput, PokemonPicker, TextInput, TypePicker, n, s } from '../widgets'

/** Mean final damage of one roll (no rerolls, track 1) against a typeless target. */
function averageRoll(dice: DiceEntry[], types: string[], data: GameData): number {
  const rng = createRng(4242)
  const set = expandDice(dice)
  if (!set.length) return 0
  let total = 0
  const N = 3000
  for (let i = 0; i < N; i++) total += computeDamage(rollAll(set, data, rng), types as never, [], uniformLevels(1), data).final
  return total / N
}

function DiceEditor({ value, onChange, types, data }: { value: DiceEntry[]; onChange: (d: DiceEntry[]) => void; types: string[]; data: GameData }) {
  const total = value.reduce((sum, d) => sum + d.count, 0)
  const avg = useMemo(() => averageRoll(value, types, data), [value, types, data])
  return (
    <div className="flex flex-col gap-2">
      {value.map((d, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 border-2 border-ink p-1.5" style={{ background: `${typeColor(d.type)}33` }}>
          <TypePicker className="w-40" allowBase value={d.type} onChange={(t) => t && onChange(value.map((x, j) => (j === i ? { ...x, type: t } : x)))} />
          <PixelButton size="sm" onClick={() => onChange(value.map((x, j) => (j === i ? { ...x, count: Math.max(1, x.count - 1) } : x)))}>
            −
          </PixelButton>
          <span className="w-6 text-center font-mono">{d.count}</span>
          <PixelButton size="sm" disabled={total >= 6} onClick={() => onChange(value.map((x, j) => (j === i ? { ...x, count: x.count + 1 } : x)))}>
            +
          </PixelButton>
          <DieFaces type={d.type} faces={data.diceTypes[d.type]?.faces ?? []} size={22} />
          <button type="button" className="ml-auto px-1" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <PixelButton size="sm" disabled={total >= 6} onClick={() => onChange([...value, { type: 'base', count: 1 }])}>
          + die chip
        </PixelButton>
        <span className={cx('text-lg', (total < 1 || total > 6) && 'text-danger')}>{total} dice</span>
        <span className="text-lg">
          avg roll ≈ <b>{avg.toFixed(1)}</b> dmg · vs a neutral 100 HP target ≈ <b>{avg ? (100 / avg).toFixed(1) : '∞'}</b> turns
        </span>
      </div>
    </div>
  )
}

const EFFECTS: MilestoneEffect[] = ['UPGRADE_DIE', 'ADD_REROLL', 'ADD_DIE', 'ADD_HP', 'EVOLVE']
const EFFECT_COLOR: Record<MilestoneEffect, string> = {
  UPGRADE_DIE: '#d44873',
  ADD_REROLL: '#547acc',
  ADD_DIE: '#e8b44a',
  ADD_HP: '#4aa84a',
  EVOLVE: '#2a2438',
}

function MilestoneEditor({ value, onChange }: { value: Milestone[]; onChange: (m: Milestone[]) => void }) {
  const sorted = [...value].map((m, i) => ({ m, i })).sort((a, b) => a.m.level - b.m.level)
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-10 cursor-crosshair border-2 border-ink bg-parchment"
        title="Click to add a milestone at that level"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const level = Math.max(1, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 99 + 1)))
          onChange([...value, { level, effect: 'ADD_REROLL', amount: 1 }])
        }}
      >
        {[1, 25, 50, 75, 100].map((l) => (
          <span key={l} className="absolute bottom-0 font-mono text-xs text-muted" style={{ left: `${((l - 1) / 99) * 100}%` }}>
            {l}
          </span>
        ))}
        {value.map((m, i) => (
          <span
            key={i}
            className="absolute top-0 h-6 w-2 -translate-x-1/2 border border-ink"
            style={{ left: `${((m.level - 1) / 99) * 100}%`, background: EFFECT_COLOR[m.effect] }}
            title={`Lv.${m.level} ${m.effect}`}
          />
        ))}
      </div>
      {sorted.map(({ m, i }) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <NumInput className="w-20" value={m.level} min={1} max={100} onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, level: v ?? 1 } : x)))} />
          <select
            className="min-h-[34px] border-2 border-ink bg-panel px-1 text-lg"
            value={m.effect}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { level: x.level, effect: e.target.value as MilestoneEffect } : x)))}
          >
            {EFFECTS.map((ef) => (
              <option key={ef}>{ef}</option>
            ))}
          </select>
          {(m.effect === 'UPGRADE_DIE' || m.effect === 'ADD_DIE') && (
            <TypePicker className="w-36" allowBase nullable value={m.dieType ?? null} onChange={(t) => onChange(value.map((x, j) => (j === i ? { ...x, dieType: t ?? undefined } : x)))} />
          )}
          {(m.effect === 'ADD_REROLL' || m.effect === 'ADD_HP') && (
            <NumInput className="w-20" value={m.amount ?? (m.effect === 'ADD_REROLL' ? 1 : 0)} onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} />
          )}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove milestone">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

function EvolutionEditor({ value, onChange, data }: { value: Evolution[]; onChange: (e: Evolution[]) => void; data: GameData }) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((ev, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <SpriteImg dex={ev.toDex} size={40} />
          <PokemonPicker className="min-w-[220px] flex-1" data={data} value={ev.toDex} onChange={(d) => onChange(value.map((x, j) => (j === i ? { ...x, toDex: d } : x)))} />
          <span>at Lv.</span>
          <NumInput className="w-20" value={ev.level} min={1} max={100} onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, level: v ?? 1 } : x)))} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
      <PixelButton size="sm" className="self-start" onClick={() => onChange([...value, { toDex: 1, level: 30 }])}>
        + evolution
      </PixelButton>
      {value.length > 1 && <span className="text-base text-muted">Several entries → the target is rolled at random.</span>}
    </div>
  )
}

function PokemonEditor({ dex, onClose, onStep }: { dex: number; onClose: () => void; onStep: (d: -1 | 1) => void }) {
  const row = useAdmin((st) => st.rows.pokemon.find((r) => r.dex === dex))
  const data = useAdminData()
  // ← / → browse the species (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') onStep(-1)
      else if (e.key === 'ArrowRight') onStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStep])
  if (!row || !data) return null
  const key = rowKey('pokemon', row)
  const patch = (p: Row) => updateRow('pokemon', key, p)
  const types = [s(row.type1), ...(row.type2 ? [s(row.type2)] : [])]
  return (
    <Modal open onClose={onClose} className="max-w-4xl" title={`${dexNo(dex)} ${s(row.name)}`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <PixelButton size="sm" onClick={() => onStep(-1)} aria-label="Previous Pokémon">
            ◀
          </PixelButton>
          <PixelButton size="sm" onClick={() => onStep(1)} aria-label="Next Pokémon">
            ▶
          </PixelButton>
          <span className="text-base text-muted">← → to browse · edits stay in the working copy until you save</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SpriteImg dex={dex} size={96} className="border-2 border-ink" />
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Name">
              <TextInput value={s(row.name)} onChange={(v) => patch({ name: v })} />
            </Field>
            <Field label="Type 1">
              <TypePicker value={s(row.type1)} onChange={(t) => t && patch({ type1: t })} />
            </Field>
            <Field label="Type 2">
              <TypePicker nullable value={(row.type2 as string | null) ?? null} onChange={(t) => patch({ type2: t })} />
            </Field>
            <Field label="HP at Lv.1">
              <NumInput value={n(row.base_hp)} onChange={(v) => patch({ base_hp: v ?? 1 })} />
            </Field>
            <Field label="HP at Lv.100">
              <NumInput value={n(row.max_hp)} onChange={(v) => patch({ max_hp: v ?? 1 })} />
            </Field>
            <Field label="Speed">
              <NumInput value={n(row.speed)} onChange={(v) => patch({ speed: v ?? 0 })} />
            </Field>
            <Field label="Rerolls">
              <NumInput value={n(row.rerolls)} onChange={(v) => patch({ rerolls: v ?? 0 })} />
            </Field>
            <Field label="Catch value" hint="1 = always … 9 = legendary">
              <NumInput value={n(row.catch_value, 5)} min={1} max={9} onChange={(v) => patch({ catch_value: Math.max(1, Math.min(9, v ?? 5)) })} />
            </Field>
            <Field label="Sprite URL" className="col-span-2">
              <TextInput value={s(row.sprite_url)} onChange={(v) => patch({ sprite_url: v })} />
            </Field>
          </div>
        </div>
        <section>
          <h3 className="mb-1 text-2xl">Dice</h3>
          <DiceEditor value={(row.dice as DiceEntry[]) ?? []} onChange={(d) => patch({ dice: d })} types={types} data={data} />
        </section>
        <section>
          <h3 className="mb-1 text-2xl">Milestones</h3>
          <MilestoneEditor value={(row.milestones as Milestone[]) ?? []} onChange={(m) => patch({ milestones: m })} />
        </section>
        <section>
          <h3 className="mb-1 text-2xl">Evolutions</h3>
          <EvolutionEditor value={(row.evolutions as Evolution[]) ?? []} onChange={(e) => patch({ evolutions: e })} data={data} />
        </section>
        <Field label="Notes">
          <TextInput value={s(row.notes)} onChange={(v) => patch({ notes: v || null })} />
        </Field>
        <p className="text-base text-muted">Changes go into the working copy immediately — use “Save changes” below to write them.</p>
      </div>
    </Modal>
  )
}

export function PokemonSection() {
  const [open, setOpen] = useState<number | null>(null)
  const rows = useAdmin((st) => st.rows.pokemon)
  const order = useMemo(() => rows.map((r) => n(r.dex)).sort((a, b) => a - b), [rows])
  const step = (d: -1 | 1) =>
    setOpen((cur) => {
      const i = cur == null ? -1 : order.indexOf(cur)
      return order[(i + d + order.length) % order.length] ?? cur
    })
  return (
    <>
      <DataTable
        table="pokemon"
        title="Pokémon"
        onOpen={(r) => setOpen(n(r.dex))}
        duplicate={(r) => ({ ...r, dex: Math.max(...rows.map((x) => n(x.dex))) + 1, name: `${s(r.name)} copy` })}
        columns={[
          { key: 'dex', label: '#', kind: 'number', width: 60 },
          { key: 'sprite', label: '', readOnly: true, width: 44, render: (r) => <SpriteImg dex={n(r.dex)} size={32} /> },
          { key: 'name', label: 'Name', kind: 'text' },
          { key: 'type1', label: 'Type 1', kind: 'enum', options: POKE_TYPES, render: (r) => <TypeBadge type={r.type1 as DieType} size="sm" /> },
          { key: 'type2', label: 'Type 2', kind: 'enum', options: POKE_TYPES, nullable: true, render: (r) => (r.type2 ? <TypeBadge type={r.type2 as DieType} size="sm" /> : '—') },
          { key: 'base_hp', label: 'HP1', kind: 'number' },
          { key: 'max_hp', label: 'HP100', kind: 'number' },
          { key: 'speed', label: 'Spd', kind: 'number' },
          { key: 'dice', label: 'Dice', readOnly: true, render: (r) => <DiceSet dice={expandDice((r.dice as DiceEntry[]) ?? [])} size={20} /> },
          { key: 'rerolls', label: 'RR', kind: 'number' },
          { key: 'catch_value', label: 'Catch', kind: 'number' },
          { key: 'notes', label: 'Notes', kind: 'text', nullable: true },
        ]}
      />
      {open != null && <PokemonEditor dex={open} onClose={() => setOpen(null)} onStep={step} />}
    </>
  )
}
