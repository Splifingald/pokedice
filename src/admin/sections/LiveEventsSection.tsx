// Admin → Live events (docs/20): what changes the whole game for a while, the same for everyone — a Shiny Parade, a
// Special Shop or Cash Flow. One game_config row, `liveEvents`; one event runs at a time. An event is edited as a
// draft and goes into the list only when nothing is wrong with it (an overlap is refused); Save & Publish sends it.
import { useMemo, useState } from 'react'
import {
  LIVE_TYPES,
  enabledRegions,
  liveProblems,
  liveState,
  newLiveEvent,
  normaliseLiveEvent,
  sellPrice,
  type GameData,
  type LiveEvent,
  type LiveShopItem,
  type LiveType,
  type RegionId,
} from '@/engine'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { LANGS } from '@/i18n/langs'
import { money } from '@/lib/format'
import { bannerUrl } from '@/screens/events/shared'
import { useNow } from '@/store/hooks'
import { cx } from '@/theme/util'
import { PixelButton } from '@/components/PixelButton'
import { useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'
import { EVENT_BANNERS } from './EventsSection'

const TYPE_NAME: Record<LiveType, string> = { shiny: 'Shiny Parade', shop: 'Special Shop', cash: 'Cash Flow' }
const STATE_CLS = { live: 'bg-good text-white', scheduled: 'bg-[#2f4f8f] text-white', ended: 'bg-shadow text-muted' }
const HOUR = 3_600_000

/** An ISO time as a datetime-local value, read as UTC ("2026-10-12T18:00"), and back. */
const toInput = (iso: string) => (Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 16) : '')
const fromInput = (v: string) => {
  const ms = Date.parse(`${v}:00Z`)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
const yourTime = (iso: string) =>
  Number.isFinite(Date.parse(iso))
    ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
const utc = (iso: string) => (Number.isFinite(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')}` : '—')
function duration(ms: number): string {
  const h = Math.round(ms / HOUR)
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`
}
const titleOf = (e: LiveEvent) => e.title.en?.trim() || TYPE_NAME[e.type]
const pct = (m: number) => Math.round((m - 1) * 100)

function summary(e: LiveEvent, data: GameData | null): string {
  if (e.type === 'cash') return `+${pct(e.cash.multiplier)} % on every ₽ earned`
  if (e.type === 'shop') return `${e.shop.items.length} item${e.shop.items.length === 1 ? '' : 's'}`
  const s = e.shiny
  const where =
    s.scope === 'all'
      ? 'everywhere'
      : s.scope === 'region'
        ? `in ${data?.regions.find((r) => r.id === s.regionId)?.name ?? s.regionId ?? '?'}`
        : `in ${s.areaIds.length} area${s.areaIds.length === 1 ? '' : 's'}`
  return `wild shiny ×${s.multiplier} ${where}`
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `live-${Date.now().toString(36)}`)

export function LiveEventsSection() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('liveEvents')
  const list = useMemo(() => (raw?.list ?? []).map((e) => normaliseLiveEvent(e)), [raw])
  const now = useNow(30_000)
  const [draft, setDraft] = useState<LiveEvent | null>(null)
  const access = raw?.access ?? 'off'
  const write = (next: LiveEvent[]) => setRaw({ ...raw, access, list: next })
  const problems = draft && data ? liveProblems(list, draft, data) : []
  const isNew = !!draft && !list.some((e) => e.id === draft.id)
  const apply = () => {
    if (!draft || problems.length) return
    write(isNew ? [...list, draft] : list.map((e) => (e.id === draft.id ? draft : e)))
    setDraft(null)
  }
  const sorted = [...list].sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
  const start = () => {
    // The next round hour, for three days, after the last one scheduled if that's later.
    const last = Math.max(now, ...list.map((e) => Date.parse(e.end)).filter(Number.isFinite))
    const s = Math.ceil(last / HOUR) * HOUR
    setDraft(newLiveEvent(newId(), new Date(s).toISOString(), new Date(s + 72 * HOUR).toISOString()))
  }
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Live events"
        icon="sparkle"
        hint="They change the whole game for a while, the same for everyone, between their start and end (UTC, the server's clock). One at a time. Players see a square on Home and a pop-up once, from the badges set. Save & Publish to send a change; a game picks it up on its next load (Reload all players for right now)."
        actions={
          <PixelButton size="sm" variant="primary" onClick={start} disabled={!!draft}>
            New live event
          </PixelButton>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl">Who sees them</span>
          <AccessSwitch value={access} onChange={(a) => setRaw({ list: raw?.list ?? [], access: a })} label="Live events: who sees them" />
          <span className="text-base text-muted">
            {access === 'off'
              ? 'None runs, whatever the list says.'
              : access === 'admin'
                ? 'Only you, signed in as admin, see them.'
                : 'Every player sees them.'}
          </span>
        </div>
        {sorted.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-lg">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-2 py-1 font-normal">Event</th>
                  <th className="px-2 py-1 font-normal">Starts (UTC)</th>
                  <th className="px-2 py-1 font-normal">Ends (UTC)</th>
                  <th className="px-2 py-1 font-normal">State</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => {
                  const st = liveState(e, now)
                  return (
                    <tr key={e.id} className={cx('border-t-2 border-line', draft?.id === e.id && 'bg-gold-pale')}>
                      <td className="px-2 py-1">
                        <div className="leading-none">{titleOf(e)}</div>
                        <div className="text-base text-muted">
                          {TYPE_NAME[e.type]} · {summary(e, data)} · from {e.minBadges} badges
                        </div>
                      </td>
                      <td className="px-2 py-1 font-mono text-base">{utc(e.start)}</td>
                      <td className="px-2 py-1 font-mono text-base">{utc(e.end)}</td>
                      <td className="px-2 py-1">
                        <span className={cx('px-1.5 py-0.5 text-base', STATE_CLS[st])}>{st}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right">
                        <span className="inline-flex gap-1">
                          <PixelButton size="sm" disabled={!!draft} onClick={() => setDraft(e)}>
                            Edit
                          </PixelButton>
                          {st === 'live' && (
                            <PixelButton
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`End “${titleOf(e)}” now, for everyone? (Then Save & Publish.)`))
                                  write(list.map((x) => (x.id === e.id ? { ...x, end: new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString() } : x)))
                              }}
                            >
                              End now
                            </PixelButton>
                          )}
                          <PixelButton
                            size="sm"
                            disabled={!!draft}
                            onClick={() => {
                              if (window.confirm(`Delete “${titleOf(e)}”? Players who bought from it keep what they bought.`))
                                write(list.filter((x) => x.id !== e.id))
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
          <p className="text-lg text-muted">No live event yet.</p>
        )}
      </Box>
      {draft && data && (
        <LiveEditor
          draft={draft}
          set={setDraft}
          data={data}
          problems={problems}
          isNew={isNew}
          onApply={apply}
          onCancel={() => setDraft(null)}
        />
      )}
    </div>
  )
}

function LiveEditor({
  draft,
  set,
  data,
  problems,
  isNew,
  onApply,
  onCancel,
}: {
  draft: LiveEvent
  set: (e: LiveEvent) => void
  data: GameData
  problems: string[]
  isNew: boolean
  onApply: () => void
  onCancel: () => void
}) {
  const patch = (p: Partial<LiveEvent>) => set({ ...draft, ...p })
  const pictures = [...EVENT_BANNERS, ...Object.keys(ART_GEOMETRY).sort()]
  const span = Date.parse(draft.end) - Date.parse(draft.start)
  return (
    <Box
      title={`${isNew ? 'New' : 'Edit'} · ${titleOf(draft)}`}
      icon="gear"
      hint="Nothing changes in the list until you apply it; the list changes reach players with Save & Publish."
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
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Type">
            <select className={inputCls} value={draft.type} onChange={(e) => patch({ type: e.target.value as LiveType })}>
              {LIVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_NAME[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Picture" hint="Home's square, the pop-up, the shop's section.">
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
          <Field label="Shown from (badges)" hint="Every region's counted.">
            <NumInput value={draft.minBadges} min={0} max={80} onChange={(v) => patch({ minBadges: Math.max(0, v ?? 0) })} />
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
        </div>
        {draft.banner ? (
          <img src={bannerUrl(draft.banner)} alt="" className="pixelated aspect-square w-full object-cover shadow-ring" />
        ) : (
          <div className="grid aspect-square w-full place-items-center bg-shadow text-lg text-muted">No picture</div>
        )}
      </div>
      <details className="border-t-2 border-line pt-2">
        <summary className="cursor-pointer text-lg">
          Custom title (optional){draft.title.en?.trim() ? `: ${draft.title.en}` : ` — players see “${TYPE_NAME[draft.type]}” in their language`}
        </summary>
        <p className="text-base text-muted">
          Only for an occasion. Empty = the type’s own name, translated. A language left empty shows the English one.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {LANGS.map((l) => (
            <Field key={l} label={l}>
              <input
                className={inputCls}
                maxLength={32}
                value={draft.title[l] ?? ''}
                onChange={(e) => patch({ title: { ...draft.title, [l]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </details>
      <div className="border-t-2 border-line pt-2">
        {draft.type === 'shiny' && <ShinyEditor e={draft} set={(shiny) => patch({ shiny })} data={data} />}
        {draft.type === 'shop' && <ShopEditor items={draft.shop.items} set={(items) => patch({ shop: { items } })} data={data} />}
        {draft.type === 'cash' && (
          <Field label="₽ earned + %" hint="Trainers and Gyms, ₽ found in areas, the Elite Rebattle, the Game Corner, the Day Care, the Fortune Wheel. Selling isn't boosted.">
            <NumInput
              value={pct(draft.cash.multiplier)}
              min={1}
              max={900}
              step={5}
              onChange={(v) => patch({ cash: { multiplier: 1 + Math.max(0, v ?? 0) / 100 } })}
            />
          </Field>
        )}
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

function ShinyEditor({ e, set, data }: { e: LiveEvent; set: (s: LiveEvent['shiny']) => void; data: GameData }) {
  const s = e.shiny
  const [q, setQ] = useState('')
  const regions = enabledRegions(data)
  const areas = data.areas
    .filter((a) => a.wildPool.length > 0)
    .sort((a, b) => (a.regionId ?? '').localeCompare(b.regionId ?? '') || a.orderIndex - b.orderIndex)
  const found = q.trim() ? areas.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())) : areas
  const toggle = (id: string) => set({ ...s, areaIds: s.areaIds.includes(id) ? s.areaIds.filter((x) => x !== id) : [...s.areaIds, id] })
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Shiny odds ×" hint={`Wild shiny chance ${(data.config.shinyChance * 100).toFixed(2)} % → ${(Math.min(1, data.config.shinyChance * s.multiplier) * 100).toFixed(2)} %`}>
          <NumInput value={s.multiplier} min={1} max={1000} step={0.5} onChange={(v) => set({ ...s, multiplier: Math.max(1, v ?? 1) })} />
        </Field>
        <Field label="Where">
          <select className={inputCls} value={s.scope} onChange={(ev) => set({ ...s, scope: ev.target.value as LiveEvent['shiny']['scope'] })}>
            <option value="areas">Some areas</option>
            <option value="region">One region</option>
            <option value="all">The whole game</option>
          </select>
        </Field>
        {s.scope === 'region' && (
          <Field label="Region">
            <select className={inputCls} value={s.regionId ?? ''} onChange={(ev) => set({ ...s, regionId: (ev.target.value || null) as RegionId | null })}>
              <option value="">— pick one —</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {s.scope === 'areas' && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1">
            {s.areaIds.map((id) => (
              <button key={id} type="button" className="bg-gold-pale px-1.5 py-0.5 text-base shadow-ring" onClick={() => toggle(id)}>
                {data.areas.find((a) => a.id === id)?.name ?? id} ✕
              </button>
            ))}
            {!s.areaIds.length && <span className="text-base text-muted">No area yet: tick some below.</span>}
          </div>
          <input className={inputCls} placeholder="Find an area" value={q} onChange={(ev) => setQ(ev.target.value)} />
          <div className="grid max-h-64 gap-x-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {found.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-base">
                <input type="checkbox" checked={s.areaIds.includes(a.id)} onChange={() => toggle(a.id)} />
                <span className="text-muted">{(a.regionId ?? 'kanto').slice(0, 3).toUpperCase()}</span> {a.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <p className="text-base text-muted">Wild encounters only: trainers, bosses, Eggs and raids keep their odds; legendaries stay shiny-locked.</p>
    </div>
  )
}

function ShopEditor({ items, set, data }: { items: LiveShopItem[]; set: (items: LiveShopItem[]) => void; data: GameData }) {
  const all = Object.values(data.items).sort((a, b) => a.name.localeCompare(b.name))
  const regions = enabledRegions(data)
  const row = (i: number, p: Partial<LiveShopItem>) => set(items.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-1 font-normal">Item</th>
              <th className="px-1 font-normal">Event price</th>
              <th className="px-1 font-normal">In the Mart</th>
              <th className="px-1 font-normal">Limit per player</th>
              <th className="px-1 font-normal">Sold in</th>
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
                    <select className={inputCls} value={r.key} onChange={(e) => row(i, { key: e.target.value })}>
                      {!it && <option value={r.key}>{r.key}</option>}
                      {all.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-28 px-1 py-1">
                    <NumInput value={r.price} min={1} onChange={(v) => row(i, { price: Math.max(1, v ?? 1) })} />
                    {r.price < floor && <div className="text-sm text-danger">Below the buy-back {money(floor)}: sold at {money(floor)}</div>}
                  </td>
                  <td className="px-1 py-1 text-base">
                    {it?.inShop ? (
                      <>
                        {money(it.price)}
                        {r.price < it.price && <span className="text-good"> −{Math.round((1 - r.price / it.price) * 100)} %</span>}
                      </>
                    ) : (
                      <span className="text-good">never sold</span>
                    )}
                  </td>
                  <td className="w-28 px-1 py-1">
                    <NumInput value={r.limit} min={1} nullable onChange={(v) => row(i, { limit: v == null ? null : Math.max(1, v) })} />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      className={inputCls}
                      value={r.regions === 'all' ? 'all' : (r.regions[0] ?? 'all')}
                      onChange={(e) => row(i, { regions: e.target.value === 'all' ? 'all' : [e.target.value as RegionId] })}
                    >
                      <option value="all">Every region</option>
                      {regions.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} only
                        </option>
                      ))}
                    </select>
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
        <PixelButton size="sm" onClick={() => set([...items, { key: 'ultra-ball', price: data.items['ultra-ball']?.price ?? 100, limit: 10, regions: 'all' }])}>
          Add an item
        </PixelButton>
      </div>
      <p className="text-base text-muted">
        Empty limit = no limit. A region-only item is sold while the player plays that region. Items the Mart sells keep
        their usual row too; a price below the Mart's buy-back is raised to it (no buy-and-sell profit).
      </p>
    </div>
  )
}
