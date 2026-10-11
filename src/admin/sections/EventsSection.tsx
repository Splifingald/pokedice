// Admin → Events (docs/18, docs/19): the special events' switches, Home order, unlock areas, banner pictures and the
// rules their unlock pop-up lists. One game_config row, `events`; each event's own numbers get their box as it's built.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createRng,
  npcTeam,
  raidOfDay,
  regionOfArea,
  simulateRaid,
  upcomingRaids,
  DEFAULT_CONFIG,
  EVENT_IDS,
  REBATTLE_TIER_IDS,
  prizeChances,
  wheelSlices,
  type EventDef,
  type EventId,
  type EventsConfig,
  type GameData,
  type RaidConfig,
  type RebattleLineups,
  type RebattleTier,
  type RebattleTierId,
  type Trainer,
  type WheelPrize,
  type WheelReward,
} from '@/engine'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { WheelStage } from '@/fx/wheel'
import { money } from '@/lib/format'
import { bannerUrl, RewardIcon } from '@/screens/events/shared'
import { cx } from '@/theme/util'
import { useAdminData } from '../store'
import { Box, Field, NumInput, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

/** Pictures made for the events (public/backgrounds). */
export const EVENT_BANNERS = ['/backgrounds/fortune-wheel.png']

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
  // The events' own pictures first, then every area picture.
  const pictures = [...EVENT_BANNERS, ...Object.keys(ART_GEOMETRY).sort()]
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
        <Field label="Banner picture" hint="The event's own picture, or an area picture.">
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

/** A live wheel, the way players see it (lights and all). */
function WheelPreview({ prizes, data }: { prizes: WheelPrize[]; data: GameData }) {
  const box = useRef<HTMLDivElement>(null)
  const disc = useRef<HTMLCanvasElement>(null)
  const fx = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<HTMLSpanElement>(null)
  const stage = useRef<WheelStage | null>(null)
  const slices = useMemo(
    () =>
      wheelSlices(prizes).map((i) => {
        const r = prizes[i]!.reward
        return r.kind === 'gold'
          ? { reward: r, label: money(r.amount) }
          : { reward: r, sprite: data.items[r.key]?.spriteUrl ?? undefined, label: r.qty > 1 ? `×${r.qty}` : '' }
      }),
    [prizes, data],
  )
  useEffect(() => {
    if (!box.current || !disc.current || !fx.current || !pointer.current) return
    const s = new WheelStage({ box: box.current, wheel: disc.current, fx: fx.current, pointer: pointer.current }, slices, 'off')
    s.start(false)
    stage.current = s
    return () => s.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once; the slices follow below
  }, [])
  useEffect(() => stage.current?.setSlices(slices), [slices])
  return (
    <div ref={box} className="ev-wheel !m-0 !w-[200px]">
      <span ref={pointer} className="ev-pointer" aria-hidden />
      <canvas ref={disc} className="ev-wheel-disc" width={200} height={200} aria-label="Preview of the wheel" />
      <canvas ref={fx} className="ev-wfx" aria-hidden />
    </div>
  )
}

/** The wheel's prizes: what each one is, how many slices it takes and the odds of each slice. */
function WheelBox({ prizes, set }: { prizes: WheelPrize[]; set: (prizes: WheelPrize[]) => void }) {
  const data = useAdminData()
  const chances = prizeChances(prizes)
  const sum = prizes.reduce((n, p) => n + Math.max(0, p.count) * Math.max(0, p.odds), 0)
  const items = Object.values(data?.items ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  const setPrize = (i: number, patch: Partial<WheelPrize>) => set(prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setReward = (i: number, reward: WheelReward) => setPrize(i, { reward })
  const pct = (x: number) => `${+x.toFixed(2)} %`
  const off = Math.abs(sum - 100) > 0.01
  return (
    <Box
      title="Fortune Wheel — prizes" icon="reroll"
      hint="Equal slices on the wheel. A prize takes as many slices as its count, each won that % of the time. The server draws signed-in players' prizes from this list: Publish before players spin."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-lg">
            <thead>
              <tr className="text-left">
                <th className="font-normal">Prize</th>
                <th className="font-normal">Amount</th>
                <th className="font-normal">Slices</th>
                <th className="font-normal">% each slice</th>
                <th className="font-normal">Chance a spin</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prizes.map((p, i) => {
                const r = p.reward
                return (
                  <tr key={i} className="border-t border-shadow/40">
                    <td className="py-1 pr-2">
                      <span className="flex items-center gap-1.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center">{data && <RewardIcon reward={r} data={data} size={28} />}</span>
                        <select
                          className={cx(inputCls, 'min-w-[150px]')}
                          value={r.kind === 'gold' ? 'gold' : r.key}
                          onChange={(e) =>
                            setReward(
                              i,
                              e.target.value === 'gold'
                                ? { kind: 'gold', amount: r.kind === 'gold' ? r.amount : 10 }
                                : { kind: 'item', key: e.target.value, qty: r.kind === 'item' ? r.qty : 1 },
                            )
                          }
                        >
                          <option value="gold">Pokédollars</option>
                          {items.map((it) => (
                            <option key={it.key} value={it.key}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </span>
                    </td>
                    <td className="pr-2">
                      <NumInput
                        className="w-24"
                        min={1}
                        value={r.kind === 'gold' ? r.amount : r.qty}
                        onChange={(v) => {
                          const n = Math.max(1, Math.round(v ?? 1))
                          setReward(i, r.kind === 'gold' ? { ...r, amount: n } : { ...r, qty: n })
                        }}
                      />
                    </td>
                    <td className="pr-2">
                      <NumInput className="w-20" min={0} value={p.count} onChange={(v) => setPrize(i, { count: Math.max(0, Math.round(v ?? 0)) })} />
                    </td>
                    <td className="pr-2">
                      <NumInput className="w-24" min={0} step={0.5} value={p.odds} onChange={(v) => setPrize(i, { odds: Math.max(0, v ?? 0) })} />
                    </td>
                    <td className="pr-2 font-mono">{pct(chances[i]!)}</td>
                    <td>
                      <button
                        type="button"
                        className="px-2 text-lg text-danger"
                        onClick={() => set(prizes.filter((_, j) => j !== i))}
                        aria-label="Remove this prize"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button
            type="button"
            className="mt-2 px-2 py-1 text-lg shadow-ring"
            onClick={() => set([...prizes, { reward: { kind: 'gold', amount: 10 }, count: 1, odds: 5 }])}
          >
            + Add a prize
          </button>
        </div>
        {data && <WheelPreview prizes={prizes} data={data} />}
      </div>
      <p className={cx('text-lg', off && 'text-danger')}>
        Slices × odds add up to <b>{pct(sum)}</b>
        {off ? ': the game scales them to 100 % (the last column is what players get).' : '.'} {wheelSlices(prizes).length} slices
        on the wheel.
      </p>
    </Box>
  )
}

/** The Elite Rebattle: each tier's ₽ and upgrade step, and every region's lineups (the trainers are tuned in Trainers). */
function RebattleBox({ tiers, set }: { tiers: RebattleTier[]; set: (tiers: RebattleTier[]) => void }) {
  const data = useAdminData()
  const [raw, setLineups] = useConfigRow('rebattleLineups')
  // Until the row is saved, the lineups the game ships (config.json, written by scripts/rebattle-teams.ts).
  const lineups: RebattleLineups = raw && Object.keys(raw).length ? raw : (data?.config.rebattleLineups ?? {})
  const setTier = (i: number, patch: Partial<RebattleTier>) => set(tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const league = (Object.values(data?.trainers ?? {}) as Trainer[])
    .filter((t) => t.role === 'elite' || t.role === 'champion')
    .sort((a, b) => a.name.localeCompare(b.name))
  const label = (t: Trainer) =>
    `${t.name}${t.rivalOf != null ? ` (vs starter #${t.rivalOf})` : ''} · Lv.${Math.min(...t.team.map((m) => m.level))}–${Math.max(...t.team.map((m) => m.level))}`
  const setSlot = (region: string, tier: RebattleTierId, i: number, id: string) => {
    const cur = [...(lineups[region]?.[tier] ?? [])]
    if (id) cur[i] = id
    else cur.splice(i, 1)
    setLineups({ ...lineups, [region]: { ...lineups[region], [tier]: cur } })
  }
  const regions = (data?.regions ?? []).filter((r) => lineups[r.id])
  return (
    <Box
      title="Elite Rebattle — tiers and lineups" icon="trophy"
      hint="A region's League again in three tiers, once its League is won. Each tier is a gauntlet in this order; a loss starts it over. Each Pokémon pays once per tier (a League trainer's ₽ × the tier's multiplier). Teams, levels and potions are the trainers' own (Trainers section). Kanto's Champion seat lists one rival per starter: the player meets theirs."
    >
      <table className="w-full text-lg">
        <thead>
          <tr className="text-left">
            <th className="font-normal">Tier</th>
            <th className="font-normal">₽ multiplier</th>
            <th className="font-normal">Upgrade level</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((x, i) => (
            <tr key={x.id} className="border-t border-shadow/40">
              <td className="py-1 pr-2 capitalize">{x.id}</td>
              <td className="pr-2">
                <NumInput className="w-24" min={0} step={0.5} value={x.gold} onChange={(v) => setTier(i, { gold: Math.max(0, v ?? 1) })} />
              </td>
              <td>
                <label className="flex flex-wrap items-center gap-2">
                  <span className="text-base text-muted">League +</span>
                  <NumInput
                    className="w-20"
                    min={0}
                    max={9}
                    value={x.upgradeDelta === 'max' ? null : x.upgradeDelta}
                    nullable
                    onChange={(v) => setTier(i, { upgradeDelta: v == null ? 'max' : Math.max(0, Math.round(v)) })}
                  />
                  <span className="text-base text-muted">(empty = 10, the max)</span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {regions.map((r) => (
        <details key={r.id} className="border-t-2 border-line pt-2">
          <summary className="cursor-pointer text-xl">
            {r.name} · {REBATTLE_TIER_IDS.map((tier) => (lineups[r.id]?.[tier] ?? []).length).join(' / ')} trainers
          </summary>
          <div className="mt-2 grid gap-3 lg:grid-cols-3">
            {REBATTLE_TIER_IDS.map((tier) => {
              const ids = lineups[r.id]?.[tier] ?? []
              return (
                <div key={tier} className="grid content-start gap-1.5">
                  <h4 className="m-0 text-lg capitalize">{tier}</h4>
                  {[...ids, ''].map((id, i) => (
                    <select key={`${i}-${id}`} className={inputCls} value={id} onChange={(e) => setSlot(r.id, tier, i, e.target.value)}>
                      <option value="">{id ? '— remove —' : '+ add a trainer'}</option>
                      {league.map((t) => (
                        <option key={t.id} value={t.id}>
                          {label(t)}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              )
            })}
          </div>
        </details>
      ))}
    </Box>
  )
}

/** Dex numbers as "149, 248, 373": typed freely, kept as the numbers in it. */
function DexList({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <input
      className={inputCls}
      defaultValue={value.join(', ')}
      onBlur={(e) =>
        onChange(
          e.target.value
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
        )
      }
    />
  )
}

/**
 * The admin's raid sims (`pnpm raid-balance` in the page): three sides of random raid-eligible Pokémon at the team cap,
 * every side on the battle AI, against one raid or every one, with the numbers as edited (saved or not).
 */
function RaidSim({ raid }: { raid: RaidConfig }) {
  const data = useAdminData()
  const [dex, setDex] = useState<number | 'all'>('all')
  const [n, setN] = useState(30)
  const [rows, setRows] = useState<{ name: string; win: number; steps: number }[] | null>(null)
  const [busy, setBusy] = useState(false)
  if (!data) return null
  // The coming two weeks' raids, as the calendar has them with the numbers as edited.
  const edited = { ...data, config: { ...data.config, events: { ...data.config.events, raid: { ...data.config.events.raid, ...raid } } } }
  const today = new Date().toISOString().slice(0, 10)
  const seen = new Set<number>()
  const raids = [{ day: today, raid: raidOfDay(edited, today) }, ...upcomingRaids(edited, today, 13)].flatMap(({ raid: r }) => {
    if (!r || seen.has(r.dex)) return []
    seen.add(r.dex)
    const a = data.areas.find((x) => x.id === r.areaId)
    return a ? [{ dex: r.dex, regionId: regionOfArea(a) }] : []
  })
  const run = () => {
    setBusy(true)
    // A frame for "Simulating…" first: the sims run on the page's thread.
    setTimeout(() => {
      const sim = { ...data, config: { ...data.config, events: { ...data.config.events, raid: { ...data.config.events.raid, ...raid } } } }
      const regions = data.regions.map((r) => r.id)
      const rng = createRng(1)
      // Species or areas missing from the content loaded here: those raids can't be played.
      const out = raids
        .filter((r) => (dex === 'all' || r.dex === dex) && !!data.species[r.dex])
        .map((r) => {
          let wins = 0
          let steps = 0
          for (let i = 0; i < n; i++) {
            const sides = [0, 1, 2].map((k) => ({ owner: `Side ${k + 1}`, look: null, kind: 'npc' as const, team: npcTeam(sim, regions, rng, `s${k}`) }))
            const res = simulateRaid({ boss: { dex: r.dex, shiny: false }, sides, regionId: r.regionId }, sim, rng)
            if (res.won) wins++
            steps += res.steps
          }
          return { name: data.species[r.dex]?.name ?? `#${r.dex}`, win: wins / n, steps: steps / n }
        })
      setRows(out)
      setBusy(false)
    }, 30)
  }
  const mean = rows?.length ? Math.round((rows.reduce((t, r) => t + r.win, 0) / rows.length) * 100) : null
  return (
    <details className="border-t-2 border-line pt-2">
      <summary className="cursor-pointer text-xl">Simulate the win rate</summary>
      <p className="m-0 mt-1 text-base text-muted">
        Three sides of random fully evolved Pokémon (the NPC rules) at Lv.{raid.teamCap}, all on the battle AI. Target: about 50–70 %. Uses
        the numbers above, saved or not.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Raid">
          <select className={inputCls} value={String(dex)} onChange={(e) => setDex(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">The next two weeks ({raids.length})</option>
            {raids.map((r) => (
              <option key={r.dex} value={r.dex}>
                {data.species[r.dex]?.name ?? `#${r.dex}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Raids each">
          <NumInput min={5} max={200} value={n} onChange={(v) => setN(Math.max(5, Math.min(200, v ?? 30)))} />
        </Field>
        <button type="button" className="min-h-[44px] px-3 text-lg shadow-ring" disabled={busy} onClick={run}>
          {busy ? 'Simulating…' : 'Run'}
        </button>
      </div>
      {rows && (
        <table className="mt-2 w-full text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-normal">Raid</th>
              <th className="font-normal">Win %</th>
              <th className="font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-shadow/40">
                <td className="py-0.5">{r.name}</td>
                <td className="font-mono">{Math.round(r.win * 100)}</td>
                <td className="font-mono">{r.steps.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-line">
                <td className="py-0.5">Mean</td>
                <td className="font-mono">{mean}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </details>
  )
}

/**
 * The raid calendar: its fixed dates (every year, 'MM-DD'), how late a shiny filler's area must start, and the coming
 * two weeks as every player will see them.
 */
function RaidCalendarBox({ raid, set }: { raid: RaidConfig; set: (patch: Partial<RaidConfig>) => void }) {
  const data = useAdminData()
  const cal = raid.calendar
  const name = (dex: number) => data?.species[dex]?.name ?? `#${dex}`
  const setCal = (patch: Partial<RaidConfig['calendar']>) => set({ calendar: { ...cal, ...patch } })
  const edited = data ? { ...data, config: { ...data.config, events: { ...data.config.events, raid: { ...data.config.events.raid, ...raid } } } } : null
  const today = new Date().toISOString().slice(0, 10)
  const next = edited ? [{ day: today, raid: raidOfDay(edited, today) }, ...upcomingRaids(edited, today, 13)] : []
  return (
    <details className="border-t-2 border-line pt-2">
      <summary className="cursor-pointer text-xl">Calendar · {cal.anchors.length} fixed dates</summary>
      <p className="m-0 mt-1 text-base text-muted">
        One raid a UTC day, the same for everyone. Fixed dates first; then the mythicals and every legendary as a shiny on the
        weekends, the pseudo-legendaries spread over the year, and shiny fully evolved Pokémon on the other
        days. Laid out per year from the year itself, so every player gets the same.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label="Fillers from areas starting at Lv." hint="A shiny filler comes from an area at least this high, so a Lv.50 catch never lands early.">
          <NumInput min={1} max={100} value={cal.fillerMinLevel} onChange={(v) => setCal({ fillerMinLevel: Math.max(1, v ?? 40) })} />
        </Field>
      </div>
      <table className="mt-2 w-full text-lg">
        <thead>
          <tr className="text-left text-muted">
            <th className="font-normal">Date (MM-DD)</th>
            <th className="font-normal">Dex</th>
            <th className="font-normal">Pokémon</th>
            <th className="font-normal">Shiny</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cal.anchors.map((a, i) => (
            <tr key={i} className="border-t border-shadow/40">
              <td className="py-1 pr-2">
                <input
                  className={cx(inputCls, 'w-24')}
                  defaultValue={a.date}
                  pattern="[0-9]{2}-[0-9]{2}"
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (/^[0-9]{2}-[0-9]{2}$/.test(v)) setCal({ anchors: cal.anchors.map((x, j) => (j === i ? { ...x, date: v } : x)) })
                  }}
                />
              </td>
              <td className="pr-2">
                <NumInput
                  className="w-24"
                  min={1}
                  value={a.dex}
                  onChange={(v) => setCal({ anchors: cal.anchors.map((x, j) => (j === i ? { ...x, dex: Math.max(1, v ?? 1) } : x)) })}
                />
              </td>
              <td className="pr-2">{name(a.dex)}</td>
              <td className="pr-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={a.shiny}
                  aria-label={`Shiny ${name(a.dex)}`}
                  onChange={(e) => setCal({ anchors: cal.anchors.map((x, j) => (j === i ? { ...x, shiny: e.target.checked } : x)) })}
                />
              </td>
              <td>
                <button type="button" className="px-2 text-lg text-danger" onClick={() => setCal({ anchors: cal.anchors.filter((_, j) => j !== i) })} aria-label="Remove">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="mt-2 px-2 py-1 text-lg shadow-ring" onClick={() => setCal({ anchors: [...cal.anchors, { date: '01-01', dex: 151, shiny: false }] })}>
        + Add a date
      </button>
      {next.length > 0 && (
        <>
          <h4 className="m-0 mt-3 text-xl font-normal">The next two weeks</h4>
          <ol className="m-0 mt-1 grid list-none gap-0.5 p-0 text-lg sm:grid-cols-2">
            {next.map(({ day, raid: r }) => (
              <li key={day} className="flex gap-2">
                <span className="w-28 shrink-0 font-mono text-muted">{day}</span>
                <span>
                  {r ? `${name(r.dex)}${r.shiny ? ' (shiny)' : ''} · ${r.kind} · ${data?.areas.find((x) => x.id === r.areaId)?.name ?? '?'}` : '—'}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </details>
  )
}

/** Raid Battles: the fight's numbers, the pool (each mythical and the area that unlocks it), the fallback list, the
 *  species never used as NPC allies or summons, and the helpers' gifts. */
function RaidBox({ raid, set }: { raid: RaidConfig; set: (patch: Partial<RaidConfig>) => void }) {
  const data = useAdminData()
  const areas = (data?.areas ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const name = (dex: number) => data?.species[dex]?.name ?? `#${dex}`
  const num = (label: string, key: keyof RaidConfig, o: { min?: number; max?: number; step?: number; hint?: string } = {}) => (
    <Field label={label} hint={o.hint}>
      <NumInput
        min={o.min ?? 0}
        max={o.max}
        step={o.step}
        value={raid[key] as number}
        onChange={(v) => set({ [key]: Math.max(o.min ?? 0, v ?? 0) } as Partial<RaidConfig>)}
      />
    </Field>
  )
  const totalGifts = raid.gifts.reduce((n, g) => n + Math.max(0, g.weight), 0)
  return (
    <Box
      title="Raid Battles"
      hint="One raid a UTC day per player: the pool's mythicals to catch (their area cleared), then their shinies, then the fallback species of the regions reached. You and up to two friends, three Pokémon each; NPC trainers fill the empty sides."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {num('HP bars', 'bars', { min: 1, max: 6 })}
        {num('HP per bar', 'barHp', { min: 0.5, max: 5, step: 0.1, hint: 'In the raid Pokémon’s own max HP (2 = each bar holds twice its HP).' })}
        {num('Summons at the start', 'startAllies', { max: 6 })}
        {num('Summon points per bar', 'summonPerBreak', { max: 6 })}
        {num('Summons beside it at most', 'maxField', { min: 1, max: 4 })}
        {num('Raid level', 'level', { min: 1, max: 100 })}
        {num('Raid upgrade level', 'upgradeLevel', { min: 1, max: 10, hint: 'Dice and combos of the raid Pokémon and its summons.' })}
        {num('Team level cap', 'teamCap', { min: 1, max: 100 })}
        {num('Sides’ upgrade level', 'sideUpgradeLevel', { min: 1, max: 10 })}
        {num('Friends per raid', 'maxFriends', { max: 2 })}
        {num('Gifts per helper a day', 'helperDailyCap', { max: 20 })}
      </div>
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
      <details className="border-t-2 border-line pt-2">
        <summary className="cursor-pointer text-xl">Mythicals · {raid.pool.length}, each a raid (never shiny), with their lair</summary>
        <table className="mt-2 w-full text-lg">
          <tbody>
            {raid.pool.map((p, i) => (
              <tr key={i} className="border-t border-shadow/40">
                <td className="py-1 pr-2">
                  <NumInput
                    className="w-24"
                    min={1}
                    value={p.dex}
                    onChange={(v) => set({ pool: raid.pool.map((x, j) => (j === i ? { ...x, dex: Math.max(1, v ?? 1) } : x)) })}
                  />
                </td>
                <td className="pr-2">{name(p.dex)}</td>
                <td className="pr-2">
                  <select
                    className={inputCls}
                    value={p.areaId}
                    onChange={(e) => set({ pool: raid.pool.map((x, j) => (j === i ? { ...x, areaId: e.target.value } : x)) })}
                  >
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.regionId ?? 'kanto').toUpperCase()} · {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" className="px-2 text-lg text-danger" onClick={() => set({ pool: raid.pool.filter((_, j) => j !== i) })} aria-label="Remove">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="mt-2 px-2 py-1 text-lg shadow-ring"
          onClick={() => set({ pool: [...raid.pool, { dex: 151, areaId: areas[0]?.id ?? '' }] })}
        >
          + Add a mythical
        </button>
      </details>
      <RaidCalendarBox raid={raid} set={set} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Never an ally or a summon: pseudo-legendaries" hint="Dex numbers. Legendaries, mythicals and starter lines are always left out.">
          <DexList value={raid.exclude.pseudo} onChange={(pseudo) => set({ exclude: { ...raid.exclude, pseudo } })} />
        </Field>
        <Field label="… and these" hint="Ultra Beasts, Paradox Pokémon…">
          <DexList value={raid.exclude.extra} onChange={(extra) => set({ exclude: { ...raid.exclude, extra } })} />
        </Field>
      </div>
      <Field label="Helpers’ gifts (a friend who fought beside you, once the raid Pokémon is caught)">
        <table className="w-full text-lg">
          <tbody>
            {raid.gifts.map((g, i) => (
              <tr key={i} className="border-t border-shadow/40">
                <td className="py-1 pr-2">
                  <select
                    className={inputCls}
                    value={g.key}
                    onChange={(e) => set({ gifts: raid.gifts.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })}
                  >
                    {Object.values(data?.items ?? {}).map((it) => (
                      <option key={it.key} value={it.key}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="pr-2">
                  <NumInput
                    className="w-24"
                    min={0}
                    value={g.weight}
                    onChange={(v) => set({ gifts: raid.gifts.map((x, j) => (j === i ? { ...x, weight: Math.max(0, v ?? 0) } : x)) })}
                  />
                </td>
                <td className="pr-2 font-mono">{totalGifts ? `${Math.round((Math.max(0, g.weight) * 100) / totalGifts)} %` : '—'}</td>
                <td>
                  <button type="button" className="px-2 text-lg text-danger" onClick={() => set({ gifts: raid.gifts.filter((_, j) => j !== i) })} aria-label="Remove">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="mt-2 px-2 py-1 text-lg shadow-ring" onClick={() => set({ gifts: [...raid.gifts, { key: 'potion', weight: 10 }] })}>
          + Add a gift
        </button>
      </Field>
      <RaidSim raid={raid} />
    </Box>
  )
}

export function EventsSection() {
  const [cfg, set] = useEventsConfig()
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Special events" icon="star"
        hint="Each event shows up on Home once it's on and its area is cleared, in this order, with a pop-up the first time. Saved with the rest of the config (Publish)."
      >
        <Field label="Teaser from this many Kanto badges" hint="Before the first event opens, Home shows a locked square naming its area.">
          <NumInput value={cfg.teaserBadges} min={0} max={8} onChange={(v) => set({ teaserBadges: v ?? 0 })} />
        </Field>
        {EVENT_IDS.map((id) => (
          <EventRow key={id} id={id} def={cfg[id]} set={(patch) => set({ [id]: { ...cfg[id], ...patch } })} />
        ))}
      </Box>
      <WheelBox prizes={cfg.wheel.prizes} set={(prizes) => set({ wheel: { ...cfg.wheel, prizes } })} />
      <RaidBox raid={cfg.raid} set={(patch) => set({ raid: { ...cfg.raid, ...patch } })} />
      <RebattleBox tiers={cfg.rebattle.tiers} set={(tiers) => set({ rebattle: { ...cfg.rebattle, tiers } })} />
    </div>
  )
}
