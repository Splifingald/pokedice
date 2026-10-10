// Admin → Events (docs/18, docs/19): the special events' switches, Home order, unlock areas, banner pictures and the
// rules their unlock pop-up lists. One game_config row, `events`; each event's own numbers get their box as it's built.
import { useEffect, useMemo, useRef } from 'react'
import {
  DEFAULT_CONFIG,
  EVENT_IDS,
  REBATTLE_TIER_IDS,
  prizeChances,
  wheelSlices,
  type EventDef,
  type EventId,
  type EventsConfig,
  type GameData,
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
      title="Fortune Wheel — prizes"
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
      title="Elite Rebattle — tiers and lineups"
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
      <WheelBox prizes={cfg.wheel.prizes} set={(prizes) => set({ wheel: { ...cfg.wheel, prizes } })} />
      <RebattleBox tiers={cfg.rebattle.tiers} set={(tiers) => set({ rebattle: { ...cfg.rebattle, tiers } })} />
    </div>
  )
}
