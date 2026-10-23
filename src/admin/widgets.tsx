import { PixelIcon, type IconName } from '@/components/icons'
import { useState, type ReactNode } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge, TypeSwatch } from '@/components/TypeBadge'
import { BATTLE_BACKGROUNDS, DIE_TYPES, EVENT_ACCESS, POKE_TYPES, type BattleBackground, type DieType, type EventAccess, type GameData, type Species } from '@/engine'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { dexNo } from '@/lib/format'
import { cx } from '@/theme/util'
import { BATTLE_SCENE_NAMES, PICTURE_GROUPS, pictureName } from './pictureNames'

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

/** Battle scene picker with a thumbnail; `emptyLabel` names what an empty choice falls back to. */
export function BackgroundPicker({
  value,
  onChange,
  emptyLabel,
}: {
  value: BattleBackground | null | undefined
  onChange: (v: BattleBackground | null) => void
  emptyLabel: string
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        className={cx(inputCls, 'w-auto')}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as BattleBackground | null)}
      >
        <option value="">{emptyLabel}</option>
        {BATTLE_BACKGROUNDS.map((b) => (
          <option key={b} value={b}>
            {BATTLE_SCENE_NAMES[b]}
          </option>
        ))}
      </select>
      {value && (
        <img src={`/battle/${value}.png`} alt="" width={96} height={45} className="border-2 border-edge" style={{ imageRendering: 'pixelated' }} />
      )}
    </div>
  )
}

/**
 * A banner picture picker: the events' own pictures, then every measured area picture, by group and by name.
 * `placeholder` adds an empty first choice; a saved key no longer on the list stays pickable.
 */
export function PicturePicker({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const groups = PICTURE_GROUPS.map((g) => ({
    label: g.label,
    keys: Object.keys(g.names)
      .filter((k) => k.includes('/') || k in ART_GEOMETRY)
      .sort((a, b) => pictureName(a).localeCompare(pictureName(b))),
  }))
  // A measured picture nobody has named yet still shows, under its key.
  const named = new Set(groups.flatMap((g) => g.keys))
  const unnamed = Object.keys(ART_GEOMETRY)
    .filter((k) => !named.has(k))
    .sort()
  const listed = named.has(value) || unnamed.includes(value)
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {!listed && value && <option value={value}>{value}</option>}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.keys.map((k) => (
            <option key={k} value={k}>
              {pictureName(k)}
            </option>
          ))}
        </optgroup>
      ))}
      {unnamed.length > 0 && (
        <optgroup label="Not named yet">
          {unnamed.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

export const inputCls = 'min-h-[34px] w-full border-2 border-edge bg-panel px-2 py-0.5 text-lg'

/**
 * A number field you can actually empty.
 *
 * A controlled `<input type="number">` that maps '' straight to 0 re-renders as "0" the instant you clear it, so
 * select-all-then-type leaves you fighting a leading zero. This keeps what you typed as a draft string while the
 * field has focus — including the half-finished states a number passes through, like '', '-' and '12.' — and reports
 * a value only once one parses. Leaving the field empty means 0 (or null where the column allows one), which is
 * settled on blur, when the draft is dropped and the real value shows again.
 */
export function useNumberField(
  value: number | null | undefined,
  onChange: (v: number | null) => void,
  nullable = false,
) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => {
    const next = readNumberInput(raw, nullable)
    if (next !== HOLD) onChange(next)
  }
  return {
    value: draft ?? (value ?? '').toString(),
    onChange: (raw: string) => {
      setDraft(raw)
      commit(raw)
    },
    onBlur: () => {
      if (draft !== null) commit(draft)
      setDraft(null)
    },
  }
}

/** What a half-typed number reports: nothing yet. */
export const HOLD = Symbol('hold')

/**
 * Read one keystroke's worth of a number field. Empty is 0 — or null where the column allows one — and anything that
 * is only on the way to a number ('-', '1.', '1e', '  ') holds the previous value rather than reporting NaN.
 */
export function readNumberInput(raw: string, nullable = false): number | null | typeof HOLD {
  if (raw.trim() === '') return nullable ? null : 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : HOLD
}

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
  const field = useNumberField(value, onChange, nullable)
  return (
    <input
      type="number"
      className={cx(inputCls, 'font-mono text-base', className)}
      value={field.value}
      step={step}
      min={min}
      max={max}
      placeholder={nullable ? '∞ / none' : '0'}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
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
      className="w-full accent-[#ffbe2e]"
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
  icon,
  hint,
  actions,
  children,
  className,
}: {
  title: ReactNode
  /** A pixel icon before the title. */
  icon?: IconName
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('pixel-panel flex min-w-0 flex-col gap-3 p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-2xl leading-none">
          {icon && <PixelIcon name={icon} size={20} />}
          {title}
        </h3>
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
  // Clamping mid-typing is what makes a stepper impossible to retype: clearing it snaps to `min` and every further
  // keystroke appends to that. The draft holds what you typed; the clamp lands on blur.
  const field = useNumberField(value, (v) => onChange(clamp(v ?? min)))
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <PixelButton size="sm" disabled={value <= min} onClick={() => onChange(clamp(value - 1))} aria-label={`${label}: one less`}>
        −
      </PixelButton>
      <input
        type="number"
        className={cx(inputCls, 'w-16 text-center font-mono text-base')}
        value={field.value}
        min={min}
        max={max}
        aria-label={label}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
      />
      <PixelButton size="sm" disabled={value >= max} onClick={() => onChange(clamp(value + 1))} aria-label={`${label}: one more`}>
        +
      </PixelButton>
    </div>
  )
}

export const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? d : Number(v) || d)
export const s = (v: unknown) => (v == null ? '' : String(v))

const ACCESS_LABEL: Record<EventAccess, string> = { off: 'Off', admin: 'On for admin', all: 'On for everyone' }

/** An event type's switch: off, on for the admin only (to try it in production first), on for everyone. */
export function AccessSwitch({ value, onChange, label }: { value: EventAccess; onChange: (v: EventAccess) => void; label: string }) {
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1">
      {EVENT_ACCESS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          onClick={() => onChange(a)}
          className={cx(
            'min-h-[34px] px-2.5 text-lg leading-none shadow-ring',
            value === a ? (a === 'off' ? 'bg-well-deep text-ink' : a === 'admin' ? 'bg-gold text-ink' : 'bg-good text-white') : 'bg-panel text-muted',
          )}
        >
          {ACCESS_LABEL[a]}
        </button>
      ))}
    </span>
  )
}
