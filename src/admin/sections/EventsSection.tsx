// Admin → Events (docs/18, docs/19): the special events' switches, Home order, unlock areas, banner pictures and the
// rules their unlock pop-up lists. One game_config row, `events`; each event's own numbers get their box as it's built.
import { DEFAULT_CONFIG, EVENT_IDS, type EventDef, type EventId, type EventsConfig } from '@/engine'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { bannerUrl } from '@/screens/events/shared'
import { useAdminData } from '../store'
import { Box, Field, NumInput, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

const NAMES: Record<EventId, string> = { wheel: 'Fortune Wheel', raid: 'Raid Battles', rebattle: 'Elite Rebattle' }

/** The rule ids the unlock pop-up knows (strings.csv `ui.events.rules.<id>.title/text`). */
const RULES: Record<EventId, string[]> = {
  wheel: ['wheel.daily', 'wheel.prizes', 'wheel.odds'],
  raid: ['raid.daily', 'raid.sides', 'raid.bars', 'raid.catch'],
  rebattle: ['rebattle.tiers', 'rebattle.gauntlet', 'rebattle.gold'],
}

/** The row over the defaults, one level deep per event, so an older row missing a field still works. */
export function useEventsConfig(): [EventsConfig, (patch: Partial<EventsConfig>) => void] {
  const [raw, setRaw] = useConfigRow('events')
  const d = DEFAULT_CONFIG.events
  const r = (raw ?? {}) as Partial<EventsConfig>
  const cfg: EventsConfig = {
    ...d,
    ...r,
    wheel: { ...d.wheel, ...r.wheel },
    raid: { ...d.raid, ...r.raid },
    rebattle: { ...d.rebattle, ...r.rebattle },
  }
  return [cfg, (patch) => setRaw({ ...cfg, ...patch })]
}

function EventRow({ id, def, set }: { id: EventId; def: EventDef; set: (patch: Partial<EventDef>) => void }) {
  const data = useAdminData()
  const areas = (data?.areas ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const pictures = Object.keys(ART_GEOMETRY).sort()
  return (
    <div className="grid gap-3 border-t-2 border-line pt-3 md:grid-cols-[minmax(0,1fr)_200px]">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xl sm:col-span-2">
          <input type="checkbox" checked={def.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-5 w-5" />
          {NAMES[id]}
        </label>
        <Field label="Order on Home" hint="Lower comes first.">
          <NumInput value={def.priority} min={1} max={9} onChange={(v) => set({ priority: v ?? 1 })} />
        </Field>
        {id === 'rebattle' ? (
          <Field label="Opens with">
            <span className="text-lg text-muted">each region's league, for that region</span>
          </Field>
        ) : (
          <Field label="Opens when this area is cleared">
            <select
              className={inputCls}
              value={def.unlockAreaId ?? ''}
              onChange={(e) => set({ unlockAreaId: e.target.value || null })}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.regionId ?? 'kanto').toUpperCase()} · {a.orderIndex} · {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Banner picture" hint="An area picture until the event's own art exists.">
          <select className={inputCls} value={def.banner} onChange={(e) => set({ banner: e.target.value })}>
            {!pictures.includes(def.banner) && <option value={def.banner}>{def.banner}</option>}
            {pictures.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unlock pop-up rules" hint={`2 to 4, in order. Known: ${RULES[id].join(', ')}`}>
          <input
            className={inputCls}
            value={def.rules.join(', ')}
            onChange={(e) =>
              set({
                rules: e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </div>
      <img src={bannerUrl(def.banner)} alt="" className="pixelated aspect-[3/1] w-full object-cover shadow-ring" />
    </div>
  )
}

export function EventsSection() {
  const [cfg, set] = useEventsConfig()
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Special events"
        hint="Each event shows up on Home once it's on and its area is cleared, in this order, with a pop-up the first time. Saved with the rest of the config (Publish)."
      >
        <Field label="Teaser from this many Kanto badges" hint="Before the first event opens, Home shows a locked square naming its area.">
          <NumInput value={cfg.teaserBadges} min={0} max={8} onChange={(v) => set({ teaserBadges: v ?? 0 })} />
        </Field>
        {EVENT_IDS.map((id) => (
          <EventRow key={id} id={id} def={cfg[id]} set={(patch) => set({ [id]: { ...cfg[id], ...patch } })} />
        ))}
      </Box>
    </div>
  )
}
