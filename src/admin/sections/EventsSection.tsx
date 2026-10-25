// Admin → Events (docs/18, docs/19, docs/20, docs/21): sub-tabs. General: the special events' switches, Home order,
// unlock areas, banner pictures and the rules their unlock pop-up lists (one game_config row, `events`); then one tab
// per event.
import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DEFAULT_CONFIG,
  EVENT_IDS,
  REBATTLE_TIER_IDS,
  prizeChances,
  roulettePrizes,
  wheelAverage,
  wheelSlices,
  type EventAccess,
  type EventDef,
  type EventId,
  type EventsConfig,
  type GameData,
  type RebattleLineups,
  type RebattleTier,
  type RebattleTierId,
  type Trainer,
  type WheelConfig,
  type WheelJackpot,
  type WheelPrize,
  type WheelReward,
} from '@/engine'
import { PixelIcon, type IconName } from '@/components/icons'
import { spriteUrlFor } from '@/components/SpriteImg'
import { WheelStage } from '@/fx/wheel'
import { money } from '@/lib/format'
import { bannerUrl, RewardIcon } from '@/screens/events/shared'
import { cx } from '@/theme/util'
import { useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, PicturePicker, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'
import { RaidsTab } from './events/RaidsTab'
import { SmallWorldsTab } from './events/SmallWorldsTab'
import { TrickOrTreatTab } from './events/TrickOrTreatTab'
import { LiveEventsSection } from './LiveEventsSection'

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
  return (
    <div className="grid gap-3 border-t-2 border-line pt-3 md:grid-cols-[minmax(0,1fr)_200px]">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <span className="text-xl">{NAMES[id]}</span>
          <AccessSwitch value={def.access ?? 'off'} onChange={(access) => set({ access })} label={`${NAMES[id]}: who sees it`} />
        </div>
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
          <PicturePicker value={def.banner} onChange={(banner) => set({ banner })} />
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
          : r.kind === 'pokemon'
            ? { reward: r, sprite: spriteUrlFor(r.dex, 'front', !!r.shiny), label: '' }
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

/** A prize to pick: ₽, an item, or (for the jackpot) a Pokémon, with its amount, quantity or dex, level and shiny. */
function RewardPicker({ reward, set, pokemon }: { reward: WheelReward; set: (r: WheelReward) => void; pokemon?: boolean }) {
  const data = useAdminData()
  const items = Object.values(data?.items ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  const r = reward
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden">{data && <RewardIcon reward={r} data={data} size={r.kind === 'pokemon' ? 40 : 28} />}</span>
      <select
        className={cx(inputCls, 'min-w-[150px]')}
        value={r.kind === 'item' ? r.key : r.kind}
        onChange={(e) => {
          const v = e.target.value
          set(
            v === 'gold'
              ? { kind: 'gold', amount: r.kind === 'gold' ? r.amount : 50 }
              : v === 'pokemon'
                ? { kind: 'pokemon', dex: r.kind === 'pokemon' ? r.dex : 137, level: r.kind === 'pokemon' ? r.level : 30 }
                : { kind: 'item', key: v, qty: r.kind === 'item' ? r.qty : 1 },
          )
        }}
      >
        <option value="gold">Pokédollars</option>
        {pokemon && <option value="pokemon">A Pokémon</option>}
        {items.map((it) => (
          <option key={it.key} value={it.key}>
            {it.name}
          </option>
        ))}
      </select>
      {r.kind === 'pokemon' ? (
        <>
          <span className="text-base">#</span>
          <NumInput className="w-20" min={1} value={r.dex} onChange={(v) => set({ ...r, dex: Math.max(1, Math.round(v ?? 1)) })} />
          <span className="text-base">Lv.</span>
          <NumInput className="w-16" min={1} max={100} value={r.level} onChange={(v) => set({ ...r, level: Math.min(100, Math.max(1, Math.round(v ?? 1))) })} />
          <label className="flex items-center gap-1 text-base">
            <input type="checkbox" checked={!!r.shiny} onChange={(e) => set({ ...r, shiny: e.target.checked || undefined })} />
            shiny
          </label>
          <span className="text-base text-muted">{data?.species[r.dex]?.name ?? '?'}</span>
        </>
      ) : (
        <NumInput
          className="w-24"
          min={1}
          value={r.kind === 'gold' ? r.amount : r.qty}
          onChange={(v) => {
            const n = Math.max(1, Math.round(v ?? 1))
            set(r.kind === 'gold' ? { ...r, amount: n } : { ...r, qty: n })
          }}
        />
      )}
    </span>
  )
}

/**
 * The wheel (tickets since 2026-10-25): its tickets, its ordinary slices, the jackpot's stages, and what a spin pays
 * back on average at each stage, held to the cap.
 */
function WheelBox({ wheel, set }: { wheel: WheelConfig; set: (patch: Partial<WheelConfig>) => void }) {
  const data = useAdminData()
  const slices = wheel.slices
  const jackpot = wheel.jackpot ?? []
  const tickets = { ...DEFAULT_CONFIG.events.wheel.tickets, ...wheel.tickets }
  const chances = prizeChances(slices)
  const sum = slices.reduce((n, p) => n + Math.max(0, p.count) * Math.max(0, p.odds), 0)
  const setSlice = (i: number, patch: Partial<WheelPrize>) => set({ slices: slices.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const setStage = (i: number, patch: Partial<WheelJackpot>) => set({ jackpot: jackpot.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const pct = (x: number) => `${+x.toFixed(2)} %`
  const off = Math.abs(sum - 100) > 0.01
  const averages = data ? jackpot.map((_, i) => wheelAverage(wheel, i, data)) : []
  const over = averages.some((a) => a > tickets.maxAverage)
  return (
    <div className="flex flex-col gap-4">
      <Box title="Fortune Wheel — tickets" icon="coin" hint="A spin costs a ticket. Free ones come in on the server's clock up to the cap, where the clock stops; players buy more at the price while under it.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="A free ticket every (h)">
            <NumInput value={tickets.everyHours} min={1} onChange={(v) => set({ tickets: { ...tickets, everyHours: Math.max(1, v ?? 12) } })} />
          </Field>
          <Field label="Most held">
            <NumInput value={tickets.cap} min={1} max={20} onChange={(v) => set({ tickets: { ...tickets, cap: Math.max(1, Math.round(v ?? 4)) } })} />
          </Field>
          <Field label="Price (₽)">
            <NumInput value={tickets.price} min={0} onChange={(v) => set({ tickets: { ...tickets, price: Math.max(0, Math.round(v ?? 200)) } })} />
          </Field>
          <Field label="Average a spin, at most (₽)" hint="Every stage below is checked against it.">
            <NumInput value={tickets.maxAverage} min={0} onChange={(v) => set({ tickets: { ...tickets, maxAverage: Math.max(0, v ?? 150) } })} />
          </Field>
        </div>
      </Box>
      <Box title="Fortune Wheel — slices" icon="reroll" hint="Equal slices on the wheel. A prize takes as many slices as its count, each won that % of the time (scaled to share what the jackpot leaves). Spins are drawn on the player's device from this list: Publish before players spin.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-lg">
              <thead>
                <tr className="text-left">
                  <th className="font-normal">Prize</th>
                  <th className="font-normal">Slices</th>
                  <th className="font-normal">% each slice</th>
                  <th className="font-normal">Share without the jackpot</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slices.map((p, i) => (
                  <tr key={i} className="border-t border-shadow/40">
                    <td className="py-1 pr-2">
                      <RewardPicker reward={p.reward} set={(reward) => setSlice(i, { reward })} />
                    </td>
                    <td className="pr-2">
                      <NumInput className="w-20" min={0} value={p.count} onChange={(v) => setSlice(i, { count: Math.max(0, Math.round(v ?? 0)) })} />
                    </td>
                    <td className="pr-2">
                      <NumInput className="w-24" min={0} step={0.5} value={p.odds} onChange={(v) => setSlice(i, { odds: Math.max(0, v ?? 0) })} />
                    </td>
                    <td className="pr-2 font-mono">{pct(chances[i]!)}</td>
                    <td>
                      <button type="button" className="px-2 text-lg text-danger" onClick={() => set({ slices: slices.filter((_, j) => j !== i) })} aria-label="Remove this prize">
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
              onClick={() => set({ slices: [...slices, { reward: { kind: 'gold', amount: 50 }, count: 1, odds: 5 }] })}
            >
              + Add a prize
            </button>
          </div>
          {data && <WheelPreview prizes={roulettePrizes(wheel, 0)} data={data} />}
        </div>
        <p className={cx('text-lg', off && 'text-danger')}>
          Slices × odds add up to <b>{pct(sum)}</b>
          {off ? ': the game scales them to 100 %.' : '.'} {wheelSlices(slices).length} slices, plus the jackpot's.
        </p>
      </Box>
      <Box title="Fortune Wheel — jackpot" icon="masterball" hint="One slice, won exactly its % a spin. A Pokémon stage gives way to the next once the player has caught it (shiny: owns one shiny); an item stage stays for good. The value is what a Pokémon counts for in the average.">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-lg">
            <thead>
              <tr className="text-left">
                <th className="font-normal">Stage</th>
                <th className="font-normal">Prize</th>
                <th className="font-normal">% a spin</th>
                <th className="font-normal">Value (₽)</th>
                <th className="font-normal">Average a spin</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jackpot.map((j, i) => (
                <tr key={i} className="border-t border-shadow/40">
                  <td className="pr-2">{i + 1}</td>
                  <td className="py-1 pr-2">
                    <RewardPicker reward={j.reward} pokemon set={(reward) => setStage(i, { reward })} />
                  </td>
                  <td className="pr-2">
                    <NumInput className="w-24" min={0} max={99} step={0.25} value={j.odds} onChange={(v) => setStage(i, { odds: Math.min(99, Math.max(0, v ?? 0)) })} />
                  </td>
                  <td className="pr-2">
                    <NumInput className="w-24" min={0} value={j.value} onChange={(v) => setStage(i, { value: Math.max(0, Math.round(v ?? 0)) })} />
                  </td>
                  <td className={cx('pr-2 font-mono', averages[i]! > tickets.maxAverage && 'text-danger')}>{averages[i] != null ? money(Math.round(averages[i]!)) : '…'}</td>
                  <td>
                    <button type="button" className="px-2 text-lg text-danger" onClick={() => set({ jackpot: jackpot.filter((_, k) => k !== i) })} aria-label="Remove this stage">
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
            onClick={() => set({ jackpot: [...jackpot, { reward: { kind: 'item', key: 'master-ball', qty: 1 }, odds: 0.25, value: 0 }] })}
          >
            + Add a stage
          </button>
        </div>
        <p className={cx('text-lg', over && 'text-danger')}>
          {over
            ? `A stage pays back more than ${money(tickets.maxAverage)} a spin on average: lower its odds or the slices' prizes.`
            : `Every stage pays back ${money(tickets.maxAverage)} a spin or less on average (items at their Mart price).`}
        </p>
      </Box>
    </div>
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
      hint="A region's League again in four tiers (Bronze, Silver, Gold, Diamond), once its League is won. Each tier is a gauntlet in this order; a loss starts it over. Each Pokémon pays once per tier (a League trainer's ₽ × the tier's multiplier). Teams, levels and potions are the trainers' own (Trainers section). Kanto's Champion seat lists one rival per starter: the player meets theirs."
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
          <div className="mt-2 grid gap-3 lg:grid-cols-4">
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

const TABS = [
  { id: 'general', label: 'General', icon: 'gear' },
  { id: 'wheel', label: 'Fortune Wheel', icon: 'coin' },
  { id: 'raids', label: 'Raids', icon: 'star' },
  { id: 'rebattle', label: 'Elite Rebattle', icon: 'trophy' },
  { id: 'live', label: 'Live events', icon: 'sparkle' },
  { id: 'worlds', label: 'Small worlds', icon: 'map' },
  { id: 'trick', label: 'Trick or Treat', icon: 'pumpkin' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[]
type TabId = (typeof TABS)[number]['id']
const ACCESS_SHORT: Record<EventAccess, string> = { off: 'Off', admin: 'Admin', all: 'On' }

/**
 * Admin → Events: General (every event's switch, Home order, unlock area, banner and pop-up rules), then one tab per
 * event with all its numbers. The tab is in the address (?tab=raids), so a reload stays on it.
 */
export function EventsSection() {
  const [cfg, set] = useEventsConfig()
  const [live] = useConfigRow('liveEvents')
  const [worlds] = useConfigRow('smallWorlds')
  const [trick] = useConfigRow('trickOrTreat')
  const [params, setParams] = useSearchParams()
  const tab: TabId = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as TabId) : 'general'
  const access = (id: TabId): EventAccess | null =>
    id === 'wheel'
      ? cfg.wheel.access
      : id === 'raids'
        ? cfg.raid.access
        : id === 'rebattle'
          ? cfg.rebattle.access
          : id === 'live'
            ? (live?.access ?? 'off')
            : id === 'worlds'
              ? (worlds?.access ?? 'off')
              : id === 'trick'
                ? (trick?.access ?? 'off')
                : null
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Events" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const a = access(t.id)
          return (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setParams({ tab: t.id }, { replace: true })}
              className={cx(
                'flex min-h-[44px] items-center gap-2 px-3 text-xl leading-none shadow-card',
                tab === t.id ? 'bg-gold-pale shadow-card-gold' : 'bg-panel',
              )}
            >
              <PixelIcon name={t.icon} size={20} />
              {t.label}
              {a && (
                <span className={cx('px-1.5 py-0.5 text-sm leading-none', a === 'all' ? 'bg-good text-white' : a === 'admin' ? 'bg-gold text-ink' : 'bg-well-deep text-ink')}>
                  {ACCESS_SHORT[a]}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      {tab === 'general' && (
        <Box
          title="Special events" icon="star"
          hint="Each event is off until you switch it on: for you alone (signed in as admin, to try it in production first) or for everyone. Then it shows up on Home once its area is cleared, in this order, with a pop-up the first time. Saved with the rest of the config (Publish)."
        >
          <Field label="Teaser from this many Kanto badges" hint="Before the first event opens, Home shows a locked square naming its area.">
            <NumInput value={cfg.teaserBadges} min={0} max={8} onChange={(v) => set({ teaserBadges: v ?? 0 })} />
          </Field>
          {EVENT_IDS.map((id) => (
            <EventRow key={id} id={id} def={cfg[id]} set={(patch) => set({ [id]: { ...cfg[id], ...patch } })} />
          ))}
          <LiveSwitchRow />
          <WorldsSwitchRow />
        </Box>
      )}
      {tab === 'wheel' && <WheelBox wheel={cfg.wheel} set={(patch) => set({ wheel: { ...cfg.wheel, ...patch } })} />}
      {tab === 'raids' && <RaidsTab raid={cfg.raid} set={(patch) => set({ raid: { ...cfg.raid, ...patch } })} />}
      {tab === 'rebattle' && <RebattleBox tiers={cfg.rebattle.tiers} set={(tiers) => set({ rebattle: { ...cfg.rebattle, tiers } })} />}
      {tab === 'live' && <LiveEventsSection />}
      {tab === 'worlds' && <SmallWorldsTab />}
      {tab === 'trick' && <TrickOrTreatTab />}
    </div>
  )
}

/** Live events' switch, beside the other events' (their list and editor are on their tab). */
function LiveSwitchRow() {
  const [raw, setRaw] = useConfigRow('liveEvents')
  return (
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-line pt-3">
      <span className="text-xl">Live events</span>
      <AccessSwitch value={raw?.access ?? 'off'} onChange={(access) => setRaw({ list: raw?.list ?? [], access })} label="Live events: who sees them" />
      <span className="text-base text-muted">Shiny Parade, Special Shop, Cash Flow: scheduled on their tab.</span>
    </div>
  )
}

/** Small worlds' switch, beside the other events' (their list and editor are on their tab). */
function WorldsSwitchRow() {
  const [raw, setRaw] = useConfigRow('smallWorlds')
  return (
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-line pt-3">
      <span className="text-xl">Small worlds</span>
      <AccessSwitch value={raw?.access ?? 'off'} onChange={(access) => setRaw({ ...raw, list: raw?.list ?? [], access })} label="Small worlds: who sees them" />
      <span className="text-base text-muted">A region of its own for a while, a shiny mythical at its end: scheduled on their tab. First on Home.</span>
    </div>
  )
}
