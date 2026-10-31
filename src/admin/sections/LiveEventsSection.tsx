// Admin → Live events (docs/20): what changes the whole game for a while, the same for everyone — a Shiny Parade, a
// Special Shop, Cash Flow or the Underground (docs/34; its numbers are a row of their own, UndergroundBox). One
// game_config row, `liveEvents`. Events may overlap (each gets its square on Home; two of a kind add up), except two
// Undergrounds. One runs once, between two dates, or comes back (§9): every year on a date, or on a weekday, every week
// or on some weeks of the month. An event is edited as a draft and goes into the list only when nothing is wrong with
// it; Save & Publish sends it.
import { useMemo, useState } from 'react'
import {
  LIVE_REPEAT_MAX_HOURS,
  LIVE_TYPES,
  enabledRegions,
  liveDefaultBanner,
  liveNextRun,
  liveProblems,
  liveRuns,
  liveState,
  newLiveEvent,
  normaliseLiveEvent,
  sellPrice,
  type GameData,
  type LiveEvent,
  type LiveRepeat,
  type LiveShopItem,
  type LiveType,
  type LiveWeek,
  type RegionId,
} from '@/engine'
import { LANGS } from '@/i18n/langs'
import { money } from '@/lib/format'
import { bannerUrl } from '@/screens/events/shared'
import { useNow } from '@/store/hooks'
import { cx } from '@/theme/util'
import { PixelButton } from '@/components/PixelButton'
import { useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, PicturePicker, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'
import { UndergroundBox } from './UndergroundBox'

const TYPE_NAME: Record<LiveType, string> = { shiny: 'Shiny Parade', shop: 'Special Shop', cash: 'Cash Flow', underground: 'Underground' }
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKS: { id: LiveWeek; label: string }[] = [
  { id: 1, label: '1st' },
  { id: 2, label: '2nd' },
  { id: 3, label: '3rd' },
  { id: 4, label: '4th' },
  { id: 'last', label: 'Last' },
]
const hhmm = (iso: string) => (Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString().slice(11, 16) : '18:00')

/** "Every year on 31 October", "Every Saturday", "The 1st and 3rd Saturday of each month", with its time and length. */
function repeatText(r: LiveRepeat): string {
  const when =
    r.kind === 'yearly'
      ? `Every year on ${r.day} ${MONTHS[r.month - 1] ?? '?'}`
      : r.weeks.length
        ? `The ${r.weeks.map((w) => WEEKS.find((x) => x.id === w)?.label.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')} ${WEEKDAYS[r.weekday] ?? '?'} of each month`
        : `Every ${WEEKDAYS[r.weekday] ?? '?'}`
  return `${when}, ${r.time} UTC, for ${duration(r.hours * HOUR)}`
}

/** A recurring event's settings when the admin switches to that kind, from the one-off dates it had. */
function repeatFrom(kind: LiveRepeat['kind'], e: LiveEvent): LiveRepeat {
  const s = Number.isFinite(Date.parse(e.start)) ? new Date(e.start) : new Date()
  const span = Math.round((Date.parse(e.end) - Date.parse(e.start)) / HOUR)
  const hours = Math.min(LIVE_REPEAT_MAX_HOURS[kind], Number.isFinite(span) && span >= 1 ? span : 24)
  const time = hhmm(e.start)
  return kind === 'yearly'
    ? { kind, month: s.getUTCMonth() + 1, day: s.getUTCDate(), time, hours }
    : { kind, weekday: s.getUTCDay(), weeks: [], time, hours }
}

function summary(e: LiveEvent, data: GameData | null): string {
  if (e.type === 'cash') return `+${pct(e.cash.multiplier)} % on every ₽ earned`
  if (e.type === 'shop') return `${e.shop.items.length} item${e.shop.items.length === 1 ? '' : 's'}`
  if (e.type === 'underground') return 'walls to dig, orbs, fossils and plates (its settings are shared)'
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

/** The run the list shows: the one on or next for a recurring event, else the event's own dates. */
const shownRun = (e: LiveEvent, now: number) => (e.repeat ? liveNextRun(e, now) : e)
const sortKey = (e: LiveEvent, now: number) => Date.parse(shownRun(e, now)?.start ?? '') || 0

export function LiveEventsSection() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('liveEvents')
  const list = useMemo(() => (raw?.list ?? []).map((e) => normaliseLiveEvent(e)), [raw])
  const now = useNow(30_000)
  const [draft, setDraft] = useState<LiveEvent | null>(null)
  const access = raw?.access ?? 'off'
  const write = (next: LiveEvent[]) => setRaw({ ...raw, access, list: next })
  const problems = draft && data ? liveProblems(list, draft, data, now) : []
  const isNew = !!draft && !list.some((e) => e.id === draft.id)
  const apply = () => {
    if (!draft || problems.length) return
    write(isNew ? [...list, draft] : list.map((e) => (e.id === draft.id ? draft : e)))
    setDraft(null)
  }
  const sorted = [...list].sort((a, b) => sortKey(b, now) - sortKey(a, now))
  const start = () => {
    // The next round hour, for three days (events may overlap now: no need to wait for the last one's end).
    const s = Math.ceil(now / HOUR) * HOUR
    const e = newLiveEvent(newId(), new Date(s).toISOString(), new Date(s + 72 * HOUR).toISOString())
    setDraft({ ...e, banner: liveDefaultBanner(e) })
  }
  /** Ends it now, for everyone: a one-off event's end, or only the running run of a recurring one. */
  const endNow = (e: LiveEvent) => {
    const stop = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
    const run = e.repeat ? liveRuns(e, Date.now(), Date.now() + 1)[0] : null
    const key = run?.id.split('@')[1]
    write(list.map((x) => (x.id !== e.id ? x : key ? { ...x, stops: { ...x.stops, [key]: stop } } : { ...x, end: stop })))
  }
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Live events"
        icon="sparkle"
        hint="They change the whole game for a while, the same for everyone, between their start and end (UTC, the server's clock), once or coming back every year or every week. They may overlap: each has its square on Home and its pop-up once, from the badges set; two of a kind add up (two +50 % Cash Flows pay +100 %). Only two Undergrounds can't overlap. Save & Publish to send a change; a game picks it up on its next load (Reload all players for right now)."
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
            <table className="w-full min-w-[800px] border-collapse text-lg">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-2 py-1 font-normal">Event</th>
                  <th className="px-2 py-1 font-normal">Starts (UTC)</th>
                  <th className="px-2 py-1 font-normal">Ends (UTC)</th>
                  <th className="px-2 py-1 font-normal">Comes back</th>
                  <th className="px-2 py-1 font-normal">State</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => {
                  const st = liveState(e, now)
                  // A recurring event shows its run on or next to come.
                  const run = shownRun(e, now)
                  return (
                    <tr key={e.id} className={cx('border-t-2 border-line', draft?.id === e.id && 'bg-gold-pale')}>
                      <td className="px-2 py-1">
                        <div className="leading-none">{titleOf(e)}</div>
                        <div className="text-base text-muted">
                          {TYPE_NAME[e.type]} · {summary(e, data)} · from {e.minBadges} badges
                        </div>
                      </td>
                      <td className="px-2 py-1 font-mono text-base">{run ? utc(run.start) : '—'}</td>
                      <td className="px-2 py-1 font-mono text-base">{run ? utc(run.end) : '—'}</td>
                      <td className="px-2 py-1 text-base text-muted">{e.repeat ? repeatText(e.repeat) : 'Once'}</td>
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
                                const what = e.repeat ? 'this run of ' : ''
                                if (window.confirm(`End ${what}“${titleOf(e)}” now, for everyone?${e.repeat ? ' It still comes back next time.' : ''} (Then Save & Publish.)`))
                                  endNow(e)
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
  // The picture follows the dates and the type (liveDefaultBanner) until one is picked by hand, so changing the
  // dates of an event left on its default moves it to the new occasion's.
  const patch = (p: Partial<LiveEvent>) => {
    const next = { ...draft, ...p }
    const auto = !draft.banner || draft.banner === liveDefaultBanner(draft)
    set(!('banner' in p) && auto ? { ...next, banner: liveDefaultBanner(next) } : next)
  }
  const span = Date.parse(draft.end) - Date.parse(draft.start)
  const now = useNow(60_000)
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
          <Field
            label="Picture"
            hint="Home's square, the pop-up, the shop's section. Follows the dates (Halloween, New Year, spring, summer, else a celebration) until you pick one."
          >
            <PicturePicker value={draft.banner} placeholder="— pick one —" onChange={(banner) => patch({ banner })} />
          </Field>
          <Field label="Shown from (badges)" hint="Every region's counted.">
            <NumInput value={draft.minBadges} min={0} max={80} onChange={(v) => patch({ minBadges: Math.max(0, v ?? 0) })} />
          </Field>
          <Field label="When" hint={draft.repeat ? 'Comes back by itself; each run is a new event for players.' : 'Between two dates.'}>
            <select
              className={inputCls}
              value={draft.repeat?.kind ?? 'once'}
              onChange={(ev) => {
                const kind = ev.target.value
                patch({ repeat: kind === 'yearly' || kind === 'weekly' ? repeatFrom(kind, draft) : null })
              }}
            >
              <option value="once">Once (dates)</option>
              <option value="yearly">Every year (a date)</option>
              <option value="weekly">Every week (a weekday)</option>
            </select>
          </Field>
          {!draft.repeat && (
            <>
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
            </>
          )}
        </div>
        {draft.banner ? (
          <img src={bannerUrl(draft.banner)} alt="" className="pixelated aspect-square w-full object-cover shadow-ring" />
        ) : (
          <div className="grid aspect-square w-full place-items-center bg-shadow text-lg text-muted">No picture</div>
        )}
      </div>
      {draft.repeat && <RepeatEditor e={draft} set={(repeat) => patch({ repeat })} now={now} />}
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
        {draft.type === 'underground' && <UndergroundBox />}
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

/** A recurring event's date or weekday (and weeks of the month), its start time and length, and its next runs. */
function RepeatEditor({ e, set, now }: { e: LiveEvent; set: (r: LiveRepeat) => void; now: number }) {
  const r = e.repeat!
  const max = LIVE_REPEAT_MAX_HOURS[r.kind]
  const next = liveRuns(e, now, now + 3 * 366 * 24 * HOUR, 3)
  const toggle = (w: LiveWeek) => {
    if (r.kind !== 'weekly') return
    const weeks = r.weeks.includes(w) ? r.weeks.filter((x) => x !== w) : [...r.weeks, w]
    set({ ...r, weeks: WEEKS.map((x) => x.id).filter((x) => weeks.includes(x)) })
  }
  return (
    <div className="grid gap-2 border-t-2 border-line pt-2">
      <div className="grid gap-2 sm:grid-cols-4">
        {r.kind === 'yearly' ? (
          <>
            <Field label="Month">
              <select className={inputCls} value={r.month} onChange={(ev) => set({ ...r, month: Number(ev.target.value) })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Day" hint={r.month === 2 && r.day === 29 ? 'Leap years only.' : undefined}>
              <NumInput value={r.day} min={1} max={31} onChange={(v) => set({ ...r, day: Math.max(1, Math.min(31, v ?? 1)) })} />
            </Field>
          </>
        ) : (
          <Field label="Weekday">
            <select className={inputCls} value={r.weekday} onChange={(ev) => set({ ...r, weekday: Number(ev.target.value) })}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Starts at (UTC)">
          <input type="time" className={inputCls} value={r.time} onChange={(ev) => ev.target.value && set({ ...r, time: ev.target.value })} />
        </Field>
        <Field label="Lasts (hours)" hint={`${duration(r.hours * HOUR)} · ${max} at most`}>
          <NumInput value={r.hours} min={1} max={max} onChange={(v) => set({ ...r, hours: Math.max(1, Math.min(max, v ?? 1)) })} />
        </Field>
      </div>
      {r.kind === 'weekly' && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className="text-lg">Weeks of the month</legend>
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={!r.weeks.length} onChange={() => set({ ...r, weeks: [] })} />
            Every week
          </label>
          {WEEKS.map((w) => (
            <label key={w.id} className="flex items-center gap-2 text-base">
              <input type="checkbox" checked={r.weeks.includes(w.id)} onChange={() => toggle(w.id)} />
              {w.label} {WEEKDAYS[r.weekday]}
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-base text-muted">
        {repeatText(r)}.{' '}
        {next.length
          ? `Next: ${next.map((x) => `${utc(x.start)} UTC (${yourTime(x.start)} your time)`).join(' · ')}.`
          : 'It never runs on that date.'}
      </p>
    </div>
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
