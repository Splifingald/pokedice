import type { ReactNode } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge, TypeSwatch } from '@/components/TypeBadge'
import { DIE_TYPES, POKE_TYPES, type DieType, type GameData, type Species } from '@/engine'
import { dexNo } from '@/lib/format'
import { cx } from '@/theme/util'

export function speciesOption(p: Species) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <SpriteImg dex={p.dex} size={28} />
      <span className="font-mono text-xs text-muted">{dexNo(p.dex)}</span>
      <span className="truncate">{p.name}</span>
      <TypeBadge type={p.type1} size="sm" />
      {p.type2 && <TypeBadge type={p.type2} size="sm" />}
    </span>
  )
}

/** Choosing a Pokémon shows sprite + dex + name + type badges in both the list and the closed state. */
export function PokemonPicker({
  data,
  value,
  onChange,
  className,
}: {
  data: GameData
  value: number | null | undefined
  onChange: (dex: number) => void
  className?: string
}) {
  return (
    <SearchSelect
      className={className}
      options={data.speciesList}
      value={value ? (data.species[value] ?? null) : null}
      onChange={(p) => onChange(p.dex)}
      getKey={(p) => p.dex}
      getLabel={(p) => `${p.dex} ${p.name} ${p.type1} ${p.type2 ?? ''}`}
      renderOption={speciesOption}
      placeholder="Pick a Pokémon…"
    />
  )
}

/** Choosing a type shows its colour swatch. */
export function TypePicker({
  value,
  onChange,
  allowBase = false,
  nullable = false,
  className,
}: {
  value: string | null | undefined
  onChange: (t: DieType | null) => void
  allowBase?: boolean
  nullable?: boolean
  className?: string
}) {
  const opts = (allowBase ? DIE_TYPES : POKE_TYPES) as readonly string[]
  return (
    <SearchSelect
      className={className}
      options={[...(nullable ? ['—'] : []), ...opts]}
      value={value ?? (nullable ? '—' : null)}
      onChange={(t) => onChange(t === '—' ? null : (t as DieType))}
      getKey={(t) => t}
      getLabel={(t) => t}
      renderOption={(t) =>
        t === '—' ? (
          <span className="text-muted">none</span>
        ) : (
          <span className="flex items-center gap-2">
            <TypeSwatch type={t as DieType} /> {t}
          </span>
        )
      }
      placeholder="type…"
    />
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-0.5', className)}>
      <span className="text-lg leading-none">{label}</span>
      {children}
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls = 'min-h-[34px] w-full border-2 border-ink bg-panel px-2 py-0.5 text-lg'

export function NumInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  nullable,
  className,
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  step?: number
  min?: number
  max?: number
  nullable?: boolean
  className?: string
}) {
  return (
    <input
      type="number"
      className={cx(inputCls, 'font-mono text-base', className)}
      value={value ?? ''}
      step={step}
      min={min}
      max={max}
      placeholder={nullable ? '∞ / none' : undefined}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') onChange(nullable ? null : 0)
        else onChange(Number(raw))
      }}
    />
  )
}

export function TextInput({ value, onChange, className, placeholder }: { value: string | null | undefined; onChange: (v: string) => void; className?: string; placeholder?: string }) {
  return <input className={cx(inputCls, className)} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="range"
      className="w-full accent-[#e8b44a]"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/** A titled box grouping related settings. */
export function Box({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('pixel-panel flex min-w-0 flex-col gap-3 p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-2xl leading-none">{title}</h3>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {hint && <p className="-mt-1 text-base leading-snug text-muted">{hint}</p>}
      {children}
    </section>
  )
}

/** − [n] + : whole numbers, typed or stepped. */
export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 99,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  min?: number
  max?: number
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)))
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <PixelButton size="sm" disabled={value <= min} onClick={() => onChange(clamp(value - 1))} aria-label={`${label}: one less`}>
        −
      </PixelButton>
      <input
        type="number"
        className={cx(inputCls, 'w-16 text-center font-mono text-base')}
        value={value}
        min={min}
        max={max}
        aria-label={label}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
      />
      <PixelButton size="sm" disabled={value >= max} onClick={() => onChange(clamp(value + 1))} aria-label={`${label}: one more`}>
        +
      </PixelButton>
    </div>
  )
}

export const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? d : Number(v) || d)
export const s = (v: unknown) => (v == null ? '' : String(v))
