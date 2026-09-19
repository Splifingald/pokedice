import { useMemo, useState } from 'react'
import type { Row } from '@/config/mapping'
import {
  deckCounts,
  lootCopies,
  trainerSpecialty,
  type BattleBackground,
  type BossDef,
  type DeckCounts,
  type EncounterKind,
  type GameData,
  type LevelOffsetRange,
  type ScaleOffsets,
  type UnlockCondition,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { cx, textOn } from '@/theme/util'
import { DataTable } from '../DataTable'
import { addRows, newUuid, removeRows, rowKey, setTable, updateRow, useAdmin, useAdminData } from '../store'
import { BackgroundPicker, Box, Field, NumInput, PokemonPicker, Stepper, TextInput, inputCls, n, s } from '../widgets'
import { AreaBanner } from '@/components/AreaBanner'

const KINDS: EncounterKind[] = ['wild', 'trainer', 'center', 'item', 'casino']
const CARD: Record<EncounterKind, { label: string; color: string }> = {
  wild: { label: 'Wild', color: '#4aa84a' },
  trainer: { label: 'Trainer', color: '#c2452d' },
  center: { label: 'Center', color: '#d44873' },
  item: { label: 'Item', color: '#e8b44a' },
  casino: { label: 'Game Corner', color: '#6b3fa0' },
}

/** A fresh condition of each kind, for the kind picker. */
function newCondition(kind: string, areas: Row[], self: string): UnlockCondition {
  if (kind === 'pokedex') return { kind: 'pokedex', count: 50 }
  if (kind === 'area') return { kind: 'area', areaId: s(areas.find((a) => s(a.id) !== self)?.id) }
  return { kind: 'maxLevel', level: 50 }
}

/** The deck as cards, in kind order — what a shuffle is dealt from. */
function DeckPreview({ deck }: { deck: DeckCounts }) {
  const total = KINDS.reduce((sum, k) => sum + deck[k], 0)
  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`Deck of ${total}: ${KINDS.map((k) => `${deck[k]} ${CARD[k].label}`).join(', ')}`}>
      {KINDS.flatMap((k) =>
        Array.from({ length: deck[k] }, (_, i) => (
          <span
            key={`${k}${i}`}
            className="flex h-10 w-7 items-center justify-center border-2 border-ink font-pixel-sm text-base"
            style={{ background: CARD[k].color, color: textOn(CARD[k].color), borderRadius: 2 }}
            title={CARD[k].label}
          >
            {CARD[k].label[0]}
          </span>
        )),
      )}
    </div>
  )
}

function BossCard({ b, data, onChange, onRemove }: { b: BossDef; data: GameData; onChange: (b: BossDef) => void; onRemove: () => void }) {
  const byTeam = b.teamAvgThreshold != null
  return (
    <div className="flex flex-wrap items-center gap-3 border-2 border-ink bg-parchment p-2">
      <SpriteImg dex={b.dex} size={56} className="border-2 border-ink bg-panel" />
      <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        <PokemonPicker data={data} value={b.dex} onChange={(dex) => onChange({ ...b, dex })} />
        <div className="flex flex-wrap items-center gap-2 text-lg">
          <span>Lv.</span>
          <NumInput className="w-20" value={b.level} min={1} max={100} onChange={(v) => onChange({ ...b, level: v ?? 1 })} />
          <select
            className={cx(inputCls, 'w-auto')}
            value={byTeam ? 'team' : 'gauge'}
            onChange={(e) => {
              if (e.target.value === 'team') return onChange({ ...b, teamAvgThreshold: b.level })
              const { teamAvgThreshold: _drop, ...rest } = b
              onChange(rest)
            }}
          >
            <option value="gauge">appears when the gauge is full</option>
            <option value="team">appears when the team's average level reaches…</option>
          </select>
          {byTeam && (
            <NumInput className="w-20" value={b.teamAvgThreshold ?? 1} min={1} max={100} onChange={(v) => onChange({ ...b, teamAvgThreshold: v ?? 1 })} />
          )}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-lg" title="Dice and combo upgrade level for this legendary; empty = the area's">
          Upgrade level
          <NumInput className="w-20" nullable value={b.upgradeLevel ?? null} min={1} max={10} onChange={(v) => onChange({ ...b, upgradeLevel: v })} />
          <span className="text-sm text-muted">empty = the area's</span>
        </label>
        <label className="flex flex-wrap items-center gap-2 text-lg">
          Battle scene
          <BackgroundPicker value={b.battleBackground} emptyLabel="the area's" onChange={(v) => onChange({ ...b, battleBackground: v })} />
        </label>
      </div>
      <PixelButton size="sm" variant="danger" onClick={onRemove}>
        Remove
      </PixelButton>
    </div>
  )
}

function AreaEditor({ area }: { area: Row }) {
  const data = useAdminData()
  const wild = useAdmin((st) => st.rows.area_wild_pool)
  const tpool = useAdmin((st) => st.rows.area_trainer_pool)
  const lootRows = useAdmin((st) => st.rows.area_loot_pool)
  const trainers = useAdmin((st) => st.rows.trainers)
  const allAreas = useAdmin((st) => st.rows.areas)
  const key = rowKey('areas', area)
  const id = s(area.id)
  const patch = (p: Row) => updateRow('areas', key, p)
  const weights = (area.encounter_weights as Record<EncounterKind, number>) ?? { wild: 0, trainer: 0, center: 0, item: 0, casino: 0 }
  const bosses = (area.legendary_boss as BossDef[] | null) ?? []
  const gyms = (area.gyms as string[] | null) ?? []
  const conditions = (area.unlock_conditions as UnlockCondition[] | null) ?? []
  const wildHere = useMemo(() => wild.filter((w) => w.area_id === id), [wild, id])
  const wildWeight = wildHere.reduce((sum, w) => sum + n(w.weight), 0) || 1
  const tHere = useMemo(() => tpool.filter((t) => t.area_id === id), [tpool, id])
  const tWeight = tHere.reduce((sum, t) => sum + n(t.weight), 0) || 1
  const lootHere = useMemo(() => lootRows.filter((l) => l.area_id === id), [lootRows, id])
  const copiesOf = (l: Row) => lootCopies({ weight: n(l.weight), unique: !!l.unique_find })
  const lootTotal = lootHere.reduce((sum, l) => sum + copiesOf(l), 0) || 1
  if (!data) return null
  const can = { wild: wildHere.length > 0, trainer: tHere.length > 0, item: lootHere.length > 0 }
  const deck = deckCounts(weights, can)
  const deckTotal = deck.wild + deck.trainer + deck.center + deck.item + deck.casino
  const missing: Partial<Record<EncounterKind, string>> = {
    wild: can.wild ? undefined : 'the wild pool is empty',
    trainer: can.trainer ? undefined : 'the trainer pool is empty',
    item: can.item ? undefined : 'there is no loot',
  }
  const setBosses = (next: BossDef[]) => patch({ legendary_boss: next.length ? next : null })
  const lootLabel = (k: string) => (k === 'money' ? '₽ Pokédollars' : (data.items[k]?.name ?? `${k} (unknown item)`))
  const pct = (x: number) => `${(x * 100).toFixed(1)} %`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 2xl:grid-cols-2">
        <Box title="Area">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Field label="Name" className="col-span-2">
              <TextInput value={s(area.name)} onChange={(v) => patch({ name: v })} />
            </Field>
            <Field label="Gauge (XP to clear)" hint="empty = endless">
              <NumInput nullable value={area.xp_to_unlock_next as number | null} onChange={(v) => patch({ xp_to_unlock_next: v })} />
            </Field>
            <Field label="Backtrack ×" hint="rewards once cleared">
              <NumInput step={0.05} value={n(area.backtrack_multiplier)} onChange={(v) => patch({ backtrack_multiplier: v ?? 0 })} />
            </Field>
            <Field label="Min level">
              <NumInput value={n(area.min_level)} onChange={(v) => patch({ min_level: v ?? 1 })} />
            </Field>
            <Field label="Max level">
              <NumInput value={n(area.max_level)} onChange={(v) => patch({ max_level: v ?? 1 })} />
            </Field>
            <Field label="Foe upgrade level" hint={`dice & combos, 1–10 · empty = global (${data.config.enemyUpgradeLevel})`}>
              <NumInput nullable min={1} max={10} value={area.enemy_upgrade_level as number | null} onChange={(v) => patch({ enemy_upgrade_level: v })} />
            </Field>
            <Field label="Battle scene" hint="grass: routes, forests · sea · water: lakes · rock: caves, mountains · default: indoors" className="col-span-2">
              <BackgroundPicker
                value={area.battle_background as BattleBackground | null}
                emptyLabel="default"
                onChange={(v) => patch({ battle_background: v })}
              />
            </Field>
            <Field label="Banner URL (#flip mirrors it)" className="col-span-2">
              <TextInput value={s(area.banner_url)} onChange={(v) => patch({ banner_url: v || null })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <label className="flex items-center gap-2 text-lg" title="Foes use the team's average level, within the ranges below (± scaleLevelSpread when empty)">
              <input type="checkbox" checked={!!area.scales_to_team} onChange={(e) => patch({ scales_to_team: e.target.checked })} /> Scales to team
            </label>
            <label className="flex items-center gap-2 text-lg" title="A Center comes next whenever a team member is K.O.">
              <input type="checkbox" checked={!!area.easy_mode} onChange={(e) => patch({ easy_mode: e.target.checked })} /> Easy (Center after a K.O.)
            </label>
            <label className="flex items-center gap-2 text-lg" title="Hidden areas sit outside the linear chain and open when their conditions hold">
              <input
                type="checkbox"
                checked={!!area.hidden}
                onChange={(e) =>
                  patch({ hidden: e.target.checked, unlock_conditions: e.target.checked ? (area.unlock_conditions ?? [{ kind: 'pokedex', count: 50 }]) : null })
                }
              />
              Secret (unlocks on conditions)
            </label>
          </div>
          {!!area.scales_to_team && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(['wild', 'trainer'] as const).flatMap((kind) =>
                (['min', 'max'] as const).map((end) => {
                  const offsets = (area.scale_offsets as ScaleOffsets | null | undefined) ?? {}
                  const range = offsets[kind] ?? null
                  const set = (v: number | null) => {
                    // A range needs both ends: the first one typed fills the other, empty clears the kind.
                    const other = end === 'min' ? 'max' : 'min'
                    const next = v == null ? null : { ...(range ?? { [other]: v }), [end]: v } as LevelOffsetRange
                    const merged = { ...offsets, [kind]: next }
                    patch({ scale_offsets: merged.wild || merged.trainer ? merged : null })
                  }
                  return (
                    <Field
                      key={`${kind}-${end}`}
                      label={`${kind === 'wild' ? 'Wild' : 'Trainer'} Lv. ${end}`}
                      hint={`vs team average, −15 = 15 below · empty = ±${data.config.scaleLevelSpread}`}
                    >
                      <NumInput nullable min={-99} max={99} value={range?.[end] ?? null} onChange={set} />
                    </Field>
                  )
                }),
              )}
            </div>
          )}
          {!!area.banner_url && (
            <AreaBanner url={s(area.banner_url)} className="h-20 border-2 border-ink" />
          )}
        </Box>

        <Box
          title="Encounter deck"
          hint="Each number is how many copies of that card go in the area's deck. Going through the deck is a round; a new round deals it again, shuffled, and opens with a Pokémon Center when one would help (on top of the Center cards here). Gym battles and legendaries are challenges the player picks, on top of the deck."
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {KINDS.map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-lg leading-none">
                  <span className="inline-block h-4 w-3 border-2 border-ink" style={{ background: CARD[k].color }} aria-hidden />
                  {CARD[k].label}
                </span>
                <Stepper label={`${CARD[k].label} copies`} value={n(weights[k])} max={50} onChange={(v) => patch({ encounter_weights: { ...weights, [k]: v } })} />
                {missing[k] && n(weights[k]) > 0 && <span className="text-sm leading-tight text-danger">not dealt: {missing[k]}</span>}
              </div>
            ))}
          </div>
          <DeckPreview deck={deck} />
          <p className="text-lg">
            {data.config.encounterMode === 'deck' ? (
              <>
                Deck of <b>{deckTotal}</b> card{deckTotal === 1 ? '' : 's'}
                {deck.center ? ` · a Center every ~${Math.round(deckTotal / deck.center)} encounters` : ' · no Center in the deck!'}
              </>
            ) : (
              <>encounterMode is “random”: these numbers are relative weights for independent rolls.</>
            )}
          </p>
        </Box>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <Box
          title="Legendary bosses"
          hint="Fought once, can't be fled. One that flees the catch throw comes back through a 'legend' card in later decks."
          actions={
            <PixelButton size="sm" onClick={() => setBosses([...bosses, { dex: 144, level: Math.max(1, n(area.max_level, 30)) }])}>
              + legendary
            </PixelButton>
          }
        >
          {bosses.length === 0 && <p className="text-lg text-muted">No legendary in this area.</p>}
          {bosses.map((b, i) => (
            <BossCard
              key={i}
              b={b}
              data={data}
              onChange={(nb) => setBosses(bosses.map((x, j) => (j === i ? nb : x)))}
              onRemove={() => setBosses(bosses.filter((_, j) => j !== i))}
            />
          ))}
        </Box>

        <Box
          title="Gym / Elite battles"
          hint="Fought in this order once the gauge is full; the area clears when all are beaten."
          actions={
            <PixelButton
              size="sm"
              onClick={() => {
                const pick = trainers.find((t) => t.role !== 'trainer' && !gyms.includes(s(t.id))) ?? trainers[0]
                if (pick) patch({ gyms: [...gyms, s(pick.id)] })
              }}
            >
              + gym battle
            </PixelButton>
          }
        >
          {gyms.length === 0 && <p className="text-lg text-muted">No gym battle in this area.</p>}
          {gyms.map((gid, i) => {
            const t = data.trainers[gid]
            const type = t ? trainerSpecialty(t, data) : null
            return (
              <div key={`${gid}-${i}`} className="flex flex-wrap items-center gap-2 border-2 border-ink bg-parchment p-2">
                <span className="w-6 text-xl">{i + 1}.</span>
                {t?.spriteUrl && <img src={t.spriteUrl} alt="" width={40} height={40} className="pixelated" style={{ imageRendering: 'pixelated' }} />}
                <SearchSelect
                  className="min-w-[220px] flex-1"
                  options={trainers}
                  value={trainers.find((x) => x.id === gid) ?? null}
                  onChange={(x) => patch({ gyms: gyms.map((y, j) => (j === i ? s(x.id) : y)) })}
                  getKey={(x) => s(x.id)}
                  getLabel={(x) => `${s(x.name)} ${s(x.role)}`}
                  renderOption={(x) => (
                    <span>
                      {s(x.name)}{' '}
                      <span className="text-sm text-muted">
                        ({s(x.role)}
                        {x.badge ? ` · ${s(x.badge)}` : ''})
                      </span>
                    </span>
                  )}
                />
                {type ? <TypeBadge type={type} size="sm" /> : <span className="text-sm text-muted">mixed</span>}
                <span className="flex">
                  {t?.team.map((m, j) => (
                    <SpriteImg key={j} dex={m.dex} size={28} />
                  ))}
                </span>
                <PixelButton size="sm" disabled={i === 0} onClick={() => patch({ gyms: gyms.map((x, j) => (j === i - 1 ? gid : j === i ? gyms[i - 1]! : x)) })} aria-label="Move up">
                  ▲
                </PixelButton>
                <PixelButton
                  size="sm"
                  disabled={i === gyms.length - 1}
                  onClick={() => patch({ gyms: gyms.map((x, j) => (j === i + 1 ? gid : j === i ? gyms[i + 1]! : x)) })}
                  aria-label="Move down"
                >
                  ▼
                </PixelButton>
                <PixelButton size="sm" variant="danger" onClick={() => patch({ gyms: gyms.filter((_, j) => j !== i) })} aria-label="Remove gym battle">
                  ✕
                </PixelButton>
              </div>
            )
          })}
        </Box>
      </div>

      {!!area.hidden && (
        <Box
          title="Unlock conditions"
          hint="All of them must hold for the secret area to appear on the Map."
          actions={
            <PixelButton size="sm" onClick={() => patch({ unlock_conditions: [...conditions, { kind: 'maxLevel', level: 50 }] })}>
              + condition
            </PixelButton>
          }
        >
          {conditions.map((c, i) => {
            const setAt = (next: UnlockCondition) => patch({ unlock_conditions: conditions.map((x, j) => (j !== i ? x : next)) })
            return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className={cx(inputCls, 'w-auto')} value={c.kind} onChange={(e) => setAt(newCondition(e.target.value, allAreas, id))}>
                <option value="pokedex">Pokédex count ≥</option>
                <option value="maxLevel">Highest Pokémon level ≥</option>
                <option value="area">Area reached</option>
              </select>
              {c.kind === 'area' ? (
                <select className={cx(inputCls, 'w-auto')} value={c.areaId} onChange={(e) => setAt({ kind: 'area', areaId: e.target.value })} aria-label="Area">
                  {[...allAreas]
                    .filter((a) => s(a.id) !== id)
                    .sort((a, b) => n(a.order_index) - n(b.order_index))
                    .map((a) => (
                      <option key={s(a.id)} value={s(a.id)}>
                        {s(a.name)}
                      </option>
                    ))}
                </select>
              ) : (
                <NumInput
                  className="w-24"
                  value={c.kind === 'pokedex' ? c.count : c.level}
                  onChange={(v) => setAt(c.kind === 'pokedex' ? { kind: 'pokedex', count: v ?? 1 } : { kind: 'maxLevel', level: v ?? 1 })}
                />
              )}
              <PixelButton size="sm" variant="danger" onClick={() => patch({ unlock_conditions: conditions.filter((_, j) => j !== i) })} aria-label="Remove condition">
                ✕
              </PixelButton>
            </div>
            )
          })}
        </Box>
      )}

      <Box title="Wild pool" hint={`When a Wild card is drawn, one of these is picked by weight. ${deck.wild} Wild card(s) per deck.`}>
        <DataTable
          table="area_wild_pool"
          pageSize={50}
          where={(r) => r.area_id === id}
          newRow={() => ({ id: newUuid(), area_id: id, dex: 16, weight: 10, min_level: n(area.min_level, 1), max_level: n(area.max_level, 5) })}
          duplicate={(r) => ({ ...r, id: newUuid() })}
          columns={[
            {
              key: 'dex',
              label: 'Pokémon',
              width: 260,
              render: (r) => (
                <span className="flex items-center gap-1">
                  <SpriteImg dex={n(r.dex)} size={28} /> {data.species[n(r.dex)]?.name ?? `#${n(r.dex)}`}
                </span>
              ),
              editor: (v, set) => <PokemonPicker data={data} value={n(v)} onChange={(d) => set(d)} />,
            },
            { key: 'weight', label: 'Weight', kind: 'number', width: 90 },
            { key: 'min_level', label: 'Min Lv', kind: 'number', width: 80 },
            { key: 'max_level', label: 'Max Lv', kind: 'number', width: 80 },
            {
              key: 'share',
              label: 'Of wild cards',
              readOnly: true,
              render: (r) => pct(n(r.weight) / wildWeight),
            },
            {
              key: 'chance',
              label: 'Per deck',
              readOnly: true,
              render: (r) => `≈ ${((n(r.weight) / wildWeight) * deck.wild).toFixed(2)}`,
            },
          ]}
        />
      </Box>

      <Box title="Trainer pool" hint={`When a Trainer card is drawn, one of these is picked by weight. ${deck.trainer} Trainer card(s) per deck.`}>
        <DataTable
          table="area_trainer_pool"
          where={(r) => r.area_id === id}
          newRow={() => ({ id: newUuid(), area_id: id, trainer_id: s(trainers[0]?.id), weight: 10 })}
          columns={[
            {
              key: 'trainer_id',
              label: 'Trainer',
              width: 260,
              render: (r) => s(trainers.find((t) => t.id === r.trainer_id)?.name ?? r.trainer_id),
              editor: (v, set) => (
                <SearchSelect
                  options={trainers}
                  value={trainers.find((t) => t.id === v) ?? null}
                  onChange={(t) => set(t.id)}
                  getKey={(t) => s(t.id)}
                  getLabel={(t) => s(t.name)}
                />
              ),
            },
            { key: 'weight', label: 'Weight', kind: 'number', width: 90 },
            { key: 'share', label: 'Of trainer cards', readOnly: true, render: (r) => pct(n(r.weight) / tWeight) },
          ]}
        />
      </Box>

      <Box
        title="Loot (item finds)"
        hint={`Copies = how many cards of that find go in the loot deck (a once-only find counts as one). Loot deck: ${lootHere.length ? lootTotal : 0} cards.`}
      >
        <DataTable
          table="area_loot_pool"
          where={(r) => r.area_id === id}
          newRow={() => ({ id: newUuid(), area_id: id, item_key: 'potion', weight: 1, unique_find: false, min_qty: 1, max_qty: 1 })}
          duplicate={(r) => ({ ...r, id: newUuid() })}
          columns={[
            {
              key: 'item_key',
              label: 'Find',
              width: 220,
              render: (r) => lootLabel(s(r.item_key)),
              editor: (v, set) => (
                <select className={inputCls} value={s(v)} onChange={(e) => set(e.target.value)}>
                  <option value="money">₽ Pokédollars</option>
                  {Object.values(data.items).map((it) => (
                    <option key={it.key} value={it.key}>
                      {it.name}
                    </option>
                  ))}
                </select>
              ),
            },
            { key: 'weight', label: 'Copies', kind: 'number', width: 80 },
            { key: 'min_qty', label: 'Min qty', kind: 'number', width: 80 },
            { key: 'max_qty', label: 'Max qty', kind: 'number', width: 80 },
            { key: 'unique_find', label: 'Once only', kind: 'bool' },
            { key: 'chance', label: 'Per find', readOnly: true, render: (r) => pct(copiesOf(r) / lootTotal) },
          ]}
        />
        <p className="text-base text-muted">
          Min–Max qty is the quantity found (for Pokédollars, the ₽ amount). “Once only” finds leave this area's table after the
          first time.
        </p>
      </Box>
    </div>
  )
}

export function AreasSection() {
  const areas = useAdmin((st) => st.rows.areas)
  const sorted = useMemo(() => [...areas].sort((a, b) => n(a.order_index) - n(b.order_index)), [areas])
  const [selected, setSelected] = useState<string | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const current = sorted.find((a) => a.id === selected) ?? sorted[0]
  const shown = q.trim() ? sorted.filter((a) => s(a.name).toLowerCase().includes(q.trim().toLowerCase())) : sorted

  const reorder = (fromId: string, toId: string) => {
    const ids = sorted.map((a) => s(a.id))
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0 || from === to) return
    ids.splice(to, 0, ids.splice(from, 1)[0]!)
    setTable(
      'areas',
      areas.map((a) => ({ ...a, order_index: ids.indexOf(s(a.id)) + 1 })),
    )
  }
  const move = (areaId: string, d: -1 | 1) => {
    const ids = sorted.map((a) => s(a.id))
    const to = ids[ids.indexOf(areaId) + d]
    if (to) reorder(areaId, to)
  }

  const duplicate = (src: Row) => {
    const id = newUuid()
    const rows = useAdmin.getState().rows
    const copyPool = (t: 'area_wild_pool' | 'area_trainer_pool' | 'area_loot_pool') =>
      addRows(t, rows[t].filter((r) => r.area_id === src.id).map((r) => ({ ...r, id: newUuid(), area_id: id })))
    // Gym battles stay with the original: a trainer gates one area.
    addRows('areas', [{ ...src, id, name: `${s(src.name)} (copy)`, order_index: sorted.length + 1, gyms: [] }])
    copyPool('area_wild_pool')
    copyPool('area_trainer_pool')
    copyPool('area_loot_pool')
    setSelected(id)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <aside className="flex flex-col gap-2 xl:sticky xl:top-16 xl:max-h-[calc(100vh-9rem)]">
        <h2 className="text-3xl">Areas</h2>
        <input className={inputCls} placeholder="Filter areas…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter areas" />
        <p className="text-sm text-muted">The order is the Map order: drag, or use ▲▼.</p>
        <ol className="pixel-scroll flex min-h-0 flex-col gap-1 overflow-y-auto pr-1">
          {shown.map((a) => {
            const aid = s(a.id)
            const w = (a.encounter_weights as Record<EncounterKind, number> | null) ?? { wild: 0, trainer: 0, center: 0, item: 0 }
            const isCurrent = current?.id === a.id
            return (
              <li
                key={aid}
                draggable
                onDragStart={() => setDrag(aid)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drag && reorder(drag, aid)}
                className={cx('flex cursor-grab items-center gap-1 border-2 border-ink p-1', isCurrent ? 'bg-gold' : 'bg-panel hover:bg-white')}
              >
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelected(aid)} aria-current={isCurrent || undefined}>
                  {a.banner_url ? (
                    <AreaBanner url={s(a.banner_url)} className="h-8 !w-14 shrink-0 border border-ink" />
                  ) : (
                    <span className="h-8 w-14 shrink-0 border border-ink bg-parchment" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-lg leading-tight">
                      {n(a.order_index)}. {s(a.name)}
                    </span>
                    <span className="block truncate text-sm leading-tight text-muted">
                      {a.scales_to_team ? 'scales' : `Lv.${n(a.min_level)}–${n(a.max_level)}`} · deck {w.wild}/{w.trainer}/{w.center}/{w.item ?? 0}
                      {a.hidden ? ' · secret' : ''}
                      {a.easy_mode ? ' · easy' : ''}
                    </span>
                  </span>
                </button>
                <span className="flex flex-col">
                  <button type="button" className="px-1 text-xs leading-none" onClick={() => move(aid, -1)} aria-label={`Move ${s(a.name)} up`}>
                    ▲
                  </button>
                  <button type="button" className="px-1 text-xs leading-none" onClick={() => move(aid, 1)} aria-label={`Move ${s(a.name)} down`}>
                    ▼
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          <PixelButton
            size="sm"
            variant="primary"
            onClick={() => {
              const id = newUuid()
              addRows('areas', [
                {
                  id,
                  order_index: sorted.length + 1,
                  name: 'New Area',
                  banner_url: null,
                  xp_to_unlock_next: 100,
                  min_level: 10,
                  max_level: 15,
                  encounter_weights: { wild: 6, trainer: 2, center: 1, item: 1 },
                  backtrack_multiplier: 0.5,
                  legendary_boss: null,
                  scales_to_team: false,
                  easy_mode: false,
                  hidden: false,
                  unlock_conditions: null,
                  gyms: [],
                },
              ])
              setSelected(id)
            }}
          >
            + Add area
          </PixelButton>
          {current && (
            <PixelButton size="sm" onClick={() => duplicate(current)} title="Copies the area and its wild, trainer and loot pools">
              Duplicate
            </PixelButton>
          )}
          {current && (
            <PixelButton
              size="sm"
              variant="danger"
              onClick={() => {
                if (!window.confirm(`Delete ${s(current.name)} and its pools?`)) return
                const pools = useAdmin.getState().rows
                removeRows('area_wild_pool', pools.area_wild_pool.filter((w) => w.area_id === current.id).map((w) => rowKey('area_wild_pool', w)))
                removeRows('area_trainer_pool', pools.area_trainer_pool.filter((w) => w.area_id === current.id).map((w) => rowKey('area_trainer_pool', w)))
                removeRows('area_loot_pool', pools.area_loot_pool.filter((w) => w.area_id === current.id).map((w) => rowKey('area_loot_pool', w)))
                removeRows('areas', [rowKey('areas', current)])
                setSelected(null)
              }}
            >
              Delete
            </PixelButton>
          )}
        </div>
      </aside>
      <div className="min-w-0">
        {current ? (
          <>
            <h2 className="mb-3 text-4xl leading-none">
              {n(current.order_index)}. {s(current.name)}
            </h2>
            <AreaEditor key={s(current.id)} area={current} />
          </>
        ) : (
          <p>No areas.</p>
        )}
      </div>
    </div>
  )
}
