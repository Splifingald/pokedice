// Admin → Events → Raids: every number of the raids, and their calendar. The calendar is generated from the rules and a
// seed, one raid a UTC day; a month view shows it with each day's Pokémon, and any day from tomorrow on can be set by
// hand (another Pokémon, or swapped with another day). A new seed re-plans only the days after it takes effect, and any
// change pins today's raid, so the raid players are fighting never changes under them. Each raid Pokémon can have its
// own numbers (HP bars, level…) over the defaults; the type matchups are every raid's.
import { useMemo, useState, type ReactNode } from 'react'
import {
  createRng,
  npcTeam,
  RAID_MON_KEYS,
  raidCalendar,
  raidEntries,
  raidOfDay,
  raidPlanOf,
  raidRules,
  raidSeedOn,
  nextRaidsOf,
  progressRaids,
  raidTeamCap,
  regionOfArea,
  simulateRaid,
  utcDay,
  type GameData,
  type RaidConfig,
  type RaidDay,
  type RaidKind,
  type RaidMonRules,
  type RaidTypeScale,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { cx } from '@/theme/util'
import { useAdminData } from '../../store'
import { Box, Field, NumInput, PokemonPicker, inputCls } from '../../widgets'

const DAY = 86_400_000
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const KIND_LABEL: Record<RaidKind, string> = { special: 'Fixed date', mythical: 'Mythical', legendary: 'Legendary', pseudo: 'Pseudo', filler: 'Filler' }
/** Each kind's colour in the calendar (its cell's ring and its chip). */
const KIND_COLOR: Record<RaidKind, string> = { special: '#ffbe2e', mythical: '#c58aff', legendary: '#f2553f', pseudo: '#5b8def', filler: '#b6c3d9' }
const RULE_LABEL: Record<keyof RaidMonRules, string> = {
  bars: 'HP bars',
  barHp: 'HP per bar',
  level: 'Level',
  upgradeLevel: 'Dice level',
}
const RULE_STEP: Partial<Record<keyof RaidMonRules, number>> = { barHp: 0.1 }
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The content with the raid numbers as edited (saved or not): what every view here shows. */
function useEdited(raid: RaidConfig): GameData | null {
  const data = useAdminData()
  return useMemo(
    () => (data ? { ...data, config: { ...data.config, events: { ...data.config.events, raid: { ...data.config.events.raid, ...raid } } } } : null),
    [data, raid],
  )
}

function KindChip({ kind }: { kind: RaidKind }) {
  return (
    <span className="px-1.5 py-0.5 text-sm leading-none text-ink shadow-ring-thin" style={{ background: KIND_COLOR[kind] }}>
      {KIND_LABEL[kind]}
    </span>
  )
}

export function RaidsTab({ raid, set }: { raid: RaidConfig; set: (patch: Partial<RaidConfig>) => void }) {
  const data = useEdited(raid)
  const today = utcDay(Date.now())
  const cal = raid.calendar
  /** Any change to the plan pins today's raid first: the one players are fighting never changes under them. */
  const setPlan = (patch: Partial<RaidConfig>) => {
    const now = data ? raidOfDay(data, today) : null
    const pinned = now && !cal.overrides?.[today] ? { [today]: { dex: now.dex, shiny: now.shiny } } : {}
    const calendar = { ...cal, ...patch.calendar, overrides: { ...cal.overrides, ...pinned, ...patch.calendar?.overrides } }
    set({ ...patch, calendar })
  }
  const setCal = (patch: Partial<RaidConfig['calendar']>) => setPlan({ calendar: { ...cal, ...patch } })
  const [picked, setPicked] = useState<string>(addDays(today, 1))
  if (!data) return null
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Calendar"
        icon="star"
        hint="One raid a UTC day, the same for everyone, generated from the rules below and the seed. Click a day to see it; from tomorrow on, change it or swap it with another day. Today's and past raids never change."
      >
        <SeedRow raid={raid} setCal={setCal} today={today} />
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <MonthView data={data} today={today} picked={picked} onPick={setPicked} overrides={cal.overrides ?? {}} />
          <DayPanel data={data} raid={raid} day={picked} today={today} setCal={setCal} set={set} />
        </div>
      </Box>
      <MonsBox data={data} raid={raid} set={set} today={today} onShow={setPicked} />
      <NumbersBox raid={raid} set={set} />
      <AnchorsBox data={data} raid={raid} setCal={setCal} />
      <ProgressBox data={data} raid={raid} set={set} />
      <LairsBox data={data} raid={raid} setPlan={setPlan} />
      <MoreBox data={data} raid={raid} set={set} setPlan={setPlan} />
    </div>
  )
}

/** The defaults every raid uses unless its Pokémon has its own numbers. */
function NumbersBox({ raid, set }: { raid: RaidConfig; set: (patch: Partial<RaidConfig>) => void }) {
  const num = (label: string, key: keyof RaidConfig, o: { min?: number; max?: number; step?: number; hint?: string } = {}) => (
    <Field label={label} hint={o.hint}>
      <NumInput min={o.min ?? 0} max={o.max} step={o.step} value={raid[key] as number} onChange={(v) => set({ [key]: Math.max(o.min ?? 0, v ?? 0) } as Partial<RaidConfig>)} />
    </Field>
  )
  return (
    <Box title="Raid numbers" icon="sword" hint="Every raid uses these unless its Pokémon has its own (the Raid Pokémon box below).">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {num('HP bars', 'bars', { min: 1, max: 6 })}
        {num('HP per bar', 'barHp', { min: 0.5, max: 5, step: 0.1, hint: 'In the raid Pokémon’s own max HP.' })}
        {num('Raid level', 'level', { min: 1, max: 100 })}
        {num('Raid dice level', 'upgradeLevel', { min: 1, max: 10, hint: 'Dice and combos of the raid Pokémon.' })}
        {num('Team level cap', 'teamCap', { min: 1, max: 100 })}
        {num('Sides’ dice level', 'sideUpgradeLevel', { min: 1, max: 10 })}
        {num('Friends per raid', 'maxFriends', { max: 2 })}
        {num('Gifts per helper a day', 'helperDailyCap', { max: 20 })}
      </div>
      <TypesRow
        label="The sides’ attacks on the raid Pokémon"
        value={raid.sideTypes}
        onChange={(sideTypes) => set({ sideTypes })}
      />
      <TypesRow
        label="The raid Pokémon’s attacks on the sides"
        value={raid.bossTypes}
        onChange={(bossTypes) => set({ bossTypes })}
      />
      <Field label="Bar colours, first to last">
        <span className="flex flex-wrap gap-2">
          {raid.barColors.map((c, i) => (
            <input
              key={i}
              type="color"
              value={c}
              aria-label={`Bar ${i + 1}`}
              onChange={(e) => set({ barColors: raid.barColors.map((x, j) => (j === i ? e.target.value : x)) })}
              className="h-9 w-12 shadow-ring"
            />
          ))}
        </span>
      </Field>
    </Box>
  )
}

/** One side's type matchups in every raid: what each kind of hit lands at instead of ×2, ×½ and ×0. */
function TypesRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: RaidTypeScale
  onChange: (v: RaidTypeScale) => void
}) {
  const field = (name: string, key: keyof RaidTypeScale, usual: string) => (
    <Field label={name} hint={`Usually ${usual}.`}>
      <NumInput
        min={0}
        max={4}
        step={0.1}
        value={value[key]}
        onChange={(v) => onChange({ ...value, [key]: Math.max(0, v ?? 0) })}
      />
    </Field>
  )
  return (
    <fieldset className="grid gap-3 border-t-2 border-line pt-2 sm:grid-cols-3 lg:grid-cols-4">
      <legend className="pr-2 text-lg">{label}</legend>
      {field('× Super effective', 'super', '×2')}
      {field('× Resisted', 'resisted', '×0.5')}
      {field('× Immune', 'immune', '×0: no damage')}
    </fieldset>
  )
}

/** The seed: the one in force today, and a new one from tomorrow on. */
function SeedRow({ raid, setCal, today }: { raid: RaidConfig; setCal: (p: Partial<RaidConfig['calendar']>) => void; today: string }) {
  const data = useAdminData()
  const seeds = raid.calendar.seeds ?? []
  const tomorrow = addDays(today, 1)
  const current = data ? raidSeedOn({ ...data, config: { ...data.config, events: { ...data.config.events, raid: { ...data.config.events.raid, ...raid } } } }, tomorrow) : 0
  const [next, setNext] = useState<number | null>(null)
  const apply = (seed: number) => setCal({ seeds: [...seeds.filter((s) => s.from !== tomorrow), { from: tomorrow, seed }].sort((a, b) => a.from.localeCompare(b.from)) })
  return (
    <div className="flex flex-wrap items-end gap-2 border-b-2 border-line pb-3">
      <Field label="Seed from tomorrow">
        <NumInput min={0} value={next ?? current} onChange={(v) => setNext(v ?? 0)} className="!w-32" />
      </Field>
      <PixelButton size="sm" disabled={next == null || next === current} onClick={() => next != null && apply(next)}>
        Apply from {tomorrow}
      </PixelButton>
      <PixelButton size="sm" onClick={() => apply(Math.floor(Math.random() * 1_000_000))}>
        New random seed
      </PixelButton>
      <span className="text-base text-muted">
        {seeds.length
          ? `History: ${seeds.map((s) => `${s.seed} from ${s.from}`).join(' · ')}`
          : 'Seed 0 since the start. A new seed re-plans the days after it only; days set by hand stay.'}
      </span>
    </div>
  )
}

/** A month of raids: each day's Pokémon, its kind's colour, today ringed, past days dimmed, hand-set days marked. */
function MonthView({
  data,
  today,
  picked,
  onPick,
  overrides,
}: {
  data: GameData
  today: string
  picked: string
  onPick: (day: string) => void
  overrides: Record<string, unknown>
}) {
  const [month, setMonth] = useState(() => picked.slice(0, 7))
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  const label = first.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const cal = raidCalendar(data, y)
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <PixelButton size="sm" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </PixelButton>
        <h4 className="m-0 min-w-[10rem] text-center text-2xl font-normal">{label}</h4>
        <PixelButton size="sm" onClick={() => shift(1)} aria-label="Next month">
          ›
        </PixelButton>
        <PixelButton size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </PixelButton>
        <span className="ml-auto flex flex-wrap gap-1">
          {(Object.keys(KIND_LABEL) as RaidKind[]).map((k) => (
            <KindChip key={k} kind={k} />
          ))}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-center text-base text-muted">
              {w}
            </span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={`x${i}`} />
            const idx = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.UTC(y, 0, 1)) / DAY)
            const r = cal[idx]
            const past = day < today
            const isToday = day === today
            const manual = day in overrides
            return (
              <button
                key={day}
                type="button"
                onClick={() => onPick(day)}
                aria-pressed={picked === day}
                aria-label={`${day}: ${r && r.dex ? `${r.shiny ? 'shiny ' : ''}${data.species[r.dex]?.name ?? r.dex}` : 'no raid'}${manual ? ', set by hand' : ''}`}
                className={cx(
                  'relative flex min-h-[72px] flex-col items-center justify-between bg-panel p-0.5 text-left',
                  past && 'opacity-50',
                  picked === day && 'bg-gold-pale',
                )}
                style={{ boxShadow: `inset 0 0 0 ${isToday ? 3 : 2}px ${isToday ? '#f2553f' : r && r.dex ? KIND_COLOR[r.kind] : '#dfe7f2'}` }}
              >
                <span className="flex w-full items-center justify-between px-1 text-sm leading-none">
                  <span>{Number(day.slice(8))}</span>
                  {manual && <span className="bg-ink px-1 text-xs text-white">hand</span>}
                </span>
                {r && r.dex ? <SpriteImg dex={r.dex} shiny={r.shiny} size={44} /> : <span className="text-muted">—</span>}
                {r?.shiny && <span className="absolute bottom-0.5 right-1 text-sm text-gold">shiny</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** One day: its raid, where it comes from, and (from tomorrow on) changing it, swapping it, its Pokémon's numbers. */
function DayPanel({
  data,
  raid,
  day,
  today,
  setCal,
  set,
}: {
  data: GameData
  raid: RaidConfig
  day: string
  today: string
  setCal: (p: Partial<RaidConfig['calendar']>) => void
  set: (patch: Partial<RaidConfig>) => void
}) {
  const r = raidOfDay(data, day)
  const plan = raidPlanOf(data, day)
  const overrides = raid.calendar.overrides ?? {}
  const manual = day in overrides
  const locked = day <= today
  const [swap, setSwap] = useState('')
  const setDay = (patch: Record<string, { dex: number; shiny: boolean } | null>) => {
    const next = { ...overrides }
    for (const [d, v] of Object.entries(patch)) {
      if (v) next[d] = v
      else delete next[d]
    }
    setCal({ overrides: next })
  }
  const date = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const area = r ? data.areas.find((a) => a.id === r.areaId) : null
  return (
    <aside className="flex flex-col gap-2 bg-paper p-3 shadow-card" aria-label={`Raid of ${day}`}>
      <h4 className="m-0 text-xl font-normal">{date}</h4>
      {r ? (
        <div className="flex items-center gap-3">
          <SpriteImg dex={r.dex} shiny={r.shiny} size={96} />
          <div className="grid gap-1">
            <b className="text-2xl font-normal leading-none">
              {r.shiny ? 'Shiny ' : ''}
              {data.species[r.dex]?.name ?? `#${r.dex}`}
            </b>
            <span className="flex flex-wrap items-center gap-1">
              <KindChip kind={r.kind} />
              {manual && <span className="bg-ink px-1.5 py-0.5 text-sm leading-none text-white">set by hand</span>}
            </span>
            <span className="text-base text-muted">{area ? `${area.name} (${regionOfArea(area)})` : 'No area'}</span>
            {manual && plan && (plan.dex !== r.dex || plan.shiny !== r.shiny) && (
              <span className="text-base text-muted">
                The plan had {plan.shiny ? 'shiny ' : ''}
                {data.species[plan.dex]?.name ?? plan.dex}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="m-0 text-lg text-muted">No raid this day.</p>
      )}
      {locked ? (
        <p className="m-0 text-base text-muted">{day === today ? 'Today’s raid is being fought: it can’t change.' : 'A past day.'}</p>
      ) : (
        <div className="grid gap-2 border-t-2 border-line pt-2">
          <Field label="Change it to">
            <PokemonPicker data={data} value={r?.dex} onChange={(dex) => setDay({ [day]: { dex, shiny: r?.shiny ?? false } })} />
          </Field>
          <label className="flex items-center gap-2 text-lg">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={!!r?.shiny}
              disabled={!r}
              onChange={(e) => r && setDay({ [day]: { dex: r.dex, shiny: e.target.checked } })}
            />
            Shiny
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Swap with the day">
              <input type="date" className={inputCls} min={addDays(today, 1)} value={swap} onChange={(e) => setSwap(e.target.value)} />
            </Field>
            <PixelButton
              size="sm"
              disabled={!r || !swap || swap <= today || swap === day}
              onClick={() => {
                const other = raidOfDay(data, swap)
                if (!r || !other) return
                setDay({ [day]: { dex: other.dex, shiny: other.shiny }, [swap]: { dex: r.dex, shiny: r.shiny } })
                setSwap('')
              }}
            >
              Swap
            </PixelButton>
          </div>
          {manual && (
            <PixelButton size="sm" onClick={() => setDay({ [day]: null })}>
              Back to the plan
            </PixelButton>
          )}
        </div>
      )}
      {r && <MonRulesEditor data={data} raid={raid} dex={r.dex} set={set} />}
    </aside>
  )
}

/** One raid Pokémon's own numbers: empty fields use the defaults (shown greyed). */
function MonRulesEditor({ data, raid, dex, set, compact }: { data: GameData; raid: RaidConfig; dex: number; set: (p: Partial<RaidConfig>) => void; compact?: boolean }) {
  const own = raid.perMon?.[dex] ?? {}
  const eff = raidRules(data, dex)
  const put = (key: keyof RaidMonRules, v: number | null) => {
    const next: RaidMonRules = { ...own }
    if (v == null) delete next[key]
    else next[key] = v
    const perMon = { ...raid.perMon }
    if (Object.keys(next).length) perMon[dex] = next
    else delete perMon[dex]
    set({ perMon })
  }
  return (
    <div className={cx('grid gap-2', compact ? 'grid-cols-4' : 'grid-cols-2')}>
      {!compact && <span className="col-span-2 text-lg">{data.species[dex]?.name}’s own numbers</span>}
      {RAID_MON_KEYS.map((k) => (
        <label key={k} className="grid gap-0.5">
          {!compact && <span className="text-sm text-muted">{RULE_LABEL[k]}</span>}
          <input
            type="number"
            className={cx(inputCls, 'font-mono text-base', own[k] != null && 'bg-gold-pale')}
            value={own[k] ?? ''}
            placeholder={String(eff[k])}
            step={RULE_STEP[k] ?? 1}
            min={0}
            aria-label={`${data.species[dex]?.name ?? dex}: ${RULE_LABEL[k]}`}
            onChange={(e) => put(k, e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
          />
        </label>
      ))}
    </div>
  )
}

/** Every raid Pokémon of the calendar, with its kind, its next dates and its own numbers. */
function MonsBox({ data, raid, set, today, onShow }: { data: GameData; raid: RaidConfig; set: (p: Partial<RaidConfig>) => void; today: string; onShow: (day: string) => void }) {
  const [kind, setKind] = useState<RaidKind | 'all' | 'own'>(() => (Object.keys(raid.perMon ?? {}).length ? 'own' : 'all'))
  const [q, setQ] = useState('')
  const [count, setCount] = useState(24)
  const rows = useMemo(() => {
    const e = raidEntries(data)
    const all = [...e.mythical, ...e.legendary, ...e.pseudo, ...e.filler]
    const byDex = new Map<number, { dex: number; kind: RaidKind; shiny: Set<boolean> }>()
    for (const x of all) {
      const row = byDex.get(x.dex) ?? { dex: x.dex, kind: x.kind, shiny: new Set<boolean>() }
      row.shiny.add(x.shiny)
      byDex.set(x.dex, row)
    }
    for (const a of raid.calendar.anchors) if (!byDex.has(a.dex)) byDex.set(a.dex, { dex: a.dex, kind: 'special', shiny: new Set([a.shiny]) })
    return [...byDex.values()].sort((a, b) => a.dex - b.dex)
  }, [data, raid.calendar.anchors])
  const shown = rows.filter(
    (r) =>
      (kind === 'all' || (kind === 'own' ? !!raid.perMon?.[r.dex] : r.kind === kind)) &&
      (!q.trim() || `${r.dex} ${data.species[r.dex]?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())),
  )
  const counts = (k: RaidKind) => rows.filter((r) => r.kind === k).length
  return (
    <Box
      title={`Raid Pokémon · ${rows.length}`}
      icon="ball"
      hint="Each Pokémon of the calendar. Its own numbers override the defaults (empty = default, shown greyed). Click a date to see that day in the calendar."
    >
      <div className="flex flex-wrap items-center gap-1">
        {(['own', 'all', 'mythical', 'legendary', 'pseudo', 'filler', 'special'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k)
              setCount(24)
            }}
            className={cx('min-h-[34px] px-2 text-lg shadow-ring', kind === k ? 'bg-gold text-ink' : 'bg-panel')}
          >
            {k === 'own' ? `With own numbers (${Object.keys(raid.perMon ?? {}).length})` : k === 'all' ? `All (${rows.length})` : `${KIND_LABEL[k]} (${counts(k)})`}
          </button>
        ))}
        <input
          className={cx(inputCls, 'ml-auto !w-56')}
          placeholder="Find a Pokémon"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setCount(24)
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-lg">
          <thead>
            <tr className="text-left text-sm text-muted">
              <th className="font-normal">Pokémon</th>
              <th className="font-normal">Next raids</th>
              {RAID_MON_KEYS.map((k) => (
                <th key={k} className="font-normal">
                  {RULE_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, count).map((r) => (
              <tr key={r.dex} className="border-t border-shadow/40 align-middle">
                <td className="py-1 pr-2">
                  <span className="flex items-center gap-2">
                    <SpriteImg dex={r.dex} size={40} shiny={r.shiny.has(true) && !r.shiny.has(false)} />
                    <span className="grid gap-0.5">
                      <span>{data.species[r.dex]?.name ?? `#${r.dex}`}</span>
                      <span className="flex gap-1">
                        <KindChip kind={r.kind} />
                        {r.shiny.has(true) && <span className="text-sm text-gold">shiny</span>}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="pr-2 text-base">
                  {nextRaidsOf(data, r.dex, today, 2).map((n) => (
                    <button key={n.day} type="button" className="mr-1 underline" onClick={() => onShow(n.day)}>
                      {n.day.slice(5)}
                      {n.shiny ? '★' : ''}
                    </button>
                  ))}
                </td>
                <td colSpan={RAID_MON_KEYS.length}>
                  <MonRulesEditor data={data} raid={raid} dex={r.dex} set={set} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > count && (
        <div className="flex items-center gap-2">
          <PixelButton size="sm" onClick={() => setCount(count + 24)}>
            Show 24 more
          </PixelButton>
          <span className="text-base text-muted">
            {count} of {shown.length}: or search, or pick a kind.
          </span>
        </div>
      )}
      {kind === 'own' && !shown.length && <p className="m-0 text-base text-muted">No Pokémon has its own numbers yet: pick “All” and edit one.</p>}
    </Box>
  )
}

/** The fixed dates (every year): their Pokémon, shiny or not. */
function AnchorsBox({ data, raid, setCal }: { data: GameData; raid: RaidConfig; setCal: (p: Partial<RaidConfig['calendar']>) => void }) {
  const cal = raid.calendar
  const put = (i: number, patch: Partial<RaidConfig['calendar']['anchors'][number]>) => setCal({ anchors: cal.anchors.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <Box title={`Fixed dates · ${cal.anchors.length}`} icon="flag" hint="Every year, this Pokémon on this date (Pokémon Day, Earth Day, Halloween…). The rest of the year is laid out around them.">
      <div className="grid gap-2 lg:grid-cols-2">
        {cal.anchors.map((a, i) => (
          <div key={i} className="grid grid-cols-[48px_80px_minmax(0,1fr)_auto_auto] items-center gap-2 bg-paper p-2 shadow-card">
            <SpriteImg dex={a.dex} shiny={a.shiny} size={48} />
            <input
              className={inputCls}
              defaultValue={a.date}
              aria-label="Date, MM-DD"
              onBlur={(e) => /^[0-9]{2}-[0-9]{2}$/.test(e.target.value.trim()) && put(i, { date: e.target.value.trim() })}
            />
            <PokemonPicker className="min-w-0" data={data} value={a.dex} onChange={(dex) => put(i, { dex })} />
            <label className="flex items-center gap-1 text-lg">
              <input type="checkbox" className="h-5 w-5" checked={a.shiny} onChange={(e) => put(i, { shiny: e.target.checked })} />
              Shiny
            </label>
            <PixelButton size="sm" onClick={() => setCal({ anchors: cal.anchors.filter((_, j) => j !== i) })} aria-label="Remove this date">
              ✕
            </PixelButton>
          </div>
        ))}
      </div>
      <div>
        <PixelButton size="sm" onClick={() => setCal({ anchors: [...cal.anchors, { date: '01-01', dex: 151, shiny: false }] })}>
          Add a date
        </PixelButton>
      </div>
      <Field label="Fillers from areas starting at Lv." hint="A shiny filler comes from an area at least this high.">
        <NumInput className="!w-24" min={1} max={100} value={cal.fillerMinLevel} onChange={(v) => setCal({ fillerMinLevel: Math.max(1, v ?? 40) })} />
      </Field>
    </Box>
  )
}

type ProgressRules = NonNullable<RaidConfig['progress']['perMon']>[string]
const PROGRESS_KEYS = [...RAID_MON_KEYS, 'teamCap'] as const

/**
 * The progression raids (docs/24): every area boss flagged Raid, by region, with its area. Their team cap, and each
 * raid Pokémon's own numbers over the raid defaults; the day's raid's own numbers never apply here.
 */
function ProgressBox({ data, raid, set }: { data: GameData; raid: RaidConfig; set: (p: Partial<RaidConfig>) => void }) {
  const progress = raid.progress ?? { teamCap: raid.teamCap, perMon: {} }
  const all = useMemo(() => progressRaids(data), [data])
  const regions = [...new Set(all.map((r) => r.region))]
  const [region, setRegion] = useState<string>(regions[0] ?? 'kanto')
  const shown = all.filter((r) => r.region === region)
  const setProgress = (patch: Partial<RaidConfig['progress']>) => set({ progress: { ...progress, ...patch } })
  const put = (dex: number, key: keyof ProgressRules, v: number | null) => {
    const next: ProgressRules = { ...progress.perMon?.[dex] }
    if (v == null) delete next[key]
    else next[key] = v
    const perMon = { ...progress.perMon }
    if (Object.keys(next).length) perMon[dex] = next
    else delete perMon[dex]
    setProgress({ perMon })
  }
  const label = (k: keyof ProgressRules) => (k === 'teamCap' ? 'Team cap' : RULE_LABEL[k])
  return (
    <Box
      title={`Progression raids · ${all.length}`}
      icon="badge"
      hint="An area boss with Raid ticked (Areas → bosses): a raid on its own page once its area is completed, teams from that region's Box. Empty = the raid numbers above, shown greyed."
    >
      <Field label="Team level cap" hint="The sides' level cap in every progression raid, unless the Pokémon has its own.">
        <NumInput className="!w-24" min={1} max={100} value={progress.teamCap} onChange={(v) => setProgress({ teamCap: Math.max(1, v ?? 50) })} />
      </Field>
      <div className="flex flex-wrap gap-1">
        {regions.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={region === r}
            onClick={() => setRegion(r)}
            className={cx('min-h-[34px] px-2 text-lg shadow-ring', region === r ? 'bg-gold text-ink' : 'bg-panel')}
          >
            {data.regions.find((x) => x.id === r)?.name ?? r} ({all.filter((x) => x.region === r).length})
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-lg">
          <thead>
            <tr className="text-left text-sm text-muted">
              <th className="font-normal">Pokémon</th>
              {PROGRESS_KEYS.map((k) => (
                <th key={k} className="font-normal">
                  {label(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const own = progress.perMon?.[r.dex] ?? {}
              const eff = { ...raidRules(data, r.dex, 'progress', r.areaId), teamCap: raidTeamCap(data, r.dex, 'progress', r.areaId) }
              return (
                <tr key={r.key} className="border-t border-shadow/40 align-middle">
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-2">
                      <SpriteImg dex={r.dex} size={40} />
                      <span className="grid gap-0.5">
                        <span>{data.species[r.dex]?.name ?? `#${r.dex}`}</span>
                        <span className="text-sm text-muted">{data.areas.find((a) => a.id === r.areaId)?.name}</span>
                      </span>
                    </span>
                  </td>
                  {PROGRESS_KEYS.map((k) => (
                    <td key={k} className="pr-1">
                      <input
                        type="number"
                        className={cx(inputCls, 'font-mono text-base', own[k] != null && 'bg-gold-pale')}
                        value={own[k] ?? ''}
                        placeholder={String(eff[k])}
                        step={k === 'teamCap' ? 1 : (RULE_STEP[k] ?? 1)}
                        min={0}
                        aria-label={`${data.species[r.dex]?.name ?? r.dex}: ${label(k)}`}
                        onChange={(e) => put(r.dex, k, e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!all.length && <p className="m-0 text-base text-muted">No area boss is a raid: tick Raid on one in Areas.</p>}
    </Box>
  )
}

/** The mythicals of the raids (shiny there) and their lairs, where each is also the boss. */
function LairsBox({ data, raid, setPlan }: { data: GameData; raid: RaidConfig; setPlan: (p: Partial<RaidConfig>) => void }) {
  const areas = data.areas.slice().sort((a, b) => (a.regionId ?? '').localeCompare(b.regionId ?? '') || a.orderIndex - b.orderIndex)
  const put = (i: number, patch: Partial<RaidConfig['pool'][number]>) => setPlan({ pool: raid.pool.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <Box title={`Mythicals · ${raid.pool.length}`} icon="masterball" hint="Each a shiny raid of the calendar, fought in front of its lair; a catch waits until the lair is completed. In its lair it's the boss, never shiny there.">
      <div className="grid gap-2 lg:grid-cols-2">
        {raid.pool.map((p, i) => (
          <div key={i} className="grid grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 bg-paper p-2 shadow-card">
            <SpriteImg dex={p.dex} size={48} />
            <PokemonPicker className="min-w-0" data={data} value={p.dex} onChange={(dex) => put(i, { dex })} />
            <select className={cx(inputCls, 'min-w-0')} value={p.areaId} onChange={(e) => put(i, { areaId: e.target.value })} aria-label="Its lair">
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.regionId ?? 'kanto').toUpperCase()} · {a.name}
                </option>
              ))}
            </select>
            <PixelButton size="sm" onClick={() => setPlan({ pool: raid.pool.filter((_, j) => j !== i) })} aria-label="Remove">
              ✕
            </PixelButton>
          </div>
        ))}
      </div>
      <div>
        <PixelButton size="sm" onClick={() => setPlan({ pool: [...raid.pool, { dex: 151, areaId: areas[0]?.id ?? '' }] })}>
          Add a mythical
        </PixelButton>
      </div>
    </Box>
  )
}

/** Who may fight beside you as an NPC, the helpers' gifts, and the simulator. */
function MoreBox({ data, raid, set, setPlan }: { data: GameData; raid: RaidConfig; set: (p: Partial<RaidConfig>) => void; setPlan: (p: Partial<RaidConfig>) => void }) {
  const total = raid.gifts.reduce((n, g) => n + Math.max(0, g.weight), 0)
  const items = Object.values(data.items).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Box title="Allies, gifts, balance" icon="friends">
      <div className="grid gap-3 sm:grid-cols-2">
        <DexChips data={data} label="Never an NPC ally (and pseudo-legendaries of the calendar)" value={raid.exclude.pseudo} onChange={(pseudo) => setPlan({ exclude: { ...raid.exclude, pseudo } })} />
        <DexChips data={data} label="… and these (Ultra Beasts, Paradox Pokémon…)" value={raid.exclude.extra} onChange={(extra) => set({ exclude: { ...raid.exclude, extra } })} />
      </div>
      <Field label="Helpers’ gifts (a friend who fought beside you, once the raid Pokémon is caught)">
        <div className="grid gap-1">
          {raid.gifts.map((g, i) => (
            <div key={i} className="grid max-w-xl grid-cols-[minmax(0,1fr)_96px_56px_auto] items-center gap-2">
              <select className={inputCls} value={g.key} onChange={(e) => set({ gifts: raid.gifts.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })}>
                {items.map((it) => (
                  <option key={it.key} value={it.key}>
                    {it.name}
                  </option>
                ))}
              </select>
              <NumInput min={0} value={g.weight} onChange={(v) => set({ gifts: raid.gifts.map((x, j) => (j === i ? { ...x, weight: Math.max(0, v ?? 0) } : x)) })} />
              <span className="font-mono">{total ? `${Math.round((Math.max(0, g.weight) * 100) / total)} %` : '—'}</span>
              <PixelButton size="sm" onClick={() => set({ gifts: raid.gifts.filter((_, j) => j !== i) })} aria-label="Remove">
                ✕
              </PixelButton>
            </div>
          ))}
          <div>
            <PixelButton size="sm" onClick={() => set({ gifts: [...raid.gifts, { key: 'potion', weight: 10 }] })}>
              Add a gift
            </PixelButton>
          </div>
        </div>
      </Field>
      <RaidSim data={data} raid={raid} />
    </Box>
  )
}

/** Dex numbers as chips with their icons; type a number or a name to add one. */
function DexChips({ data, label, value, onChange }: { data: GameData; label: string; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1">
        {value.map((d) => (
          <button key={d} type="button" className="flex items-center gap-1 bg-paper pr-1.5 text-base shadow-ring-thin" onClick={() => onChange(value.filter((x) => x !== d))} aria-label={`Remove ${data.species[d]?.name ?? d}`}>
            <SpriteImg dex={d} size={28} />
            {data.species[d]?.name ?? d} ✕
          </button>
        ))}
        <span className="w-56">
          <PokemonPicker data={data} value={null} onChange={(d) => !value.includes(d) && onChange([...value, d])} />
        </span>
      </div>
    </Field>
  )
}

/** The raid sims: three sides of random raid-eligible Pokémon, on the battle AI, against the next two weeks' raids. */
function RaidSim({ data, raid }: { data: GameData; raid: RaidConfig }) {
  const [n, setN] = useState(30)
  const [rows, setRows] = useState<{ dex: number; win: number; steps: number }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const today = utcDay(Date.now())
  const raids: RaidDay[] = []
  for (let k = 0; k < 14; k++) {
    const r = raidOfDay(data, addDays(today, k))
    if (r && !raids.some((x) => x.dex === r.dex)) raids.push(r)
  }
  const run = () => {
    setBusy(true)
    setTimeout(() => {
      const regions = data.regions.map((r) => r.id)
      const rng = createRng(1)
      setRows(
        raids
          .filter((r) => !!data.species[r.dex])
          .map((r) => {
            let wins = 0
            let steps = 0
            for (let i = 0; i < n; i++) {
              const sides = [0, 1, 2].map((k) => ({ owner: `Side ${k + 1}`, look: null, kind: 'npc' as const, team: npcTeam(data, regions, rng, `s${k}`) }))
              const res = simulateRaid({ boss: { dex: r.dex, shiny: r.shiny }, sides }, data, rng)
              if (res.won) wins++
              steps += res.steps
            }
            return { dex: r.dex, win: wins / n, steps: steps / n }
          }),
      )
      setBusy(false)
    }, 30)
  }
  const cell = (children: ReactNode) => <td className="py-0.5 pr-3">{children}</td>
  return (
    <details className="border-t-2 border-line pt-2">
      <summary className="cursor-pointer text-xl">Simulate the win rate · the next two weeks</summary>
      <p className="m-0 mt-1 text-base text-muted">Three sides of random fully evolved Pokémon at Lv.{raid.teamCap}, all on the battle AI, each raid with its own numbers. Target: about 50–70 %.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Raids each">
          <NumInput min={5} max={200} value={n} onChange={(v) => setN(Math.max(5, Math.min(200, v ?? 30)))} />
        </Field>
        <PixelButton size="sm" disabled={busy} onClick={run}>
          {busy ? 'Simulating…' : 'Run'}
        </PixelButton>
      </div>
      {rows && (
        <table className="mt-2 text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-normal">Raid</th>
              <th className="font-normal">Win %</th>
              <th className="font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dex} className="border-t border-shadow/40">
                {cell(
                  <span className="flex items-center gap-2">
                    <SpriteImg dex={r.dex} size={32} />
                    {data.species[r.dex]?.name}
                  </span>,
                )}
                {cell(<span className="font-mono">{Math.round(r.win * 100)}</span>)}
                {cell(<span className="font-mono">{r.steps.toFixed(0)}</span>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  )
}
