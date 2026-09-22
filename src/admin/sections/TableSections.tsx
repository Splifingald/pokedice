// Trainers, Items, Dice types, Type chart and Upgrades.
import { useMemo, useState } from 'react'
import type { Row } from '@/config/mapping'
import {
  COMBO_KEYS,
  COMBO_NAMES,
  POKE_TYPES,
  BATTLE_BACKGROUNDS,
  STATUS_KINDS,
  trainerSpecialty,
  type CurableStatus,
  type DieType,
  type Face,
  type ItemDef,
  type ItemEffect,
  type TrainerMon,
} from '@/engine'
import { Die } from '@/components/Die'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { cx } from '@/theme/util'
import { DataTable } from '../DataTable'
import { newUuid, rowKey, setTable, updateRow, useAdmin, useAdminData } from '../store'
import { Field, NumInput, PokemonPicker, TextInput, n, s, useNumberField } from '../widgets'
import { effectText } from '@/i18n/text'

// ---------------------------------------------------------------- Trainers

function TeamEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const row = useAdmin((st) => st.rows.trainers.find((t) => t.id === id))
  const data = useAdminData()
  if (!row || !data) return null
  const team = (row.team as TrainerMon[]) ?? []
  const set = (t: TrainerMon[]) => updateRow('trainers', rowKey('trainers', row), { team: t })
  // Trainers only use potions (heal items), one per Pokémon.
  const items = (row.items as string[] | null) ?? []
  const potions = Object.values(data.items).filter((it) => it.effect.kind === 'heal')
  const setItems = (k: string[]) => updateRow('trainers', rowKey('trainers', row), { items: k })
  return (
    <Modal open onClose={onClose} title={s(row.name)}>
      <div className="flex flex-col gap-2">
        {team.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <PokemonPicker className="flex-1" data={data} value={m.dex} onChange={(d) => set(team.map((x, j) => (j === i ? { ...x, dex: d } : x)))} />
            <span>Lv.</span>
            <NumInput className="w-20" value={m.level} onChange={(v) => set(team.map((x, j) => (j === i ? { ...x, level: v ?? 1 } : x)))} />
            <label className="flex items-center gap-1" title="Shiny colours (cosmetic only)">
              <input
                type="checkbox"
                checked={!!m.shiny}
                onChange={(e) => set(team.map((x, j) => (j === i ? { dex: x.dex, level: x.level, ...(e.target.checked && { shiny: true }) } : x)))}
              />
              shiny
            </label>
            <button type="button" disabled={team.length <= 1} onClick={() => set(team.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <PixelButton size="sm" className="self-start" disabled={team.length >= 3} onClick={() => set([...team, { dex: 16, level: 10 }])}>
          + Pokémon
        </PixelButton>
        <h3 className="mt-2 text-xl">Potions</h3>
        <p className="text-sm text-muted">
          One per Pokémon at most: the best potion goes to the highest level one, which drinks it when a hit could K.O. it.
        </p>
        {items.map((k, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className="flex-1 border-2 border-ink bg-panel px-2 py-1"
              value={k}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
            >
              {potions.map((it) => (
                <option key={it.key} value={it.key}>
                  {it.name} ({effectText(it)})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <PixelButton
          size="sm"
          className="self-start"
          disabled={items.length >= team.length || !potions.length}
          onClick={() => setItems([...items, potions[0]!.key])}
        >
          + Potion
        </PixelButton>
      </div>
    </Modal>
  )
}

export function TrainersSection() {
  const [open, setOpen] = useState<string | null>(null)
  const data = useAdminData()
  return (
    <>
      <DataTable
        table="trainers"
        title="Trainers"
        onOpen={(r) => setOpen(s(r.id))}
        newRow={() => ({
          id: newUuid(),
          name: 'New Trainer',
          sprite_url: '/trainers/default.png',
          team: [{ dex: 16, level: 5 }],
          role: 'trainer',
          badge: null,
          upgrade_level: null,
          battle_background: null,
          rival_of: null,
          items: [],
        })}
        duplicate={(r) => ({ ...r, id: newUuid(), name: `${s(r.name)} II` })}
        columns={[
          {
            key: 'sprite_url',
            label: 'Badge',
            kind: 'text',
            nullable: true,
            width: 80,
            render: (r) => (r.sprite_url ? <img src={s(r.sprite_url)} alt="" width={32} height={32} style={{ imageRendering: 'pixelated' }} /> : '—'),
          },
          { key: 'name', label: 'Name', kind: 'text' },
          { key: 'role', label: 'Role', kind: 'enum', options: ['trainer', 'leader', 'elite', 'champion'] },
          { key: 'badge', label: 'Badge', kind: 'text', nullable: true },
          { key: 'upgrade_level', label: 'Upgrade Lv (empty = area)', kind: 'number', nullable: true, width: 110 },
          { key: 'rival_of', label: "Rival of player's starter (dex)", kind: 'number', nullable: true, width: 110 },
          { key: 'battle_background', label: 'Scene (— = area)', kind: 'enum', options: [...BATTLE_BACKGROUNDS], nullable: true, width: 110 },
          {
            key: 'specialty',
            label: 'Type',
            readOnly: true,
            width: 96,
            render: (r) => {
              const t = data?.trainers[s(r.id)]
              const type = t && data ? trainerSpecialty(t, data) : null
              return type ? <TypeBadge type={type} size="sm" /> : <span className="text-sm text-muted">mixed</span>
            },
          },
          {
            key: 'items',
            label: 'Potions',
            readOnly: true,
            width: 120,
            render: (r) => {
              const keys = (r.items as string[] | null) ?? []
              return keys.length ? keys.map((k) => data?.items[k]?.name ?? k).join(', ') : <span className="text-sm text-muted">—</span>
            },
          },
          {
            key: 'team',
            label: 'Team (✎ to edit)',
            readOnly: true,
            render: (r) => (
              <span className="flex gap-1">
                {((r.team as TrainerMon[]) ?? []).map((m, i) => (
                  <span key={i} className="flex items-center">
                    <SpriteImg dex={m.dex} size={28} shiny={m.shiny} />
                    <span className="text-sm">
                      {m.level}
                      {m.shiny && ' ★'}
                    </span>
                  </span>
                ))}
              </span>
            ),
          },
        ]}
      />
      {open && <TeamEditor id={open} onClose={() => setOpen(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- Items

const CURABLE: CurableStatus[] = ['burn', 'poison', 'frozen', 'paralyze', 'confuse']
const EFFECT_DEFAULTS: Record<ItemEffect['kind'], ItemEffect> = {
  heal: { kind: 'heal', amount: 20 },
  revive: { kind: 'revive', percent: 50 },
  stone: { kind: 'stone' },
  fossil: { kind: 'fossil', dex: 138, level: 20, hours: 24 },
  cure: { kind: 'cure', statuses: ['poison'] },
  rerolls: { kind: 'rerolls', amount: 1 },
  level: { kind: 'level', amount: 1 },
  ball: { kind: 'ball', bonus: 1 },
}

const describeEffect = (effect: unknown) => {
  try {
    return effectText({ effect } as ItemDef)
  } catch {
    return JSON.stringify(effect)
  }
}

function EffectEditor({ value, onDone }: { value: ItemEffect | undefined; onDone: (e: ItemEffect) => void }) {
  const [draft, setDraft] = useState<ItemEffect>(value && value.kind in EFFECT_DEFAULTS ? value : EFFECT_DEFAULTS.heal)
  return (
    <div className="flex min-w-[220px] flex-col gap-1 border-2 border-ink bg-panel p-1">
      <select className="border border-ink bg-panel text-lg" value={draft.kind} onChange={(e) => setDraft(EFFECT_DEFAULTS[e.target.value as ItemEffect['kind']])}>
        <option value="heal">heal HP</option>
        <option value="revive">revive a K.O.'d Pokémon (% of max HP)</option>
        <option value="cure">cure status (battle)</option>
        <option value="rerolls">give rerolls back (battle)</option>
        <option value="level">raise level (Team screen)</option>
        <option value="fossil">fossil: a Pokémon that revives in the Box</option>
        <option value="stone">evolution stone (Team screen; set the item on the Pokémon's evolution)</option>
        <option value="ball">ball: catch-die bonus</option>
      </select>
      {draft.kind === 'cure' ? (
        <div className="flex flex-wrap gap-2 text-base">
          {CURABLE.map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={draft.statuses.includes(k)}
                onChange={(e) => setDraft({ kind: 'cure', statuses: e.target.checked ? [...draft.statuses, k] : draft.statuses.filter((x) => x !== k) })}
              />
              {k}
            </label>
          ))}
        </div>
      ) : draft.kind === 'revive' ? (
        <NumInput value={draft.percent} min={1} max={100} onChange={(v) => setDraft({ kind: 'revive', percent: v ?? 50 })} />
      ) : draft.kind === 'stone' ? null : draft.kind === 'fossil' ? (
        <div className="flex flex-col gap-1 text-base">
          <label className="flex items-center gap-1">
            dex <NumInput value={draft.dex} min={1} max={493} onChange={(v) => setDraft({ ...draft, dex: v ?? 138 })} />
          </label>
          <label className="flex items-center gap-1">
            Lv. <NumInput value={draft.level} min={1} max={100} onChange={(v) => setDraft({ ...draft, level: v ?? 20 })} />
          </label>
          <label className="flex items-center gap-1">
            hours <NumInput value={draft.hours} min={0} onChange={(v) => setDraft({ ...draft, hours: v ?? 24 })} />
          </label>
        </div>
      ) : draft.kind === 'ball' ? (
        <NumInput value={draft.bonus} min={0} max={9} onChange={(v) => setDraft({ kind: 'ball', bonus: v ?? 0 })} />
      ) : (
        <NumInput value={draft.amount} min={1} onChange={(v) => setDraft({ kind: draft.kind, amount: v ?? 1 } as ItemEffect)} />
      )}
      <PixelButton size="sm" onClick={() => onDone(draft)}>
        OK
      </PixelButton>
    </div>
  )
}

export function ItemsSection() {
  const data = useAdminData()
  return (
    <DataTable
      table="items"
      title="Items"
      newRow={() => ({
        key: `item-${Date.now().toString(36)}`,
        name: 'New Item',
        description: null,
        sprite_url: null,
        price: 10,
        effect: { kind: 'heal', amount: 10 },
        in_shop: true,
        shop_badges: 0,
      })}
      duplicate={(r) => ({ ...r, key: `${s(r.key)}-copy` })}
      columns={[
        { key: 'sprite_url', label: '', kind: 'text', nullable: true, width: 48, render: (r) => (r.sprite_url ? <img src={s(r.sprite_url)} alt="" width={28} height={28} style={{ imageRendering: 'pixelated' }} /> : '—') },
        { key: 'key', label: 'Key', kind: 'text' },
        { key: 'name', label: 'Name', kind: 'text' },
        { key: 'description', label: 'Description', kind: 'text', nullable: true },
        {
          key: 'effect',
          label: 'Effect',
          width: 220,
          render: (r) => describeEffect(r.effect),
          editor: (v, set) => <EffectEditor value={v as ItemEffect | undefined} onDone={set} />,
        },
        { key: 'price', label: 'Price ₽', kind: 'number' },
        { key: 'in_shop', label: 'In shop', kind: 'bool' },
        { key: 'once_only', label: 'Unique', kind: 'bool' },
        { key: 'shop_badges', label: 'Badges needed', kind: 'number' },
        {
          key: 'region',
          label: 'Region only',
          width: 130,
          render: (r) => (r.region ? (data?.regions.find((x) => x.id === r.region)?.name ?? s(r.region)) : 'all'),
          editor: (v, set) => (
            <select className="border border-ink bg-panel text-lg" value={(v as string | null) ?? ''} onChange={(e) => set(e.target.value || null)}>
              <option value="">— all regions —</option>
              {[...(data?.regions ?? [])]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          ),
        },
        {
          key: 'shop_area',
          label: 'Area needed',
          width: 170,
          render: (r) => (r.shop_area ? (data?.areas.find((a) => a.id === r.shop_area)?.name ?? '?') : '—'),
          editor: (v, set) => (
            <select className="border border-ink bg-panel text-lg" value={(v as string | null) ?? ''} onChange={(e) => set(e.target.value || null)}>
              <option value="">— none —</option>
              {[...(data?.areas ?? [])]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          ),
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------- Dice types

function FaceSlot({ face, onChange, type, color }: { face: Face; onChange: (f: Face) => void; type: DieType; color: string }) {
  const value = useNumberField(face.value, (v) => onChange({ ...face, value: v ?? 0 } as Face))
  return (
    <div className="flex flex-col items-center gap-1 border-2 border-ink bg-panel p-1">
      <Die type={type} face={face} size={40} color={color} />
      <select
        className="w-full border border-ink bg-panel text-sm"
        value={face.kind === 'status' ? face.status : 'number'}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === 'number' ? { kind: 'number', value: face.value } : { kind: 'status', status: v as Face extends { status: infer S } ? S : never, value: face.value })
        }}
      >
        <option value="number">number</option>
        {STATUS_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="w-14 border border-ink bg-panel text-center font-mono text-sm"
        value={value.value}
        title={face.kind === 'status' ? 'fallback value' : 'value'}
        onChange={(e) => value.onChange(e.target.value)}
        onBlur={value.onBlur}
      />
    </div>
  )
}

export function DiceSection() {
  const rows = useAdmin((st) => st.rows.dice_types)
  const sorted = [...rows].sort((a, b) => n(a.sort_order) - n(b.sort_order))
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-3xl">Dice</h2>
      <p className="text-base text-muted">Each face is a number, or a status with its fallback value (used for damage and combos).</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {sorted.map((r) => {
          const faces = (r.faces as Face[]) ?? []
          const avg = faces.length ? faces.reduce((sum, f) => sum + f.value, 0) / faces.length : 0
          const key = rowKey('dice_types', r)
          const patch = (p: Row) => updateRow('dice_types', key, p)
          const type = s(r.type) as DieType
          return (
            <div key={key} className="pixel-panel flex flex-col gap-2 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={type} />
                <TextInput className="w-32" value={s(r.label)} onChange={(v) => patch({ label: v })} />
                <input type="color" value={s(r.color)} onChange={(e) => patch({ color: e.target.value })} className="h-8 w-10 border-2 border-ink" />
                <span className="font-mono text-sm">{s(r.color)}</span>
                <span className="ml-auto text-lg">avg {avg.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {faces.map((f, i) => (
                  <FaceSlot key={i} face={f} type={type} color={s(r.color)} onChange={(nf) => patch({ faces: faces.map((x, j) => (j === i ? nf : x)) })} />
                ))}
              </div>
              <label className="flex items-center gap-2 text-base">
                Description
                <TextInput className="flex-1" value={s(r.description)} onChange={(v) => patch({ description: v })} />
              </label>
              <div className="flex gap-4 text-base">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={!!r.upgradeable} onChange={(e) => patch({ upgradeable: e.target.checked })} /> upgradeable
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={!!r.counts_for_majority} onChange={(e) => patch({ counts_for_majority: e.target.checked })} /> can set attack typeority
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Type chart

const CYCLE = [1, 2, 0.5, 0]
const CELL_BG: Record<string, string> = { '2': '#4aa84a', '0.5': '#c2452d', '0': '#2a2438', '1': 'transparent' }

export function TypeChartSection() {
  const rows = useAdmin((st) => st.rows.type_chart)
  const map = useMemo(() => new Map(rows.map((r) => [`${s(r.attacking)}>${s(r.defending)}`, n(r.multiplier, 1)])), [rows])
  const cycle = (a: string, d: string) => {
    const cur = map.get(`${a}>${d}`) ?? 1
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]!
    const others = rows.filter((r) => !(r.attacking === a && r.defending === d))
    setTable('type_chart', next === 1 ? others : [...others, { attacking: a, defending: d, multiplier: next }])
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-3xl">Type chart</h2>
      <p className="text-base text-muted">Rows attack, columns defend. Click a cell to cycle ×1 → ×2 → ×½ → ×0. Only non-1 entries are stored.</p>
      <div className="pixel-scroll overflow-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-1 text-left">atk ↓ def →</th>
              {POKE_TYPES.map((t) => (
                <th key={t} className="p-0.5" style={{ writingMode: 'vertical-rl' }}>
                  <TypeBadge type={t} size="sm" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POKE_TYPES.map((a) => (
              <tr key={a}>
                <th className="p-0.5 text-left">
                  <TypeBadge type={a} size="sm" />
                </th>
                {POKE_TYPES.map((d) => {
                  const m = map.get(`${a}>${d}`) ?? 1
                  return (
                    <td key={d} className="p-0">
                      <button
                        type="button"
                        onClick={() => cycle(a, d)}
                        className={cx('h-7 w-7 border border-shadow/50 font-mono text-xs', m === 0 ? 'text-panel' : 'text-ink')}
                        style={{ background: CELL_BG[String(m)] }}
                        title={`${a} → ${d}: ×${m}`}
                      >
                        {m === 1 ? '' : m === 0.5 ? '½' : m}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Upgrades

function Chart({ rows }: { rows: { level: number; bonus: number; cost: number }[] }) {
  const W = 320
  const H = 160
  const maxB = Math.max(1, ...rows.map((r) => r.bonus))
  const maxC = Math.max(1, ...rows.map((r) => r.cost))
  const bw = W / Math.max(1, rows.length)
  const pts = rows.map((r, i) => `${i * bw + bw / 2},${H - (r.cost / maxC) * (H - 16) - 4}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md border-2 border-ink bg-panel" role="img" aria-label="Bonus (bars) and cost (line) per level">
      {rows.map((r, i) => (
        <rect key={i} x={i * bw + 3} y={H - (r.bonus / maxB) * (H - 16)} width={bw - 6} height={(r.bonus / maxB) * (H - 16)} fill="#e8b44a" stroke="#2a2438" />
      ))}
      <polyline points={pts} fill="none" stroke="#c2452d" strokeWidth={2} />
      <text x={4} y={12} fontSize={10} fill="#2a2438">
        bars: bonus (max {maxB}) · line: cost (max {maxC})
      </text>
    </svg>
  )
}

export function UpgradesSection() {
  const combos = useAdmin((st) => st.rows.combo_upgrades)
  const dice = useAdmin((st) => st.rows.die_upgrades)
  const [track, setTrack] = useState<string>('combo:pair')
  const [costBase, setCostBase] = useState(10)
  const [growth, setGrowth] = useState(1.55)
  const [bonusStart, setBonusStart] = useState(2)
  const [bonusStep, setBonusStep] = useState(1)
  const [kind, id] = track.split(':') as ['combo' | 'die', string]
  const table = kind === 'combo' ? 'combo_upgrades' : 'die_upgrades'
  const col = kind === 'combo' ? 'combo_key' : 'die_type'
  const all = kind === 'combo' ? combos : dice
  const rows = all.filter((r) => r[col] === id).sort((a, b) => n(a.level) - n(b.level))
  const chartRows = rows.map((r) => ({ level: n(r.level), bonus: n(r.bonus), cost: n(r.cost) }))
  const patch = (level: number, p: Row) => setTable(table, all.map((r) => (r[col] === id && n(r.level) === level ? { ...r, ...p } : r)))
  const fill = (what: 'cost' | 'bonus') =>
    setTable(
      table,
      all.map((r) => {
        if (r[col] !== id) return r
        const L = n(r.level)
        return what === 'cost'
          ? { ...r, cost: L === 1 ? 0 : Math.round(costBase * growth ** (L - 2)) }
          : { ...r, bonus: Math.round(bonusStart + bonusStep * (L - 1)) }
      }),
    )

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="pixel-scroll flex max-h-[70vh] flex-col gap-1 overflow-auto">
        <div className="text-lg text-muted">Combos</div>
        {COMBO_KEYS.map((k) => (
          <button key={k} type="button" className={cx('pixel-btn px-2 py-0.5 text-left text-lg', track === `combo:${k}` ? 'bg-gold' : 'bg-panel')} onClick={() => setTrack(`combo:${k}`)}>
            {COMBO_NAMES[k]}
          </button>
        ))}
        <div className="mt-2 text-lg text-muted">Dice</div>
        {POKE_TYPES.map((t) => (
          <button key={t} type="button" className={cx('pixel-btn px-2 py-0.5 text-left text-lg', track === `die:${t}` ? 'bg-gold' : 'bg-panel')} onClick={() => setTrack(`die:${t}`)}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-3xl">{kind === 'combo' ? COMBO_NAMES[id as keyof typeof COMBO_NAMES] : `${id} die`} track</h2>
        <div className="flex flex-wrap gap-4">
          <Chart rows={chartRows} />
          <table className="border-collapse text-lg">
            <thead>
              <tr className="bg-ink text-panel">
                <th className="px-2 font-normal">Lv</th>
                <th className="px-2 font-normal">Bonus</th>
                <th className="px-2 font-normal">Cost to reach</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={n(r.level)}>
                  <td className="px-2 text-center">{n(r.level)}</td>
                  <td>
                    <NumInput className="w-20" value={n(r.bonus)} onChange={(v) => patch(n(r.level), { bonus: v ?? 0 })} />
                  </td>
                  <td>
                    <NumInput className="w-24" value={n(r.cost)} onChange={(v) => patch(n(r.level), { cost: v ?? 0 })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pixel-panel flex flex-wrap items-end gap-3 p-2">
          <span className="w-full text-xl">Fill from formula</span>
          <Field label="cost base">
            <NumInput className="w-24" value={costBase} onChange={(v) => setCostBase(v ?? 0)} />
          </Field>
          <Field label="growth">
            <NumInput className="w-24" step={0.05} value={growth} onChange={(v) => setGrowth(v ?? 1)} />
          </Field>
          <PixelButton size="sm" onClick={() => fill('cost')}>
            cost = base × growth^(L−2)
          </PixelButton>
          <Field label="bonus L1">
            <NumInput className="w-20" value={bonusStart} onChange={(v) => setBonusStart(v ?? 0)} />
          </Field>
          <Field label="per level">
            <NumInput className="w-20" value={bonusStep} onChange={(v) => setBonusStep(v ?? 0)} />
          </Field>
          <PixelButton size="sm" onClick={() => fill('bonus')}>
            bonus = L1 + step × (L−1)
          </PixelButton>
        </div>
      </div>
    </div>
  )
}
