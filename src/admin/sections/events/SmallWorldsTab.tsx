// Admin → Events → Small worlds (docs/21): a time-limited, themed region of its own where a shiny mythical is won. One
// game_config row, `smallWorlds` (the switch and the list); one world runs at a time. A world is edited as a draft and
// goes into the list only when nothing is wrong with it. Its region and its areas are rows of their own: this tab makes
// the region, adds or copies areas into it and sets their opening dates; the areas' pools, trainers and pictures are
// edited in Areas (and Trainers), like any region's.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  POKE_TYPES,
  PREVIEW_HOURS,
  PREVIEW_HOURS_MAX,
  isWorldRegion,
  newSmallWorld,
  normaliseWorld,
  previewWindow,
  realRegions,
  regionAreas,
  sellPrice,
  worldPrize,
  worldProblems,
  worldState,
  type GameData,
  type PokeType,
  type SmallWorld,
  type WorldBooster,
  type WorldShopItem,
} from '@/engine'
import type { Row } from '@/config/mapping'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelButton } from '@/components/PixelButton'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { LANGS } from '@/i18n/langs'
import { money } from '@/lib/format'
import { WorldSquareView } from '@/screens/events/world'
import { WorldPreviewSquareView } from '@/screens/events/worldPreview'
import { useNow } from '@/store/hooks'
import { cx } from '@/theme/util'
import { addRows, newUuid, rowKey, updateRow, useAdmin, useAdminData } from '../../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, TextInput, TypePicker, inputCls, n, s } from '../../widgets'
import { useConfigRow } from '../ConfigSection'
import { EVENT_BANNERS } from '../EventsSection'

const STATE_CLS = { live: 'bg-good text-white', scheduled: 'bg-[#2f4f8f] text-white', ended: 'bg-shadow text-muted' }
const HOUR = 3_600_000
const DAY = 24 * HOUR
/** A world's region shows no real Pokédex page: its range sits past every species (and every form's number). */
export const WORLD_DEX_RANGE: [number, number] = [99999, 99999]

/** An ISO time as a datetime-local value, read as UTC ("2026-10-12T18:00"), and back. */
const toInput = (iso: string | undefined) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 16) : '')
const fromInput = (v: string) => {
  const ms = Date.parse(`${v}:00Z`)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
const yourTime = (iso: string) =>
  Number.isFinite(Date.parse(iso))
    ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
const utc = (iso: string) => (Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—')
function duration(ms: number): string {
  const h = Math.round(ms / HOUR)
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`
}
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `world-${Date.now().toString(36)}`)

/** The world's name in the admin: its English title, else its region's name. */
const titleOf = (w: SmallWorld, data: GameData | null) =>
  w.title.en?.trim() || data?.regions.find((r) => r.id === w.regionId)?.name || 'Small world'

/** A new area row (the Areas section's "+ Add area", in a region). */
function blankArea(id: string, regionId: string, name: string, order: number): Row {
  return {
    id,
    order_index: order,
    region_id: regionId,
    name,
    banner_url: null,
    rounds_to_clear: 1,
    min_level: 5,
    max_level: 10,
    encounter_weights: { wild: 6, trainer: 2, center: 1, item: 1 },
    backtrack_multiplier: 0.5,
    legendary_boss: null,
    scales_to_team: false,
    easy_mode: false,
    hidden: false,
    unlock_conditions: null,
    gyms: [],
  }
}

const nextAreaOrder = () => Math.max(0, ...useAdmin.getState().rows.areas.map((a) => n(a.order_index))) + 1

/**
 * Makes a world's region row and its first area. The region is switched off as a region (`enabled: false`): it is
 * never a step of the journey, and if the world is ever deleted it stays out of sight; the world opens it.
 */
function createWorldRegion(name: string, starters: number[]): string {
  const { regions } = useAdmin.getState().rows
  const slug =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'world'
  let id = `world-${slug}`
  for (let i = 2; regions.some((r) => r.id === id); i++) id = `world-${slug}-${i}`
  const areaId = newUuid()
  addRows('regions', [
    {
      id,
      name,
      order_index: Math.max(0, ...regions.map((r) => n(r.order_index))) + 1,
      dex_range: WORLD_DEX_RANGE,
      starters: starters.length ? starters : [1],
      starter_level: 5,
      league_area_id: areaId,
      next_region: null,
      enabled: false,
    },
  ])
  addRows('areas', [blankArea(areaId, id, `${name} 1`, nextAreaOrder())])
  return id
}

/** Copies an area and its wild, trainer and loot pools into a world's region (no legendary, gym or secret rule). */
function copyAreaInto(srcId: string, regionId: string): string | null {
  const rows = useAdmin.getState().rows
  const src = rows.areas.find((a) => a.id === srcId)
  if (!src) return null
  const id = newUuid()
  addRows('areas', [
    { ...src, id, region_id: regionId, order_index: nextAreaOrder(), legendary_boss: null, gyms: [], hidden: false, unlock_conditions: null },
  ])
  for (const t of ['area_wild_pool', 'area_trainer_pool', 'area_loot_pool'] as const)
    addRows(t, rows[t].filter((r) => r.area_id === srcId).map((r) => ({ ...r, id: newUuid(), area_id: id })))
  return id
}

export function SmallWorldsTab() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('smallWorlds')
  const list = useMemo(() => (raw?.list ?? []).map((w) => normaliseWorld(w)), [raw])
  const now = useNow(30_000)
  const [draft, setDraft] = useState<SmallWorld | null>(null)
  const access = raw?.access ?? 'off'
  const previewAccess = raw?.previewAccess ?? 'off'
  const write = (next: SmallWorld[]) => setRaw({ ...raw, access, list: next })
  const problems = draft && data ? worldProblems(list, draft, data) : []
  const isNew = !!draft && !list.some((w) => w.id === draft.id)
  const apply = () => {
    if (!draft || problems.length) return
    write(isNew ? [...list, draft] : list.map((w) => (w.id === draft.id ? draft : w)))
    setDraft(null)
  }
  const sorted = [...list].sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
  const start = () => {
    // The next round hour, for ten days, after the last world if that ends later.
    const last = Math.max(now, ...list.map((w) => Date.parse(w.end)).filter(Number.isFinite))
    const st = Math.ceil(last / HOUR) * HOUR
    setDraft(newSmallWorld(newId(), '', new Date(st).toISOString(), new Date(st + 10 * DAY).toISOString()))
  }
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Small worlds"
        icon="map"
        hint="A region of its own for a while, where a shiny mythical is won: a fresh start on one of three partners, its own areas, Mart and rules, and the mythical at the end. One at a time, between its start and end (UTC, the server's clock). When it ends, its Pokémon go home, each to its species' region, locked there until the player's best reaches its level; its items and ₽ are gone (the mythical went home when caught). Off hides it (players inside are sent out with their place kept); only its end, or End now, closes it. Save & Publish to send a change."
        actions={
          <PixelButton size="sm" variant="primary" onClick={start} disabled={!!draft}>
            New small world
          </PixelButton>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl">Who sees them</span>
          <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, list: raw?.list ?? [], access: a })} label="Small worlds: who sees them" />
          <span className="text-base text-muted">
            {access === 'off'
              ? 'None opens, whatever the list says (worlds already entered wait, kept).'
              : access === 'admin'
                ? 'Only you, signed in as admin, see them.'
                : 'Every player of the main save sees them, from the badges set (not the Extreme save).'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl">Preview on Home</span>
          <AccessSwitch
            value={previewAccess}
            onChange={(a) => setRaw({ ...raw, list: raw?.list ?? [], access, previewAccess: a })}
            label="Small worlds' preview: who sees it"
          />
          <span className="text-base text-muted">
            {previewAccess === 'off'
              ? 'No preview: a world shows up on Home when it starts.'
              : `Before a world starts (its "Preview" hours, 48 by default), Home shows it greyed in its slot with a countdown, ${
                  previewAccess === 'admin' ? 'to you alone, signed in as admin' : 'to everyone who will see the world'
                }. It needs the worlds' own switch on as well.`}
          </span>
        </div>
        {sorted.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-lg">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-2 py-1 font-normal">World</th>
                  <th className="px-2 py-1 font-normal">Starts (UTC)</th>
                  <th className="px-2 py-1 font-normal">Ends (UTC)</th>
                  <th className="px-2 py-1 font-normal">State</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((w) => {
                  const st = worldState(w, now)
                  const areas = data ? regionAreas(data, w.regionId).length : 0
                  return (
                    <tr key={w.id} className={cx('border-t-2 border-line', draft?.id === w.id && 'bg-gold-pale')}>
                      <td className="px-2 py-1">
                        <div className="leading-none">{titleOf(w, data)}</div>
                        <div className="text-base text-muted">
                          shiny {(data && data.species[worldPrize(data, w)?.dex ?? 0]?.name) ?? '?'} · {areas} area{areas === 1 ? '' : 's'} · from {w.minBadges} badges
                        </div>
                      </td>
                      <td className="px-2 py-1 font-mono text-base">{utc(w.start)}</td>
                      <td className="px-2 py-1 font-mono text-base">{utc(w.end)}</td>
                      <td className="px-2 py-1">
                        <span className={cx('px-1.5 py-0.5 text-base', STATE_CLS[st])}>{st}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right">
                        <span className="inline-flex gap-1">
                          <PixelButton size="sm" disabled={!!draft} onClick={() => setDraft(w)}>
                            Edit
                          </PixelButton>
                          {st === 'live' && (
                            <PixelButton
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`End “${titleOf(w, data)}” now, for everyone? It closes: its Pokémon go home locked by level, the rest is gone. (Then Save & Publish.)`))
                                  write(list.map((x) => (x.id === w.id ? { ...x, end: new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString() } : x)))
                              }}
                            >
                              End now
                            </PixelButton>
                          )}
                          <PixelButton
                            size="sm"
                            disabled={!!draft}
                            onClick={() => {
                              if (window.confirm(`Delete “${titleOf(w, data)}” from the list? Players who still hold it lose it (it closes for them); its region and areas stay, hidden.`))
                                write(list.filter((x) => x.id !== w.id))
                            }}
                          >
                            Delete
                          </PixelButton>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-lg text-muted">No small world yet.</p>
        )}
      </Box>
      {draft && data && (
        <WorldEditor draft={draft} set={setDraft} data={data} problems={problems} isNew={isNew} onApply={apply} onCancel={() => setDraft(null)} />
      )}
    </div>
  )
}

function WorldEditor({
  draft,
  set,
  data,
  problems,
  isNew,
  onApply,
  onCancel,
}: {
  draft: SmallWorld
  set: (w: SmallWorld) => void
  data: GameData
  problems: string[]
  isNew: boolean
  onApply: () => void
  onCancel: () => void
}) {
  const patch = (p: Partial<SmallWorld>) => set({ ...draft, ...p })
  const pictures = [...EVENT_BANNERS, ...Object.keys(ART_GEOMETRY).sort()]
  const span = Date.parse(draft.end) - Date.parse(draft.start)
  return (
    <Box
      title={`${isNew ? 'New' : 'Edit'} · ${titleOf(draft, data)}`}
      icon="gear"
      hint="Nothing changes in the list until you apply it; the list, the region and the areas reach players with Save & Publish."
      actions={
        <>
          <PixelButton size="sm" onClick={onCancel}>
            Cancel
          </PixelButton>
          <PixelButton size="sm" variant="primary" disabled={problems.length > 0} onClick={onApply}>
            {isNew ? 'Add to the list' : 'Apply'}
          </PixelButton>
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid content-start gap-2 sm:grid-cols-3">
          <Field label="Title (English)" hint="Empty = the region's name. Other languages below." className="sm:col-span-2">
            <input className={inputCls} maxLength={24} value={draft.title.en ?? ''} onChange={(e) => patch({ title: { ...draft.title, en: e.target.value } })} />
          </Field>
          <Field label="Picture" hint="Home's square, the pop-ups, the Mart.">
            <select className={inputCls} value={draft.banner} onChange={(e) => patch({ banner: e.target.value })}>
              <option value="">— pick one —</option>
              {!pictures.includes(draft.banner) && draft.banner && <option value={draft.banner}>{draft.banner}</option>}
              {pictures.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starts (UTC)" hint={`${yourTime(draft.start)} your time`}>
            <input
              type="datetime-local"
              className={inputCls}
              value={toInput(draft.start)}
              onChange={(e) => {
                const iso = fromInput(e.target.value)
                if (iso) patch({ start: iso })
              }}
            />
          </Field>
          <Field label="Ends (UTC)" hint={`${yourTime(draft.end)} your time${span > 0 ? ` · lasts ${duration(span)}` : ''}`}>
            <input
              type="datetime-local"
              className={inputCls}
              value={toInput(draft.end)}
              onChange={(e) => {
                const iso = fromInput(e.target.value)
                if (iso) patch({ end: iso })
              }}
            />
          </Field>
          <Field label="Preview (hours before)" hint="Home shows it greyed, with a countdown, this long before it starts. 0 = none.">
            <NumInput
              value={draft.previewHours}
              min={0}
              max={PREVIEW_HOURS_MAX}
              onChange={(v) => patch({ previewHours: Math.min(PREVIEW_HOURS_MAX, Math.max(0, Math.floor(v ?? PREVIEW_HOURS))) })}
            />
          </Field>
          <Field label="Shown from (badges)" hint="Every region's counted.">
            <NumInput value={draft.minBadges} min={0} max={80} onChange={(v) => patch({ minBadges: Math.max(0, v ?? 0) })} />
          </Field>
          <Field label="XP ×" hint="Every XP earned in the world, Multi EXP too.">
            <NumInput value={draft.xpMultiplier} min={0.5} max={50} step={0.5} onChange={(v) => patch({ xpMultiplier: Math.max(0.5, v ?? 1) })} />
          </Field>
          <Field label="Main colour">
            <input type="color" className="h-[34px] w-full border-2 border-edge" value={draft.theme.main} onChange={(e) => patch({ theme: { ...draft.theme, main: e.target.value } })} />
          </Field>
          <Field label="Accent">
            <input type="color" className="h-[34px] w-full border-2 border-edge" value={draft.theme.accent} onChange={(e) => patch({ theme: { ...draft.theme, accent: e.target.value } })} />
          </Field>
          <Field label="Ground tint">
            <input type="color" className="h-[34px] w-full border-2 border-edge" value={draft.theme.ground} onChange={(e) => patch({ theme: { ...draft.theme, ground: e.target.value } })} />
          </Field>
        </div>
        <SquarePreview w={draft} data={data} />
      </div>
      <details className="border-t-2 border-line pt-2">
        <summary className="cursor-pointer text-lg">Title in other languages (optional)</summary>
        <p className="text-base text-muted">A language left empty shows the English one.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {LANGS.filter((l) => l !== 'en').map((l) => (
            <Field key={l} label={l}>
              <input className={inputCls} maxLength={24} value={draft.title[l] ?? ''} onChange={(e) => patch({ title: { ...draft.title, [l]: e.target.value } })} />
            </Field>
          ))}
        </div>
      </details>
      <RegionPanel draft={draft} set={set} data={data} />
      <div className="grid gap-3 border-t-2 border-line pt-2 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <h4 className="m-0 text-xl">The three partners</h4>
          <p className="m-0 text-base text-muted">The fresh start: one of these, at the region's starter level.</p>
          {[0, 1, 2].map((i) => (
            <PokemonPicker
              key={i}
              data={data}
              value={draft.starters[i] ?? null}
              onChange={(dex) => {
                const next = [...draft.starters]
                next[i] = dex
                patch({ starters: next.filter((d) => d != null) })
              }}
            />
          ))}
        </div>
        <MythicalPanel draft={draft} patch={patch} data={data} />
      </div>
      <div className="grid gap-3 border-t-2 border-line pt-2 lg:grid-cols-2">
        <BoostersEditor boosters={draft.boosters} set={(boosters) => patch({ boosters })} />
        <WorldShopEditor items={draft.shop} set={(shop) => patch({ shop })} data={data} />
      </div>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-lg text-danger" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </Box>
  )
}

/**
 * How Home's square looks in these colours: the game's own square (players see it first among the events), and its
 * preview before the start (halfway through the preview's window), when it has one.
 */
function SquarePreview({ w, data }: { w: SmallWorld; data: GameData }) {
  const total = regionAreas(data, w.regionId).length
  const halfway = Date.parse(w.start) - previewWindow(w) / 2
  return (
    <div className="grid content-start gap-1">
      <span className="text-base text-muted">Home's square</span>
      <WorldSquareView world={w} now={Math.min(Date.now(), Date.parse(w.end))} cleared={0} total={total} partner={null} caught={false} onClick={() => {}} />
      {previewWindow(w) > 0 && Number.isFinite(halfway) && (
        <>
          <span className="text-base text-muted">Its preview, {w.previewHours} h before</span>
          <WorldPreviewSquareView world={w} now={halfway} onClick={() => {}} />
        </>
      )}
    </div>
  )
}

/** The world's region: pick one, or make it here (with a first area), then its areas, their dates and the way to edit them. */
function RegionPanel({ draft, set, data }: { draft: SmallWorld; set: (w: SmallWorld) => void; data: GameData }) {
  const regionRows = useAdmin((st) => st.rows.regions)
  const row = regionRows.find((r) => r.id === draft.regionId)
  const [name, setName] = useState(draft.title.en ?? '')
  const [copyFrom, setCopyFrom] = useState('')
  // Regions that can be a world's: never a real one of the journey (Kanto, Johto…), unless it's already this world's.
  const real = new Set(realRegions(data).map((r) => r.id))
  const choices = data.regions.filter((r) => r.id === draft.regionId || isWorldRegion(data, r.id) || !real.has(r.id) || !r.enabled)
  const areas = draft.regionId ? regionAreas(data, draft.regionId) : []
  const allAreas = [...data.areas].sort((a, b) => (a.regionId ?? '').localeCompare(b.regionId ?? '') || a.orderIndex - b.orderIndex)
  const setOpens = (areaId: string, iso: string | null) => {
    const opens = { ...draft.opens }
    if (iso) opens[areaId] = iso
    else delete opens[areaId]
    set({ ...draft, opens })
  }
  return (
    <div className="grid gap-2 border-t-2 border-line pt-2">
      <h4 className="m-0 text-xl">The world's region and areas</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Region" hint="Its areas point at it, like any region's.">
          <select className={inputCls} value={draft.regionId} onChange={(e) => set({ ...draft, regionId: e.target.value })}>
            <option value="">— pick one, or make it —</option>
            {choices.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.id})
              </option>
            ))}
          </select>
        </Field>
        {row ? (
          <>
            <Field label="Region name" hint="Shown when the title is empty.">
              <TextInput value={s(row.name)} onChange={(v) => updateRow('regions', rowKey('regions', row), { name: v })} />
            </Field>
            <Field label="Partners' level">
              <NumInput value={n(row.starter_level, 5)} min={1} max={100} onChange={(v) => updateRow('regions', rowKey('regions', row), { starter_level: Math.max(1, v ?? 5) })} />
            </Field>
          </>
        ) : (
          <Field label="Make its region" hint="A region row of its own (no Pokédex range of a real region, out of the journey) and a first area." className="sm:col-span-2">
            <span className="flex gap-2">
              <input className={inputCls} placeholder="Its name, e.g. Mirage Island" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
              <PixelButton
                size="sm"
                variant="primary"
                disabled={!name.trim()}
                onClick={() => {
                  const id = createWorldRegion(name.trim(), draft.starters)
                  set({ ...draft, regionId: id, title: draft.title.en?.trim() ? draft.title : { ...draft.title, en: name.trim() } })
                }}
              >
                Make it
              </PixelButton>
            </span>
          </Field>
        )}
      </div>
      {draft.regionId && (
        <>
          {areas.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-lg">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="px-1 font-normal">Area (in order)</th>
                    <th className="px-1 font-normal">Levels</th>
                    <th className="px-1 font-normal">Opens (UTC), as well as after the one before</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {areas.map((a, i) => (
                    <tr key={a.id} className="border-t-2 border-line">
                      <td className="px-1 py-1">
                        {i + 1}. {a.name}
                        {a.id === draft.mythical.areaId && <span className="ml-1 bg-gold px-1 text-base">the mythical</span>}
                      </td>
                      <td className="px-1 py-1 text-base">
                        {a.scalesToTeam ? 'scales' : `Lv.${a.minLevel}–${a.maxLevel}`} · {a.roundsToClear ?? '∞'} round{a.roundsToClear === 1 ? '' : 's'}
                      </td>
                      <td className="px-1 py-1">
                        <span className="flex items-center gap-1">
                          <input
                            type="datetime-local"
                            className={cx(inputCls, 'w-auto')}
                            aria-label={`${a.name} opens (UTC)`}
                            value={toInput(draft.opens[a.id])}
                            onChange={(e) => setOpens(a.id, fromInput(e.target.value))}
                          />
                          {draft.opens[a.id] && (
                            <button type="button" className="px-1 text-lg" aria-label={`${a.name}: no date`} onClick={() => setOpens(a.id, null)}>
                              ✕
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="px-1 py-1 text-right">
                        <Link className="text-lg underline" to={`/admin/areas?area=${a.id}`}>
                          Edit in Areas
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-lg text-muted">No area in this region yet.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <PixelButton size="sm" onClick={() => addRows('areas', [blankArea(newUuid(), draft.regionId, `${titleOf(draft, data)} ${areas.length + 1}`, nextAreaOrder())])}>
              + New area in this world
            </PixelButton>
            <select className={cx(inputCls, 'w-auto max-w-[320px]')} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="An area to copy into this world">
              <option value="">Copy an area into this world…</option>
              {allAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.regionId ?? 'kanto').toUpperCase()} · {a.name}
                </option>
              ))}
            </select>
            <PixelButton
              size="sm"
              disabled={!copyFrom}
              onClick={() => {
                copyAreaInto(copyFrom, draft.regionId)
                setCopyFrom('')
              }}
            >
              Copy
            </PixelButton>
          </div>
          <p className="m-0 text-base text-muted">
            A copy brings its wild, trainer and loot pools (no legendary, gym or secret rule). Pools, trainers, pictures and
            rounds are edited in Areas and Trainers; the order is the Areas order. The world's own trainers go in its areas'
            trainer pools, or as gyms.
          </p>
        </>
      )}
    </div>
  )
}

function MythicalPanel({ draft, patch, data }: { draft: SmallWorld; patch: (p: Partial<SmallWorld>) => void; data: GameData }) {
  const m = draft.mythical
  const areas = draft.regionId ? regionAreas(data, draft.regionId) : []
  return (
    <div className="grid content-start gap-2">
      <h4 className="m-0 text-xl">The shiny mythical (optional)</h4>
      <p className="m-0 text-base text-muted">
        The last fight: the boss of its area, always shiny. Win, then catch it; a miss and it waits there, until the world
        closes. Caught, it goes to its home region's Box at once ({m.dex ? 'by its generation' : 'Mew → Kanto, Celebi → Johto…'}).
        Leave it empty when the world's prizes are its own bosses and raids marked Shiny in Areas (docs/26).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PokemonPicker data={data} value={m.dex || null} onChange={(dex) => patch({ mythical: { ...m, dex } })} />
        {!!m.dex && (
          <PixelButton size="sm" onClick={() => patch({ mythical: { ...m, dex: 0, areaId: '' } })}>
            No mythical
          </PixelButton>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Its level">
          <NumInput value={m.level} min={1} max={data.config.maxLevel} onChange={(v) => patch({ mythical: { ...m, level: Math.max(1, v ?? 1) } })} />
        </Field>
        <Field label="Its area" hint="Usually the world's last.">
          <select className={inputCls} value={m.areaId} onChange={(e) => patch({ mythical: { ...m, areaId: e.target.value } })}>
            <option value="">— pick one —</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  )
}

function BoostersEditor({ boosters, set }: { boosters: WorldBooster[]; set: (b: WorldBooster[]) => void }) {
  const row = (i: number, p: Partial<WorldBooster>) => set(boosters.map((b, j) => (j === i ? { ...b, ...p } : b)))
  const free = POKE_TYPES.find((t) => !boosters.some((b) => b.type === t)) ?? 'fire'
  return (
    <div className="grid content-start gap-2">
      <h4 className="m-0 text-xl">Booster types</h4>
      <p className="m-0 text-base text-muted">Every hit of these types does × more damage, the player's and the foes'. Shown in battle and on the world's banner.</p>
      {boosters.map((b, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_100px_auto] items-center gap-2">
          <TypePicker value={b.type} onChange={(t) => t && t !== 'base' && row(i, { type: t as PokeType })} />
          <NumInput value={b.multiplier} min={0.25} max={5} step={0.25} onChange={(v) => row(i, { multiplier: Math.max(0.25, v ?? 1) })} />
          <PixelButton size="sm" onClick={() => set(boosters.filter((_, j) => j !== i))} aria-label={`Remove the ${b.type} booster`}>
            ✕
          </PixelButton>
        </div>
      ))}
      <div>
        <PixelButton size="sm" onClick={() => set([...boosters, { type: free, multiplier: 1.5 }])}>
          Add a booster
        </PixelButton>
      </div>
    </div>
  )
}

function WorldShopEditor({ items, set, data }: { items: WorldShopItem[]; set: (items: WorldShopItem[]) => void; data: GameData }) {
  const all = Object.values(data.items).sort((a, b) => a.name.localeCompare(b.name))
  const row = (i: number, p: Partial<WorldShopItem>) => set(items.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <div className="grid content-start gap-2">
      <h4 className="m-0 text-xl">The world's Mart</h4>
      <p className="m-0 text-base text-muted">It sells these and nothing else, for the world's own ₽ (from ₽0). Empty limit = no limit.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-1 font-normal">Item</th>
              <th className="px-1 font-normal">Price</th>
              <th className="px-1 font-normal">Limit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => {
              const it = data.items[r.key]
              const floor = sellPrice(it)
              return (
                <tr key={i} className="border-t-2 border-line align-top">
                  <td className="px-1 py-1">
                    <span className="flex items-center gap-1">
                      <ItemSprite item={it} size={24} />
                      <select className={inputCls} value={r.key} onChange={(e) => row(i, { key: e.target.value })}>
                        {!it && <option value={r.key}>{r.key}</option>}
                        {all.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </td>
                  <td className="w-28 px-1 py-1">
                    <NumInput value={r.price} min={1} onChange={(v) => row(i, { price: Math.max(1, v ?? 1) })} />
                    {r.price < floor && <div className="text-sm text-danger">Below the buy-back {money(floor)}: sold at {money(floor)}</div>}
                  </td>
                  <td className="w-24 px-1 py-1">
                    <NumInput value={r.limit} min={1} nullable onChange={(v) => row(i, { limit: v == null ? null : Math.max(1, v) })} />
                  </td>
                  <td className="px-1 py-1">
                    <PixelButton size="sm" onClick={() => set(items.filter((_, j) => j !== i))} aria-label={`Remove ${it?.name ?? r.key}`}>
                      ✕
                    </PixelButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div>
        <PixelButton size="sm" onClick={() => set([...items, { key: 'great-ball', price: data.items['great-ball']?.price ?? 60, limit: null }])}>
          Add an item
        </PixelButton>
      </div>
    </div>
  )
}
