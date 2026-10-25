import { useMemo, useState } from 'react'
import {
  DEFAULT_CONFIG,
  eggSpecies,
  eggsPerWeek,
  extremeRules,
  isDonationUrl,
  enabledRegions,
  pityMultiplier,
  slotOdds,
  slotReturnPerSpin,
  xpToNext,
  type DayCareConfig,
  type DoubleBattlesConfig,
  type DonationConfig,
  type EnergyConfig,
  type EventAccess,
  type ExtremeConfig,
  type GameConfig,
  type GeneralConfig,
  type PityConfig,
  type SlotMachineConfig,
  type SlotOutcomeKey,
  type StatusRules,
  type TradeConfig,
  INVITE_FRIENDS_MAX,
  INVITE_TIERS_MAX,
  inviteTiers,
  type InviteRewardsConfig,
} from '@/engine'
import { PixelIcon, type IconName } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { cx } from '@/theme/util'
import { DataTable } from '../DataTable'
import { GiftEditor, giftName } from '../GiftEditor'
import { addRows, rowKey, updateRow, useAdmin, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, inputCls } from '../widgets'
import { PushBox } from './PushBox'

export function useConfigRow<K extends keyof GameConfig>(key: K): [GameConfig[K], (v: GameConfig[K]) => void] {
  const rows = useAdmin((st) => st.rows.game_config)
  const row = rows.find((r) => r.key === key)
  const value = (row ? row.value : DEFAULT_CONFIG[key]) as GameConfig[K]
  const set = (v: GameConfig[K]) => {
    if (row) updateRow('game_config', rowKey('game_config', row), { value: v })
    else addRows('game_config', [{ key, value: v }])
  }
  return [value, set]
}

const SLOT_ROWS: { key: SlotOutcomeKey; balls: number; label: string }[] = [
  { key: 'oneBall', balls: 1, label: '1 Poké Ball' },
  { key: 'twoBalls', balls: 2, label: '2 Poké Balls' },
  { key: 'threeBalls', balls: 3, label: '3 Poké Balls' },
  { key: 'jackpot', balls: 0, label: '3 prize Pokémon (jackpot)' },
]

/** Game Corner (Rocket Hideout): the slot machine's price, what each result pays, and how often it comes up. */
function SlotMachineBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('slotMachine')
  const cfg: SlotMachineConfig = { ...DEFAULT_CONFIG.slotMachine, ...raw }
  const odds = slotOdds(cfg)
  const back = slotReturnPerSpin(cfg)
  const set = (patch: Partial<SlotMachineConfig>) => setRaw({ ...cfg, ...patch })
  const setOutcome = (k: SlotOutcomeKey, patch: Partial<SlotMachineConfig[SlotOutcomeKey]>) => set({ [k]: { ...cfg[k], ...patch } })
  const prize = data?.species[cfg.prizeDex]?.name ?? `#${cfg.prizeDex}`
  const pct = (x: number) => `${Math.round(x * 1000) / 10} %`
  return (
    <Box
      title="Game Corner — slot machine" icon="coin"
      hint="Played on the Game Corner cards (Areas → Encounter deck). The result is drawn from these weights, then the reels are laid out to show it. Off: no Game Corner card is dealt anywhere (the Fortune Wheel gives Porygon instead)."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xl">Game Corner</span>
        <AccessSwitch value={cfg.access ?? 'off'} onChange={(access) => set({ access })} label="Game Corner: who meets its cards" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cost per spin (₽)">
          <NumInput min={0} value={cfg.cost} onChange={(v) => set({ cost: Math.max(0, v ?? 0) })} />
        </Field>
        <Field label="Prize Pokémon" className="sm:col-span-2">
          {data && <PokemonPicker data={data} value={cfg.prizeDex} onChange={(dex) => set({ prizeDex: dex })} />}
        </Field>
        <Field label="Prize level">
          <NumInput min={1} max={100} value={cfg.prizeLevel} onChange={(v) => set({ prizeLevel: Math.max(1, Math.min(100, v ?? 1)) })} />
        </Field>
      </div>
      <table className="w-full text-lg">
        <thead>
          <tr className="text-left">
            <th className="font-normal">Result</th>
            <th className="font-normal">Weight</th>
            <th className="font-normal">Chance</th>
            <th className="font-normal">Pays (₽)</th>
          </tr>
        </thead>
        <tbody>
          {SLOT_ROWS.map((r) => (
            <tr key={r.key} className="border-t border-shadow/40">
              <td className="py-1 pr-2">
                <span className="flex items-center gap-1">
                  {r.balls
                    ? Array.from({ length: r.balls }, (_, j) => <PixelIcon key={j} name="ball" size={16} />)
                    : [0, 1, 2].map((j) => <SpriteImg key={j} dex={cfg.prizeDex} size={24} />)}
                  <span className="ml-1">{r.label}</span>
                </span>
              </td>
              <td className="pr-2">
                <NumInput className="w-24" min={0} value={cfg[r.key].weight} onChange={(v) => setOutcome(r.key, { weight: Math.max(0, v ?? 0) })} />
              </td>
              <td className="pr-2 font-mono">{pct(odds[r.key])}</td>
              <td>
                <NumInput className="w-24" min={0} value={cfg[r.key].gold} onChange={(v) => setOutcome(r.key, { gold: Math.max(0, v ?? 0) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-base text-muted">
        Weights are relative (they needn't add up to 100). The jackpot gives {prize} Lv.{cfg.prizeLevel}: it joins the team
        (or the Box), or replaces a weaker {prize} you own. Its gold is paid only when you already have {prize} at that
        level or above.
      </p>
      <p className={cx('text-lg', back >= cfg.cost ? 'text-danger' : '')}>
        Pays back <b>₽{back.toFixed(2)}</b> per ₽{cfg.cost} spin on average ({cfg.cost ? pct(back / cfg.cost) : '—'}
        ){odds.jackpot > 0 && <> · {prize} about every {Math.round(1 / odds.jackpot)} spins</>}
        {back >= cfg.cost && ' · players make money on this machine!'}
      </p>
    </Box>
  )
}

/** Energy: the cost of exploring. 1 per encounter discovered; gyms, legendaries and Pokémon Centers are free. */
function EnergyBox() {
  const [raw, setRaw] = useConfigRow('energy')
  const cfg: EnergyConfig = { ...DEFAULT_CONFIG.energy, ...raw }
  const set = (patch: Partial<EnergyConfig>) => setRaw({ ...cfg, ...patch })
  const perDay = cfg.minutesPerEnergy > 0 ? (24 * 60) / cfg.minutesPerEnergy : 0
  return (
    <Box
      title="Energy" icon="energy"
      hint="Each encounter discovered costs 1 (not gym / Elite / Champion battles, legendaries or Pokémon Centers). Refills in real time, offline too."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-lg">
          <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> enabled
        </label>
        <Field label="Max (and start)">
          <NumInput min={1} value={cfg.max} onChange={(v) => set({ max: Math.max(1, v ?? 50) })} />
        </Field>
        <Field label="Minutes per energy">
          <NumInput min={1} value={cfg.minutesPerEnergy} onChange={(v) => set({ minutesPerEnergy: Math.max(1, v ?? 30) })} />
        </Field>
      </div>
      <p className="text-lg">
        {perDay.toFixed(1)} energy per day · empty to full in {((cfg.max * cfg.minutesPerEnergy) / 60).toFixed(1)} h
      </p>
    </Box>
  )
}

/** A pity: what a player hasn't got from an area yet climbs in odds with the rounds they have done there. */
function PityBox({
  configKey,
  title,
  icon,
  hint,
}: {
  configKey: 'uniquePity' | 'newPokemonPity'
  title: string
  icon: IconName
  hint: string
}) {
  const [raw, setRaw] = useConfigRow(configKey)
  const cfg: PityConfig = { ...DEFAULT_CONFIG[configKey], ...raw }
  const set = (patch: Partial<PityConfig>) => setRaw({ ...cfg, ...patch })
  const mid = Math.round((cfg.startRounds + cfg.fullRounds) / 2)
  return (
    <Box title={title} icon={icon} hint={hint}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Starts after (rounds)" hint="×1 up to here">
          <NumInput min={0} value={cfg.startRounds} onChange={(v) => set({ startRounds: Math.max(0, v ?? 5) })} />
        </Field>
        <Field label="Full at (rounds)" hint="rises linearly until here">
          <NumInput min={0} value={cfg.fullRounds} onChange={(v) => set({ fullRounds: Math.max(0, v ?? 50) })} />
        </Field>
        <Field label="Max ×" hint="1 = no pity">
          <NumInput min={1} step={0.5} value={cfg.maxMultiplier} onChange={(v) => set({ maxMultiplier: Math.max(1, v ?? 10) })} />
        </Field>
      </div>
      <p className="text-lg">
        {[cfg.startRounds, mid, cfg.fullRounds]
          .map((r) => `${r} rounds ×${pityMultiplier(r, cfg).toFixed(1)}`)
          .join(' · ')}
      </p>
    </Box>
  )
}

/**
 * "Support me": the developer's pop-up (Discord, invite, Ko-fi), behind the SUPPORT ME button. Each player also sees
 * it once per region, when its 5th badge is won. The monthly goal and currency only feed the weekly #support-me post
 * on Discord (docs/23 §11).
 * Ticking the reset bumps the round, so on the next Save + Publish everyone who has seen it gets it once more; the
 * box then reads unticked again, ready for the next time.
 */
function DonationBox() {
  const [raw, setRaw] = useConfigRow('donation')
  const cfg: DonationConfig = { ...DEFAULT_CONFIG.donation, ...raw }
  const set = (patch: Partial<DonationConfig>) => setRaw({ ...cfg, ...patch })
  const saved = useAdmin((st) => st.base.game_config.find((r) => r.key === 'donation')?.value as Partial<DonationConfig> | undefined)
  const savedRound = Number(saved?.round ?? 0)
  const url = cfg.kofiUrl.trim()
  const urlOk = isDonationUrl(url)
  return (
    <Box
      title="Support me (donations)" icon="heart"
      hint="The SUPPORT ME button (side menu, Settings) and its pop-up: join the Discord, invite friends, and a Ko-fi button to support the developer, saying the game itself can never be paid for. It also shows once per region, when its 5th badge is won, between fights. Save, then Publish, for players to get the change."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-lg">
          <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> enabled
        </label>
        <Field
          label="Ko-fi link"
          className="sm:col-span-2"
          hint={url && !urlOk ? 'Must start with https:// — the pop-up stays hidden until it does' : 'e.g. https://ko-fi.com/yourname · empty = the pop-up stays hidden'}
        >
          <input
            className={inputCls}
            type="url"
            placeholder="https://ko-fi.com/…"
            value={cfg.kofiUrl}
            onChange={(e) => set({ kofiUrl: e.target.value })}
          />
        </Field>
        <Field label="Monthly goal" hint="The weekly #support-me post's target · 0 = none">
          <NumInput min={0} value={cfg.monthlyGoal} onChange={(v) => set({ monthlyGoal: Math.max(0, v ?? 0) })} />
        </Field>
        <Field label="Currency" hint="Your Ko-fi page's, e.g. EUR">
          <input
            className={inputCls}
            maxLength={3}
            value={cfg.currency}
            onChange={(e) => set({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
          />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-lg">
        <input
          type="checkbox"
          className="mt-1.5"
          checked={cfg.round > savedRound}
          onChange={(e) => set({ round: e.target.checked ? savedRound + 1 : savedRound })}
        />
        <span>
          Reset — show it again to everyone
          <span className="block text-sm text-muted">
            Every player who has already seen it gets it once more, at their next quiet moment (those with a region at 5
            badges). Unticks itself once saved · reset {savedRound} time{savedRound === 1 ? '' : 's'} so far.
          </span>
        </span>
      </label>
      {cfg.enabled && !urlOk && <p className="text-lg text-danger">Enabled, but hidden from players until the Ko-fi link is set.</p>}
    </Box>
  )
}

/** The community Discord: its invite link puts a button in the player menu (the avatar's side panel). */
function DiscordBox() {
  const [raw, setRaw] = useConfigRow('discordUrl')
  const value = String(raw ?? '')
  const url = value.trim()
  const urlOk = isDonationUrl(url)
  return (
    <Box
      title="Discord" icon="discord"
      hint="A Discord button in the player menu (click the avatar, top right). Save, then Publish, for players to get the change."
    >
      <Field
        label="Invite link"
        hint={url && !urlOk ? 'Must start with https:// — the button stays hidden until it does' : 'e.g. https://discord.gg/… · empty = no button'}
      >
        <input
          className={inputCls}
          type="url"
          placeholder="https://discord.gg/…"
          value={value}
          onChange={(e) => setRaw(e.target.value)}
        />
      </Field>
    </Box>
  )
}

/**
 * Pokémon Day Care, one for every region: when it opens, how fast residents train, the friend slots, the two Egg
 * checks, Egg now and what Eggs hatch into.
 */
/**
 * Extreme mode (docs/22): the second save that a league opens, with no Pokémon Centers, K.O.s that rest for hours and
 * healing only while the player is away. Every number here is read by the game's engine (engine/extreme).
 */
/**
 * Day and night in Johto (docs/32): its switch. Each wild row's time is set in Areas → its wild pool (Time); the tags
 * from the real games came with migration 0061.
 */
function DayNightBox() {
  const [cfg, set] = useConfigRow('dayNight')
  const access = cfg?.access ?? 'off'
  return (
    <Box
      title="Day and night"
      icon="moon"
      hint="Johto keeps the time (docs/32): 6:00–17:59 is the day and 18:00–5:59 the night, on the player's clock. A wild Pokémon whose Time says day or night (Areas → wild pool) comes only then, as in the real games; the top bar shows the sun or the moon, and so do the fights."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Who has it</span>
        <AccessSwitch value={access} onChange={(a) => set({ access: a })} label="Day and night: who has it" />
        <span className="text-base text-muted">
          {access === 'all'
            ? 'Every player: Johto’s wild Pokémon follow the time, and the sun or the moon shows.'
            : access === 'admin'
              ? 'Only you (signed in) have it; other players meet every Pokémon at any hour.'
              : 'Off: every Pokémon at any hour, no sun or moon anywhere. The tags stay in the pools.'}
        </span>
      </div>
    </Box>
  )
}

function ExtremeBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('extreme')
  // An early draft had an on/off `enabled`: the three-way switch (`access`) replaced it, so it goes on the next edit.
  const { enabled: _enabled, ...kept } = (raw ?? {}) as ExtremeConfig & { enabled?: boolean }
  const cfg: ExtremeConfig = { ...DEFAULT_CONFIG.extreme, ...kept }
  const set = (patch: Partial<ExtremeConfig>) => setRaw({ ...cfg, ...patch })
  const num = (k: 'koHours' | 'koReviveHp' | 'awayHealPctPerHour' | 'awayMinMinutes', min = 0, max?: number) => (
    <NumInput min={min} max={max} value={cfg[k]} onChange={(v) => set({ [k]: Math.max(min, Math.min(max ?? Infinity, v ?? min)) })} />
  )
  const check = (k: 'centers' | 'wipeHeals' | 'items', label: string) => (
    <label className="flex items-center gap-2 text-lg">
      <input type="checkbox" checked={!!cfg[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}
    </label>
  )
  const r = data ? extremeRules({ ...data, config: { ...data.config, extreme: cfg } }) : null
  return (
    <Box
      title="Extreme mode" icon="skull"
      hint="A second save, opened by a league of the main one: a world of its own (its own board, Versus and events; the same friends), with no Pokémon Centers."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Who can play it</span>
        <AccessSwitch value={cfg.access ?? 'off'} onChange={(access) => set({ access })} label="Extreme mode: who can play it" />
        <span className="text-base text-muted">
          {cfg.access === 'all'
            ? 'Open to every player who has beaten the league.'
            : cfg.access === 'admin'
              ? 'Only you see it (to try it first). Players see nothing yet.'
              : 'Off: no way in anywhere in the game. Extreme saves already made are kept.'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {check('centers', 'Pokémon Centers')}
        {check('wipeHeals', 'a lost round heals')}
        {check('items', 'Potions and Revives')}
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Opens after the league of" hint="in the main save">
          <select className={inputCls} value={cfg.unlockRegion} onChange={(e) => set({ unlockRegion: e.target.value })}>
            {(data?.regions ?? []).map((reg) => (
              <option key={reg.id} value={reg.id}>
                {reg.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="A K.O. lasts (hours)" hint="real time, on the server's clock">
          {num('koHours', 0)}
        </Field>
        <Field label="Comes back with (HP)">{num('koReviveHp', 1)}</Field>
        <Field label="Heals while away (% / hour)" hint="of max HP, to the minute; 0 = never">
          {num('awayHealPctPerHour', 0, 100)}
        </Field>
        <Field label="Shortest absence (minutes)" hint="shorter ones don't heal">
          {num('awayMinMinutes', 0)}
        </Field>
      </div>
      {r && (
        <p className="text-lg">
          A K.O. Pokémon is back at {r.koHp} HP after {r.koHours} h.{' '}
          {r.fullHours != null ? `From ${r.koHp} HP to full while away: about ${r.fullHours} h.` : 'Nothing heals with time.'} While
          playing: never.{!cfg.centers && ' No Pokémon Center is ever dealt.'}
        </p>
      )}
    </Box>
  )
}

/**
 * Double battles (docs/33): the switch, the regions where they happen and how often a wild Pokémon comes with a
 * partner. Duo trainers are ticked in Trainers (Duo); Elite Four and Champions never fight 2 v 2.
 */
function DoubleBattlesBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('doubleBattles')
  const cfg: DoubleBattlesConfig = { ...DEFAULT_CONFIG.doubleBattles, ...(raw ?? {}) }
  const set = (patch: Partial<DoubleBattlesConfig>) => setRaw({ ...cfg, ...patch })
  const toggle = (id: string, on: boolean) =>
    set({ regions: on ? [...new Set([...cfg.regions, id])] : cfg.regions.filter((r) => r !== id) })
  return (
    <Box
      title="Double battles"
      icon="vs"
      hint="Two of yours against two foes. Wild Pokémon sometimes come in pairs; duo trainers (Trainers → Duo) and Tate & Liza always fight 2 v 2. Never in Extreme mode, small worlds, the portal run or the nightmare."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Who gets them</span>
        <AccessSwitch value={cfg.access ?? 'off'} onChange={(access) => set({ access })} label="Double battles: who gets them" />
        <span className="text-base text-muted">
          {cfg.access === 'all'
            ? 'On for every player, in the regions ticked below.'
            : cfg.access === 'admin'
              ? 'Only you get them (to try them first). Players fight one on one.'
              : 'Off: every battle is one on one.'}
        </span>
      </div>
      <Field label="Regions" hint="where double battles happen">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(data?.regions ?? []).map((reg) => (
            <label key={reg.id} className="flex items-center gap-2 text-lg">
              <input type="checkbox" checked={cfg.regions.includes(reg.id)} onChange={(e) => toggle(reg.id, e.target.checked)} />
              {reg.name}
            </label>
          ))}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Wild pairs (%)" hint="of the wild encounters in those regions">
          <NumInput
            min={0}
            max={100}
            value={cfg.wildChance}
            onChange={(v) => set({ wildChance: Math.max(0, Math.min(100, v ?? 0)) })}
          />
        </Field>
      </div>
    </Box>
  )
}

/**
 * Trades (docs/23): the three-way switch, the numbers, the trade evolutions (a pair taken off evolves by level again)
 * and the species that can never be traded (the Ultra Beasts; legendaries and mythicals always are out).
 */
function TradesBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('trade')
  const cfg: TradeConfig = { ...DEFAULT_CONFIG.trade, ...(raw ?? {}) }
  const set = (patch: Partial<TradeConfig>) => setRaw({ ...cfg, ...patch })
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [out, setOut] = useState<number | null>(null)
  const num = (k: 'maxListings' | 'listingDays' | 'tradesPerDay' | 'levelCap' | 'minBadges', min = 0, max?: number) => (
    <NumInput min={min} max={max} value={cfg[k]} onChange={(v) => set({ [k]: Math.max(min, Math.min(max ?? Infinity, v ?? min)) })} />
  )
  const name = (dex: number) => data?.species[dex]?.name ?? `#${dex}`
  return (
    <Box
      title="Trades" icon="trade"
      hint="Listings, like the games' GTS: a player puts a Pokémon up and says what they want; anyone allowed takes it while they're away. The server checks the switch too."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Who can trade</span>
        <AccessSwitch value={cfg.access ?? 'off'} onChange={(access) => set({ access })} label="Trades: who can trade" />
        <span className="text-base text-muted">
          {cfg.access === 'all'
            ? 'Open to every signed-in player with enough badges.'
            : cfg.access === 'admin'
              ? 'Only you see it (to try it first). Players see nothing yet.'
              : 'Off: no row, no pop-up, no link that works. Open listings still end and come back.'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Open listings at most" hint="per player">{num('maxListings', 1, 20)}</Field>
        <Field label="A listing lasts (days)" hint="then its Pokémon comes back">{num('listingDays', 1, 30)}</Field>
        <Field label="Trades taken a day" hint="per player, UTC days">{num('tradesPerDay', 1, 100)}</Field>
        <Field label="Level cap" hint="traded Pokémon arrive at most at">{num('levelCap', 1, 100)}</Field>
        <Field label="Badges needed" hint="every region's counted">{num('minBadges', 0, 100)}</Field>
      </div>
      <div className="grid gap-2">
        <span className="text-lg">Evolve when traded (never by level)</span>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {cfg.evolveOnTrade.map(([a, b], i) => (
            <li key={`${a}-${b}`} className="flex items-center gap-1 bg-paper py-0.5 pl-2 pr-1 shadow-ring-line">
              <span className="text-base">
                {name(a)} → {name(b)}
              </span>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center text-lg"
                aria-label={`Remove ${name(a)} → ${name(b)}`}
                onClick={() => set({ evolveOnTrade: cfg.evolveOnTrade.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <PokemonPicker data={data} value={from} onChange={setFrom} className="w-56" />
            <span aria-hidden>→</span>
            <PokemonPicker data={data} value={to} onChange={setTo} className="w-56" />
            <PixelButton
              size="sm"
              disabled={!from || !to || cfg.evolveOnTrade.some(([a]) => a === from)}
              onClick={() => {
                if (!from || !to) return
                set({ evolveOnTrade: [...cfg.evolveOnTrade, [from, to]] })
                setFrom(null)
                setTo(null)
              }}
            >
              Add
            </PixelButton>
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <span className="text-lg">Never traded (besides legendaries and mythicals)</span>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {cfg.exclude.map((d) => (
            <li key={d} className="flex items-center gap-1 bg-paper py-0.5 pl-2 pr-1 shadow-ring-line">
              <span className="text-base">{name(d)}</span>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center text-lg"
                aria-label={`Remove ${name(d)}`}
                onClick={() => set({ exclude: cfg.exclude.filter((x) => x !== d) })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <PokemonPicker data={data} value={out} onChange={setOut} className="w-56" />
            <PixelButton
              size="sm"
              disabled={!out || cfg.exclude.includes(out)}
              onClick={() => {
                if (!out) return
                set({ exclude: [...cfg.exclude, out].sort((a, b) => a - b) })
                setOut(null)
              }}
            >
              Add
            </PixelButton>
          </div>
        )}
      </div>
    </Box>
  )
}

/** What each state of a switch means, for the line beside it. */
const accessNote = (access: EventAccess, all: string, off: string) =>
  access === 'all' ? all : access === 'admin' ? 'Only you see it (to try it first). Players see nothing yet.' : off

/**
 * Idle mode and the play styles (docs/36): Classic, Auto on explored areas, Idle. Off: auto-mode stays as it always was
 * (a cleared area's fights only). The game reads it on the player's device; no server function acts for it.
 */
function IdleModeBox() {
  const [raw, setRaw] = useConfigRow('idleMode')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Idle mode"
      icon="dice"
      hint="On: a new game first asks how to play (Classic, Auto on explored areas, Idle), Settings switches it any time, and auto-mode becomes the autopilot: it plays the whole area (fights, finds, Centers without team swaps, no items but Idle's Poké Balls, no Game Corner), moves on to the next area once one is cleared, and after a lost round plays one round of the area before, then goes back. Idle catches by itself (a new Pokémon with the cheapest ball at the best chance, never the Master Ball; one already owned is left); under Auto on explored areas catches wait for the player. Off: auto-mode as before, fights only, in cleared areas. Players' choices are kept either way."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Idle mode</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Idle mode: who has it" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: no play styles, auto-mode as before (fights only).')}
        </span>
      </div>
    </Box>
  )
}

/**
 * Recorded dice throws (docs/37): the dice land as replayed physics throws, a pixel cube turned to land on the engine's
 * face. Purely visual, so the game alone reads it. Off: the dice tumble as they always have.
 */
function DiceThrowsBox() {
  const [raw, setRaw] = useConfigRow('diceThrows')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Dice throws"
      icon="dice"
      hint="On: every thrown die (battles, catches, the Bait, the pickaxe, Trick or Treat, the title) is a little pixel cube thrown into its spot, bouncing and settling on the face the game rolled. Short animations play only its last bounce; a device asking for less motion gets a small drop with no spin. Off: the dice tumble as before. It changes how dice look, never what they roll."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Dice throws</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Dice throws: who has them" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: the dice tumble as before.')}
        </span>
      </div>
    </Box>
  )
}

/**
 * The raid overhaul (docs/40): each progression raid's own level, bars, rules and last bar, Arceus's daily raid, and
 * the Mega raids after Kalos (their gems no longer on the Mart's shelves). The server reads it for the Mega raids' keys.
 */
function RaidOverhaulBox() {
  const [raw, setRaw] = useConfigRow('raidOverhaul')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Raid overhaul"
      icon="star"
      hint="On: every progression raid fights at its own level (its team cap too) with its own bars, weather, rules (telegraphed attacks to interrupt, combo-only shields, type changes…) and a power on its last bar; Arceus's daily raid changes plate; and after Kalos, the raids of Mewtwo, Gyarados, Latias, Latios, Rayquaza, Kyogre, Groudon and Heatran get a Mega (or Primal) raid whose win is the only way to get their gem or orb (no longer sold). Admin → Raids' own numbers still win. Off: raids play exactly as before."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Raid overhaul</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Raid overhaul: who has it" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: raids as before.')}
        </span>
      </div>
    </Box>
  )
}

/**
 * The game-feel pass (docs/38): count-ups, combo tiers, hits that scale with what they do, the KO beat, the victory
 * payoff, the catch moments. Purely visual and audible, so the game alone reads it. Off: everything plays as before.
 */
function GameFeelBox() {
  const [raw, setRaw] = useConfigRow('gameFeel')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Game feel"
      icon="dice"
      hint="On: the damage counts up die by die, combos have four tiers, hits scale with how much they matter, the final blow lands harder, victories, badges, catches and upgrades are celebrated, and fights move faster between hits. Off: everything plays as before. It changes how things look and sound, never what happens."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Game feel</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Game feel: who has it" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: everything plays as before.')}
        </span>
      </div>
    </Box>
  )
}

/** Haptics (docs/38): short vibrations on dice, hits and catches. Android only; iOS browsers can't vibrate. */
function HapticsBox() {
  const [raw, setRaw] = useConfigRow('haptics')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Haptics"
      icon="energy"
      hint="On: short vibrations when a die is picked or lands, on hits (stronger for bigger ones), a KO, each catch wobble and a catch, with a switch in Settings. Android browsers only: iOS Safari can't vibrate. Calm devices (reduce motion) get none."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Haptics</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Haptics: who has it" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: no vibrations, no Settings row.')}
        </span>
      </div>
    </Box>
  )
}

/** Battle music (docs/38): an original 8-bit loop under fights, synthesised like the effects. */
function MusicBox() {
  const [raw, setRaw] = useConfigRow('music')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Battle music"
      icon="sound"
      hint="On: an original 8-bit loop plays under fights, synthesised on the device like the effects (no download), with a switch in Settings. It follows Sound: no sound, no music. Off: fights are silent between effects, as before."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Battle music</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Battle music: who has it" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: no music, no Settings row.')}
        </span>
      </div>
    </Box>
  )
}

/**
 * The shiny Pokédex (docs/39): each region's Pokédex gets a Shiny page once its league is beaten. It shows what the
 * save already holds, so the game alone reads it.
 */
function ShinyDexBox() {
  const [raw, setRaw] = useConfigRow('shinyDex')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Shiny Pokédex"
      icon="book"
      hint="On: once a region's League is beaten, its Pokédex has a Pokédex / Shiny switch. The Shiny page lists every species of the region the player has owned shiny there (caught, hatched, traded for or evolved), kept when it leaves, with its rules once as a pop-up and an INFO button. Saves note their shinies whatever the switch says, so the page is whole the day it opens."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Shiny Pokédex</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Shiny Pokédex: who has it" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: the Pokédex has one page, as before.')}
        </span>
      </div>
    </Box>
  )
}

/** Trainer looks (docs/31): unlockable looks from every region in place of the free Kanto and Johto list. */
function LooksBox() {
  const [raw, setRaw] = useConfigRow('looks')
  const access = raw?.access ?? 'off'
  return (
    <Box
      title="Trainer looks"
      icon="user"
      hint="The look other trainers see (leaderboard, Versus, friends). On: Red and Leaf are free and every other look unlocks by playing its region (Pokémon caught, an area reached, the League, the full Pokédex), from the row under the trainer card. A look worn but not unlocked comes off (back to Red or Leaf). Off: the old free list of Kanto and Johto classes."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Trainer looks</span>
        <AccessSwitch value={access} onChange={(a) => setRaw({ ...raw, access: a })} label="Trainer looks: who sees them" />
        <span className="text-base text-muted">
          {accessNote(access, 'Open to every player.', 'Off: the free list as before. Seen looks are kept in saves.')}
        </span>
      </div>
    </Box>
  )
}

/**
 * The General upgrades and the two items that came with them (docs/25): each its own three-way switch, Off by default
 * (the server reads the General one too, for the golden names), then the levels' numbers.
 */
function GeneralBox() {
  const data = useAdminData()
  const wild = data?.config.shinyChance ?? 0
  const wildOdds = wild > 0 ? `1 in ${Math.round(1 / wild)}` : 'never'
  const [raw, setRaw] = useConfigRow('general')
  const [items, setItems] = useConfigRow('itemSwitches')
  const cfg: GeneralConfig = { ...DEFAULT_CONFIG.general, ...(raw ?? {}) }
  const switches = { ...DEFAULT_CONFIG.itemSwitches, ...(items ?? {}) }
  const set = (patch: Partial<GeneralConfig>) => setRaw({ ...cfg, ...patch })
  const row = <K extends 'luck' | 'offline' | 'charm'>(k: K, i: number, patch: Partial<GeneralConfig[K][number]>) =>
    set({ [k]: cfg[k].map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const ITEMS: [string, string, string][] = [
    ['link-cable', 'Link Cable', 'Used from the Team screen on a trade evolution. Not sold unless the item says so.'],
    ['bait', 'Bait', 'Offered at the catch when a ball falls short and its die could still make it.'],
  ]
  return (
    <Box
      title="General upgrades & catch items" icon="navUpgrades"
      hint="The Upgrades screen's third tab (Capture Luck, offline earnings, I am just rich, the Shiny Charm) and the Link Cable and Bait items. Each switch is Off by default; the server checks the General one for the golden names."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">General tab</span>
        <AccessSwitch value={cfg.access ?? 'off'} onChange={(access) => set({ access })} label="General upgrades: who sees them" />
        <span className="text-base text-muted">
          {accessNote(cfg.access ?? 'off', 'Open to every player.', 'Off: no tab, no pop-up, no effect. Levels already bought are kept.')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Shiny Charm</span>
        <AccessSwitch value={cfg.charmAccess ?? 'off'} onChange={(charmAccess) => set({ charmAccess })} label="Shiny Charm: who sees it" />
        <span className="text-base text-muted">
          {accessNote(
            cfg.charmAccess ?? 'off',
            `In the General tab (itself on). Level 0 is the wild odds, now ${wildOdds}; a level never makes them worse.`,
            'Off: no card, no pop-up, no effect. Levels already bought are kept.',
          )}
        </span>
      </div>
      {ITEMS.map(([key, label, hint]) => (
        <div key={key} className="flex flex-wrap items-center gap-3">
          <span className="text-lg">{label}</span>
          <AccessSwitch
            value={switches[key] ?? 'off'}
            onChange={(access) => setItems({ ...switches, [key]: access })}
            label={`${label}: who can use it`}
          />
          <span className="text-base text-muted">
            {accessNote(switches[key] ?? 'off', hint, 'Off: not sold, not found, not usable. Bags keep theirs.')}
          </span>
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Offline earnings count up to (hours)" hint="per absence, on the server's clock">
          <NumInput min={1} max={168} value={cfg.offlineMaxHours} onChange={(v) => set({ offlineMaxHours: Math.max(1, v ?? 24) })} />
        </Field>
        <Field label="I am just rich (₽)" hint="one level: a golden name">
          <NumInput min={0} value={cfg.richCost} onChange={(v) => set({ richCost: Math.max(0, v ?? 0) })} />
        </Field>
      </div>
      <table className="w-full text-lg">
        <thead>
          <tr className="text-left">
            <th className="font-normal">Level</th>
            <th className="font-normal">Capture Luck (%)</th>
            <th className="font-normal">its price (₽)</th>
            <th className="font-normal">Offline (₽ / hour)</th>
            <th className="font-normal">its price (₽)</th>
            <th className="font-normal">Shiny Charm (1 in …)</th>
            <th className="font-normal">its price (₽)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(cfg.luck.length, cfg.offline.length, cfg.charm.length) }, (_, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                {cfg.luck[i] && (
                  <NumInput min={0} max={100} value={cfg.luck[i]!.chance} onChange={(v) => row('luck', i, { chance: Math.max(0, Math.min(100, v ?? 0)) })} />
                )}
              </td>
              <td>{cfg.luck[i] && <NumInput min={0} value={cfg.luck[i]!.cost} onChange={(v) => row('luck', i, { cost: Math.max(0, v ?? 0) })} />}</td>
              <td>
                {cfg.offline[i] && (
                  <NumInput min={0} value={cfg.offline[i]!.perHour} onChange={(v) => row('offline', i, { perHour: Math.max(0, v ?? 0) })} />
                )}
              </td>
              <td>
                {cfg.offline[i] && <NumInput min={0} value={cfg.offline[i]!.cost} onChange={(v) => row('offline', i, { cost: Math.max(0, v ?? 0) })} />}
              </td>
              <td>
                {cfg.charm[i] && (
                  <NumInput min={1} value={cfg.charm[i]!.oneIn} onChange={(v) => row('charm', i, { oneIn: Math.max(1, v ?? 1) })} />
                )}
              </td>
              <td>{cfg.charm[i] && <NumInput min={0} value={cfg.charm[i]!.cost} onChange={(v) => row('charm', i, { cost: Math.max(0, v ?? 0) })} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  )
}

/**
 * Friend invite rewards (docs/15 §25): the three-way switch and the gauge's tiers — each a number of invited new players
 * who have won their first badge, and the gifts it gives (the same editor as a message's gifts). The server reads the
 * same row (0051): it counts the invites only while the switch isn't off, and hands each tier over once.
 */
/**
 * The battle powers (docs/35): Mega Evolution's gem rules, Gigantamax's newer rules and Z-Moves, each with its switch
 * (Off: Mega Evolution and Gigantamax as before, no Z-Moves; the server checks them for Versus), then their numbers.
 */
function BattlePowersBox() {
  const [megaRaw, setMega] = useConfigRow('megaEvolution')
  const [gmaxRaw, setGmax] = useConfigRow('gigantamax')
  const [zRaw, setZ] = useConfigRow('zMove')
  const D = DEFAULT_CONFIG
  const mega = { ...D.megaEvolution, ...(megaRaw ?? {}), gems: { ...D.megaEvolution.gems, ...(megaRaw?.gems ?? {}) } }
  const gmax = { ...D.gigantamax, ...(gmaxRaw ?? {}), boost: { ...D.gigantamax.boost, ...(gmaxRaw?.boost ?? {}) } }
  const z = { ...D.zMove, ...(zRaw ?? {}) }
  const setGems = (patch: Partial<typeof mega.gems>) => setMega({ ...mega, gems: { ...mega.gems, ...patch } })
  const setBoost = (patch: Partial<typeof gmax.boost>) => setGmax({ ...gmax, boost: { ...gmax.boost, ...patch } })
  const setZOne = (patch: Partial<typeof z>) => setZ({ ...z, ...patch })
  const num = (v: number | null | undefined, min: number, max: number, dflt: number) => Math.max(min, Math.min(max, v ?? dflt))
  return (
    <Box
      title="Battle powers: Mega Gems, Gigantamax, Z-Moves" icon="up"
      hint="docs/35. Each switch is Off by default. Off, Mega Evolution and Gigantamax keep their older rules (Kalos / Galar reached, one shared use) and there are no Z-Moves. On: each opens at its region's badge, elsewhere after that region's League, never in a small world."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Mega Gems</span>
        <AccessSwitch value={mega.gems.access} onChange={(access) => setGems({ access })} label="Mega gem rules: who plays by them" />
        <span className="text-base text-muted">
          {accessNote(mega.gems.access, 'A Mega needs its gem and lasts its turns.', 'Off: Mega Evolution as before (Lv.50, the whole battle). Gems held are kept.')}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Opens at this badge of Kalos" hint="3 = Korrina's">
          <NumInput min={1} max={8} value={mega.gems.badges} onChange={(v) => setGems({ badges: num(v, 1, 8, 3) })} />
        </Field>
        <Field label="A Mega lasts (its own turns)" hint="the one it Mega Evolves in included">
          <NumInput min={1} max={20} value={mega.gems.turns} onChange={(v) => setGems({ turns: num(v, 1, 20, 3) })} />
        </Field>
        <Field label="Badge gems" hint="badge number = gem key, one per line">
          <textarea
            className={cx(inputCls, 'min-h-[96px] font-mono text-base')}
            defaultValue={mega.gems.rewards.map((r) => `${r.badge} = ${r.gem}`).join('\n')}
            onBlur={(e) =>
              setGems({
                rewards: e.target.value
                  .split('\n')
                  .map((l) => /^\s*(\d+)\s*=\s*([a-z0-9-]+)\s*$/.exec(l))
                  .filter((m): m is RegExpExecArray => !!m)
                  .map((m) => ({ badge: Number(m[1]), gem: m[2]! })),
              })
            }
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Gigantamax</span>
        <AccessSwitch value={gmax.boost.access} onChange={(access) => setBoost({ access })} label="Gigantamax newer rules: who plays by them" />
        <span className="text-base text-muted">
          {accessNote(gmax.boost.access, 'More dice, a heal, a use of its own.', 'Off: Gigantamax as before (Galar reached, one die, shared with the Mega).')}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Opens at this badge of Galar" hint="3 = Kabu's">
          <NumInput min={1} max={8} value={gmax.boost.badges} onChange={(v) => setBoost({ badges: num(v, 1, 8, 3) })} />
        </Field>
        <Field label="Dice it gains" hint="of its first type">
          <NumInput min={1} max={6} value={gmax.boost.dice} onChange={(v) => setBoost({ dice: num(v, 1, 6, 2) })} />
        </Field>
        <Field label="Heals (% of max HP)" hint="kept after it shrinks back">
          <NumInput min={0} max={100} value={gmax.boost.healPercent} onChange={(v) => setBoost({ healPercent: num(v, 0, 100, 30) })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Z-Moves</span>
        <AccessSwitch value={z.access} onChange={(access) => setZOne({ access })} label="Z-Moves: who can use them" />
        <span className="text-base text-muted">{accessNote(z.access, 'Once per battle, from Alola.', 'Off: no Z-Moves anywhere.')}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Opens at this badge of Alola" hint="3 = Lana's Waterium Z">
          <NumInput min={1} max={8} value={z.badges} onChange={(v) => setZOne({ badges: num(v, 1, 8, 3) })} />
        </Field>
        <Field label="Ice: freeze chance (%)">
          <NumInput min={0} max={100} value={z.freezeChance} onChange={(v) => setZOne({ freezeChance: num(v, 0, 100, 30) })} />
        </Field>
        <Field label="Electric: paralysis chance (%)">
          <NumInput min={0} max={100} value={z.paralyzeChance} onChange={(v) => setZOne({ paralyzeChance: num(v, 0, 100, 50) })} />
        </Field>
        <Field label="Fire: Burn stacks">
          <NumInput min={1} max={10} value={z.burnStacks} onChange={(v) => setZOne({ burnStacks: num(v, 1, 10, 2) })} />
        </Field>
        <Field label="Grass: heals (% of max HP)">
          <NumInput min={0} max={100} value={z.healPercent} onChange={(v) => setZOne({ healPercent: num(v, 0, 100, 20) })} />
        </Field>
        <Field label="Fighting: more damage (%)">
          <NumInput min={0} max={200} value={z.recklessPercent} onChange={(v) => setZOne({ recklessPercent: num(v, 0, 200, 40) })} />
        </Field>
        <Field label="Fighting: recoil (% of the damage dealt)">
          <NumInput min={0} max={100} value={z.recklessRecoilPercent} onChange={(v) => setZOne({ recklessRecoilPercent: num(v, 0, 100, 20) })} />
        </Field>
        <Field label="Other types: more damage (%)">
          <NumInput min={0} max={200} value={z.damagePercent} onChange={(v) => setZOne({ damagePercent: num(v, 0, 200, 20) })} />
        </Field>
      </div>
    </Box>
  )
}

function InviteRewardsBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('inviteRewards')
  const cfg: InviteRewardsConfig = { ...DEFAULT_CONFIG.inviteRewards, ...(raw ?? {}) }
  const set = (patch: Partial<InviteRewardsConfig>) => setRaw({ ...cfg, ...patch })
  const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : []
  const setTier = (i: number, patch: Partial<InviteRewardsConfig['tiers'][number]>) =>
    set({ tiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  // What players will see, as the game reads it: in order, each count once, only tiers with a gift.
  const seen = data ? inviteTiers({ ...data, config: { ...data.config, inviteRewards: cfg } }) : []
  const nextCount = Math.min(INVITE_FRIENDS_MAX, Math.max(0, ...tiers.map((t) => Number(t.friends) || 0)) + 1)
  return (
    <Box
      title="Friend invite rewards" icon="gift"
      hint="Each new player a player invites with their invite link, once they win their first badge, fills that player's gauge (Friends page, Prof. Oak's invite). Each tier gives its gifts once, opened like a message's gifts. The server checks the switch too."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Who gets them</span>
        <AccessSwitch value={cfg.access ?? 'off'} onChange={(access) => set({ access })} label="Invite rewards: who gets them" />
        <span className="text-base text-muted">
          {cfg.access === 'all'
            ? 'Every signed-in player: invites count, the gauge shows, rewards open.'
            : cfg.access === 'admin'
              ? 'Only you see the gauge and open rewards (to try it first). Players you invite count; other players see nothing.'
              : 'Off: no gauge, no pop-up, no invite counted. What was counted and opened stays.'}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {tiers.map((t, i) => (
          <li key={i} className="flex flex-col gap-2 border-2 border-shadow p-2">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Invited players with their first badge" hint={`1–${INVITE_FRIENDS_MAX}`}>
                <NumInput
                  className="w-24"
                  value={t.friends}
                  min={1}
                  max={INVITE_FRIENDS_MAX}
                  onChange={(v) => setTier(i, { friends: Math.max(1, Math.min(INVITE_FRIENDS_MAX, Math.round(v ?? 1))) })}
                />
              </Field>
              <PixelButton size="sm" variant="ghost" onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })}>
                Remove tier
              </PixelButton>
            </div>
            {data && (
              <GiftEditor
                data={data}
                gifts={t.gifts ?? []}
                onChange={(gifts) => setTier(i, { gifts })}
                hint="the player opens them from the gauge once the tier is reached"
                messages={false}
              />
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <PixelButton
          size="sm"
          disabled={tiers.length >= INVITE_TIERS_MAX}
          onClick={() => set({ tiers: [...tiers, { friends: nextCount, gifts: [] }] })}
        >
          Add a tier
        </PixelButton>
        <span className="text-base text-muted">
          {INVITE_TIERS_MAX} tiers at most. A tier without a gift, or a count already used, is left out.
        </span>
      </div>
      {data && (
        <p className="text-lg">
          Players see:{' '}
          {seen.length
            ? seen.map((t) => `${t.friends} → ${t.gifts.map((g) => giftName(data, g)).join(' + ')}`).join(' · ')
            : 'no tier yet (no gauge).'}
        </p>
      )}
    </Box>
  )
}

function DayCareBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('dayCare')
  // The live row may still carry the keys v2 retired (the stay's XP cap, the bought Egg): drop them on the next edit.
  const { maxXp: _maxXp, eggPrice: _eggPrice, ...kept } = (raw ?? {}) as DayCareConfig & { maxXp?: number; eggPrice?: number }
  const cfg: DayCareConfig = { ...DEFAULT_CONFIG.dayCare, ...kept }
  const set = (patch: Partial<DayCareConfig>) => setRaw({ ...cfg, ...patch })
  const num = (k: keyof DayCareConfig, min = 0) => (
    <NumInput min={min} value={cfg[k]} onChange={(v) => set({ [k]: Math.max(min, v ?? min) })} />
  )
  const perDay = cfg.tickMinutes > 0 ? (cfg.xpPerTick * 24 * 60) / cfg.tickMinutes : 0
  const week = (clock: 'breed' | 'ditto') => (data ? eggsPerWeek({ ...data, config: { ...data.config, dayCare: cfg } }, clock) : 0)
  // An Egg belongs to the region it is hatched in, so the pool is shown region by region.
  const pools = data ? enabledRegions(data).map((r) => ({ region: r, pool: eggSpecies(data, r.id) })) : []
  return (
    <Box
      title="Pokémon Day Care" icon="heal"
      hint="One for every region: your Pokémon train in real time, friends' Pokémon visit, and compatible pairs leave Eggs."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Opens at (species, all regions)" hint="distinct species across every region's Pokédex; a free Egg waits">
          {num('unlockPokedex', 0)}
        </Field>
        <Field label="Slots" hint="your Pokémon">
          {num('slots', 1)}
        </Field>
        <Field label="Friend slots" hint="Pokémon from friends' Day Cares">
          {num('friendSlots', 0)}
        </Field>
        <Field label="XP per tick">{num('xpPerTick', 0)}</Field>
        <Field label="Tick (minutes)">{num('tickMinutes', 1)}</Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Egg check (hours)" hint="pairs sharing an Egg group">
          {num('breedHours', 1)}
        </Field>
        <Field label="Ditto check (hours)" hint="pairs with a Ditto">
          {num('breedDittoHours', 1)}
        </Field>
        <Field label="Egg now (₽)" hint="skip the wait: the next check runs and its Egg hatches">
          {num('rushPrice', 0)}
        </Field>
        <Field label="Not kept (₽)" hint="from the Day Care couple when a hatchling isn't kept">
          {num('notKeptGold', 0)}
        </Field>
        <Field label="Shiny chance (%)" hint="Day Care Eggs only; the wild shiny chance is separate">
          <NumInput
            min={0}
            max={100}
            step={0.1}
            value={Math.round(cfg.shinyChance * 10_000) / 100}
            onChange={(v) => set({ shinyChance: Math.min(1, Math.max(0, (v ?? 0) / 100)) })}
          />
        </Field>
      </div>
      <p className="text-lg">
        {perDay.toFixed(1)} XP a day. Residents level up to Lv.100 and never evolve here. With a compatible pair, about{' '}
        {week('breed').toFixed(1)} Eggs a week (Ditto pairs: {week('ditto').toFixed(1)}).
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Unowned weight" hint="× odds of a species not in the Pokédex (owned = 1)">
          {num('unownedWeight', 0)}
        </Field>
        <Field label="Hatch: rank" hint="the n-th lowest level owned">
          {num('hatchRank', 1)}
        </Field>
        <Field label="Hatch: minus">{num('hatchOffset', 0)}</Field>
        <Field label="Hatch: at least">{num('hatchMinLevel', 1)}</Field>
      </div>
      <div className="grid gap-2">
        <p className="text-base text-muted">
          Eggs hatch into the first form of a line that evolves, starters excluded, and only from the region they are
          hatched in:
        </p>
        {pools.map(({ region, pool }) => (
          <div key={region.id}>
            <p className="text-base text-muted">
              {region.name} ({pool.length} species):
            </p>
            <div className="mt-1 flex flex-wrap gap-0.5">
              {pool.map((sp) => (
                <SpriteImg key={sp.dex} dex={sp.dex} size={32} alt={sp.name} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Box>
  )
}

function XpPlot({ A, B, C, fightsPerHour, mult }: { A: number; B: number; C: number; fightsPerHour: number; mult: number }) {
  const W = 360
  const H = 160
  const cfg = { ...DEFAULT_CONFIG, xpCurve: { A, B, C } }
  const pts = Array.from({ length: 100 }, (_, i) => xpToNext(i + 1, cfg))
  const max = Math.max(...pts)
  const path = pts.map((v, i) => `${(i / 99) * W},${H - (v / max) * (H - 14)}`).join(' ')
  const perHour = (L: number) => (fightsPerHour * L * mult) / xpToNext(L, cfg)
  return (
    <div className="flex flex-wrap items-start gap-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm border-2 border-edge bg-panel" role="img" aria-label="XP to next level by level">
        <polyline points={path} fill="none" stroke="#547acc" strokeWidth={2} />
        <text x={4} y={12} fontSize={10} fill="#24304f">
          xpToNext(L), L = 1…100 (max {max})
        </text>
      </svg>
      <table className="text-lg">
        <thead>
          <tr>
            <th className="pr-3 text-left font-normal">Level</th>
            <th className="pr-3 text-left font-normal">XP to next</th>
            <th className="text-left font-normal">≈ levels / hour</th>
          </tr>
        </thead>
        <tbody>
          {[5, 10, 20, 35, 50, 80].map((L) => (
            <tr key={L}>
              <td>{L}</td>
              <td className="font-mono">{xpToNext(L, cfg)}</td>
              <td className="font-mono">{perHour(L).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="w-full text-sm text-muted">
        Estimate: {fightsPerHour} K.O.s per hour against foes of your own level (XP per K.O. = the foe's level × {mult}),
        fighter share.
      </p>
    </div>
  )
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  )
}

function JsonField<K extends keyof GameConfig>({ k }: { k: K }) {
  const [value, set] = useConfigRow(k)
  const [text, setText] = useState(() => JSON.stringify(value, null, 1))
  const [err, setErr] = useState<string | null>(null)
  return (
    <Field label={k} hint={err ?? undefined}>
      <textarea
        className={`${inputCls} h-32 font-mono text-xs`}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          try {
            set(JSON.parse(e.target.value))
            setErr(null)
          } catch {
            setErr('invalid JSON — not applied')
          }
        }}
      />
    </Field>
  )
}

/** Every status effect's numbers: what its faces do. Read live by battles and the help. */
function StatusRulesBox() {
  const [rules, setRules] = useConfigRow('status')
  // Per effect, so a stored row missing a newer field (e.g. burn.percentPerStack) shows the default.
  const r = Object.fromEntries(
    Object.entries(DEFAULT_CONFIG.status).map(([k, v]) => [k, { ...v, ...(rules as Partial<StatusRules> | undefined)?.[k as keyof StatusRules] }]),
  ) as unknown as StatusRules
  const patch = <K extends keyof StatusRules>(k: K, p: Partial<StatusRules[K]>) => setRules({ ...r, [k]: { ...r[k], ...p } })
  const num = (v: number | null | undefined, fallback: number, min = 0) => Math.max(min, v ?? fallback)
  const faces = 'faces needed in one roll'
  const chance = 'faces for a sure hit: each face gives a 1-in-sureAt chance'
  return (
    <Box title="Status effects" icon="burn" hint="The dice faces that trigger each effect, and what it does. The help screen and the Upgrades screen quote these numbers.">
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1 border-2 border-edge p-2">
          <legend className="px-1 text-lg">Burn (Fire)</legend>
          <Field label="threshold" hint={faces}><NumInput value={r.burn.threshold} min={1} onChange={(v) => patch('burn', { threshold: num(v, 1, 1) })} /></Field>
          <Field label="percentPerStack" hint="% of the victim's max HP per stack, each of its turns (min 1)"><NumInput value={r.burn.percentPerStack} min={0} onChange={(v) => patch('burn', { percentPerStack: num(v, 4) })} /></Field>
          <Field label="duration" hint="turns (refreshed by a new burn)"><NumInput value={r.burn.duration} min={1} onChange={(v) => patch('burn', { duration: num(v, 3, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-edge p-2">
          <legend className="px-1 text-lg">Poison (Poison)</legend>
          <p className="text-base text-muted">One face poisons. It doesn&apos;t stack: another only brings its turns back up.</p>
          <Field label="percent" hint="% of the victim's max HP, each of its turns (min 1)"><NumInput value={r.poison.percent} min={0} onChange={(v) => patch('poison', { percent: num(v, 5) })} /></Field>
          <Field label="duration" hint="turns"><NumInput value={r.poison.duration} min={1} onChange={(v) => patch('poison', { duration: num(v, 5, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-edge p-2">
          <legend className="px-1 text-lg">Frozen (Ice)</legend>
          <Field label="sureAt" hint={chance}><NumInput value={r.frozen.sureAt} min={1} onChange={(v) => patch('frozen', { sureAt: num(v, 3, 1) })} /></Field>
          <Field label="stunTurns" hint="turns the foe skips"><NumInput value={r.frozen.stunTurns} min={1} onChange={(v) => patch('frozen', { stunTurns: num(v, 2, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-edge p-2">
          <legend className="px-1 text-lg">Paralyze (Electric)</legend>
          <Field label="sureAt" hint={chance}><NumInput value={r.paralyze.sureAt} min={1} onChange={(v) => patch('paralyze', { sureAt: num(v, 2, 1) })} /></Field>
          <Field label="stunTurns" hint="turns the foe skips"><NumInput value={r.paralyze.stunTurns} min={1} onChange={(v) => patch('paralyze', { stunTurns: num(v, 1, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-edge p-2">
          <legend className="px-1 text-lg">Confuse (Psychic)</legend>
          <Field label="recoilPercentPerFace" hint="% of the confused attacker's max HP it loses after its attack, per Confuse face (min 1)"><NumInput value={r.confuse.recoilPercentPerFace} min={0} onChange={(v) => patch('confuse', { recoilPercentPerFace: num(v, 10, 0) })} /></Field>
          <Field label="maxFaces" hint="faces that count at most: 1 a bit confused, 2 confused, 3+ very confused"><NumInput value={r.confuse.maxFaces} min={1} onChange={(v) => patch('confuse', { maxFaces: num(v, 3, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-edge p-2">
          <legend className="px-1 text-lg">Heal (Grass)</legend>
          <p className="text-base text-muted">Nothing to set: each Heal face heals its value plus its die&apos;s upgrade, on top of the damage.</p>
        </fieldset>
      </div>
    </Box>
  )
}

export function ConfigSection() {
  const data = useAdminData()
  const [encounterMode, setEncounterMode] = useConfigRow('encounterMode')
  const [hpMultiplier, setHpMultiplier] = useConfigRow('hpMultiplier')
  const [goldMultiplier, setGold] = useConfigRow('goldMultiplier')
  const [xpCurve, setXpCurve] = useConfigRow('xpCurve')
  const [share, setShare] = useConfigRow('xpShareMode')
  const [skip, setSkip] = useConfigRow('skipPolicy')
  const [noEscape, setNoEscape] = useConfigRow('noEscape')
  const [payout, setPayout] = useConfigRow('comboPayoutMode')
  const [enemyLv, setEnemyLv] = useConfigRow('enemyUpgradeLevel')
  const [versusLv, setVersusLv] = useConfigRow('versusUpgradeLevel')
  const [maxTurns, setMaxTurns] = useConfigRow('maxBattleTurns')
  const [starters, setStarters] = useConfigRow('starters')
  const [starterLevel, setStarterLevel] = useConfigRow('starterLevel')
  const [spread, setSpread] = useConfigRow('scaleLevelSpread')
  const [voluntary, setVoluntary] = useConfigRow('allowVoluntarySwitch')
  const [forced, setForced] = useConfigRow('forcedCenterWhenHurt')
  const [version] = useConfigRow('configVersion')
  const [multiExp, setMultiExp] = useConfigRow('multiExpShare')
  const [multiGap, setMultiGap] = useConfigRow('multiExpGapBonus')
  const [multiMax, setMultiMax] = useConfigRow('multiExpMaxShare')
  const [xpMult, setXpMult] = useConfigRow('xpMultiplier')
  const [showRound, setShowRound] = useConfigRow('showRoundGauge')
  const [showAhead, setShowAhead] = useConfigRow('showRoundPreview')
  const [shiny, setShiny] = useConfigRow('shinyChance')
  const [cloudSync, setCloudSync] = useConfigRow('cloudSyncMinutes')
  const [maxFriends, setMaxFriends] = useConfigRow('maxFriends')
  const [fph, setFph] = useState(80)
  const curve = useMemo(() => ({ ...DEFAULT_CONFIG.xpCurve, ...xpCurve }), [xpCurve])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-3xl">
          <PixelIcon name="gear" size={26} />
          Config
        </h2>
        <span className="text-lg">content version {String(version)} (bumped by Publish)</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Pacing & rewards" icon="trophy" hint="Fight length, levelling speed and money. Damage always equals the dice.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="hpMultiplier" hint="× every Pokémon's HP, yours and foes' — the fight-length knob">
              <NumInput step={0.05} value={hpMultiplier} min={0.1} onChange={(v) => setHpMultiplier(Math.max(0.1, v ?? 1))} />
            </Field>
            <Field label="xpMultiplier" hint="× the XP a K.O. gives (foe's level × this) — to the Pokémon and to the area's exploration alike">
              <NumInput step={0.25} value={xpMult} min={0.1} onChange={(v) => setXpMult(Math.max(0.1, v ?? 1))} />
            </Field>
            <Field label="goldMultiplier" hint="× trainer gold — the economy knob">
              <NumInput step={0.1} value={goldMultiplier} onChange={(v) => setGold(v ?? 1)} />
            </Field>
          </div>
        </Box>

        <Box title="Encounters" icon="ball" hint="How much each card counts is set per area (Areas → Encounter deck).">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="encounterMode" hint="deck: each area deals a shuffled deck (exact mix, no long droughts) · random: independent rolls">
              <Select value={encounterMode} options={['deck', 'random'] as const} onChange={setEncounterMode} />
            </Field>
            <Field label="skipPolicy" hint="FLEE on the encounter pop-up: free, once per encounter, or never">
              <Select value={skip} options={['free', 'once', 'none'] as const} onChange={setSkip} />
            </Field>
            <Field label="scaleLevelSpread" hint="areas that scale to the team: its average ± this">
              <NumInput value={spread} onChange={(v) => setSpread(v ?? 3)} />
            </Field>
            <Field label="shinyChance" hint={`chance a wild Pokémon is shiny (only its sprites change) · 0.01 = 1 in 100${Number(shiny) > 0 ? ` · now 1 in ${Math.round(1 / Number(shiny))}` : ' · now off'}`}>
              <NumInput step={0.005} value={shiny} min={0} max={1} onChange={(v) => setShiny(Math.max(0, Math.min(1, v ?? 0)))} />
            </Field>
            <label className="flex items-center gap-2 text-lg" title="Players can't FLEE / AVOID an encounter or RUN from a battle (overrides skipPolicy)">
              <input type="checkbox" checked={!!noEscape} onChange={(e) => setNoEscape(e.target.checked)} /> noEscape
            </label>
            <label className="flex items-center gap-2 text-lg" title="The first encounter of an area is a Center when anyone is hurt">
              <input type="checkbox" checked={!!forced} onChange={(e) => setForced(e.target.checked)} /> forcedCenterWhenHurt
            </label>
          </div>
        </Box>

        <Box title="XP sharing" icon="up">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="xpShareMode" hint="fighter: the Pokémon that fought · team: all three">
              <Select value={share} options={['fighter', 'team'] as const} onChange={setShare} />
            </Field>
            <Field label="multiExpShare" hint="Multi EXP: bench share of K.O. XP (0 = off; players can toggle)">
              <NumInput step={0.05} value={multiExp} min={0} max={1} onChange={(v) => setMultiExp(Math.max(0, Math.min(1, v ?? 0)))} />
            </Field>
            <Field label="multiExpGapBonus" hint="+ this share per level the bench Pokémon is below the fighter (catch-up)">
              <NumInput step={0.01} value={multiGap} min={0} max={1} onChange={(v) => setMultiGap(Math.max(0, Math.min(1, v ?? 0)))} />
            </Field>
            <Field
              label="multiExpMaxShare"
              hint={`cap on the bench share (1 = as much as the fighter)${Number(multiGap) > 0 ? ` · reached ${Math.ceil(Math.max(0, Number(multiMax) - Number(multiExp)) / Number(multiGap))} levels behind` : ''}`}
            >
              <NumInput step={0.05} value={multiMax} min={0} max={1} onChange={(v) => setMultiMax(Math.max(0, Math.min(1, v ?? 1)))} />
            </Field>
          </div>
        </Box>

        <Box title="Battle" icon="sword">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="comboPayoutMode">
              <Select value={payout} options={['highestDamage', 'highestRank'] as const} onChange={setPayout} />
            </Field>
            <Field label="enemyUpgradeLevel" hint="foes' dice/combo upgrade level where the area (and the trainer / legendary) sets none">
              <NumInput value={enemyLv} min={1} max={10} onChange={(v) => setEnemyLv(v ?? 1)} />
            </Field>
            <Field label="versusUpgradeLevel" hint="Versus: every dice/combo track of both teams, whatever their owners bought">
              <NumInput value={versusLv} min={1} max={10} onChange={(v) => setVersusLv(v ?? 5)} />
            </Field>
            <Field label="maxBattleTurns" hint="stalemate safety valve">
              <NumInput value={maxTurns} onChange={(v) => setMaxTurns(v ?? 150)} />
            </Field>
            <label className="flex items-center gap-2 text-lg" title="Switching on your own turn (it costs the turn)">
              <input type="checkbox" checked={!!voluntary} onChange={(e) => setVoluntary(e.target.checked)} /> allowVoluntarySwitch
            </label>
          </div>
        </Box>

        <Box title="Cloud save" icon="cloud" hint="How often signed-in players' saves go to Supabase. Fewer pushes = less database load.">
          <Field
            label="cloudSyncMinutes"
            hint="a signed-in player's save is pushed at most once every this many minutes while they play (and when the page closes) · players can still press SYNC ONLINE, once per 5 min"
          >
            <NumInput value={cloudSync} min={1} max={240} onChange={(v) => setCloudSync(Math.max(1, Math.min(240, v ?? 15)))} />
          </Field>
        </Box>

        <Box title="Friends" icon="friends" hint="The friend list (docs/16). The database reads this key too: friend_add() refuses past it, on both sides.">
          <Field label="maxFriends" hint="friends per player; lowering it removes nobody, it only stops new friends past the cap">
            <NumInput value={maxFriends} min={1} max={500} onChange={(v) => setMaxFriends(Math.max(1, Math.min(500, v ?? 100)))} />
          </Field>
        </Box>

        <Box title="Player help" icon="book" hint="What the game shows players while they plan.">
          <label className="flex items-start gap-2 text-lg">
            <input type="checkbox" className="mt-1.5" checked={!!showRound} onChange={(e) => setShowRound(e.target.checked)} />
            <span>
              showRoundGauge
              <span className="block text-sm text-muted">
                The round gauge on the area screen: one segment per card of the area's deck, with an icon for each encounter
                already met this round. Rounds (and their opening Pokémon Center) happen either way.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-lg">
            <input type="checkbox" className="mt-1.5" checked={!!showAhead} onChange={(e) => setShowAhead(e.target.checked)} />
            <span>
              showRoundPreview
              <span className="block text-sm text-muted">
                Under the round gauge, show what's ahead: an icon for each card still in the deck (battle, find, wild
                Pokémon, Center, legendary) and the gym badge or legendary waiting once every round is done. Needs showRoundGauge.
              </span>
            </span>
          </label>
        </Box>
      </div>

      <section>
        <h3 className="text-2xl">XP curve — xpToNext(L) = ⌈A·L^B⌉ + C</h3>
        <div className="mb-2 flex flex-wrap gap-3">
          {(['A', 'B', 'C'] as const).map((k) => (
            <Field key={k} label={k}>
              <NumInput className="w-24" step={k === 'B' ? 0.05 : 1} value={curve[k]} onChange={(v) => setXpCurve({ ...curve, [k]: v ?? 0 })} />
            </Field>
          ))}
          <Field label="K.O.s per hour (estimate)">
            <NumInput className="w-24" value={fph} onChange={(v) => setFph(v ?? 60)} />
          </Field>
        </div>
        <XpPlot A={curve.A} B={curve.B} C={curve.C} fightsPerHour={fph} mult={xpMult ?? 1} />
      </section>

      <section>
        <h3 className="text-2xl">Starters</h3>
        <div className="flex flex-wrap items-center gap-2">
          {data &&
            starters.map((d, i) => (
              <div key={i} className="flex items-center gap-1">
                <SpriteImg dex={d} size={36} />
                <PokemonPicker className="w-64" data={data} value={d} onChange={(x) => setStarters(starters.map((y, j) => (j === i ? x : y)))} />
              </div>
            ))}
          <Field label="starterLevel">
            <NumInput className="w-20" value={starterLevel} onChange={(v) => setStarterLevel(v ?? 5)} />
          </Field>
        </div>
      </section>

      <EnergyBox />

      <PityBox
        configKey="uniquePity"
        title="Once-only finds — pity"
        icon="crown"
        hint="The more rounds a player has done in an area, the likelier its once-only finds (Areas → Loot): × their odds per item find, never past 100 %."
      />

      <PityBox
        configKey="newPokemonPity"
        title="New Pokémon — pity"
        icon="ball"
        hint="The more rounds a player has done in an area, the likelier its wild Pokémon they haven't caught (Areas → Wild pool): × their odds per wild Pokémon, never past 100 %."
      />

      <DonationBox />

      <DiscordBox />

      <SlotMachineBox />

      <DayCareBox />

      <DayNightBox />

      <IdleModeBox />

      <DiceThrowsBox />

      <GameFeelBox />
      <RaidOverhaulBox />

      <HapticsBox />

      <MusicBox />

      <ShinyDexBox />

      <ExtremeBox />

      <DoubleBattlesBox />

      <TradesBox />

      <PushBox />
      <GeneralBox />
      <BattlePowersBox />

      <LooksBox />

      <InviteRewardsBox />

      <StatusRulesBox />

      <section className="grid gap-3 md:grid-cols-2">
        <JsonField k="ai" />
        <JsonField k="startInventory" />
      </section>

      <section>
        <DataTable
          table="game_config"
          title="All game_config rows"
          newRow={() => ({ key: `newKey${Date.now().toString(36)}`, value: null })}
          columns={[
            { key: 'key', label: 'Key', kind: 'text' },
            { key: 'value', label: 'Value (JSON)', kind: 'json', nullable: true },
          ]}
        />
      </section>
    </div>
  )
}
