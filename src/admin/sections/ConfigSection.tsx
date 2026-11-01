import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DEFAULT_CONFIG,
  EVENT_ACCESS,
  VERSUS_LEAGUE_DEFAULTS,
  AREA_VERSUS_DEFAULTS,
  eggSpecies,
  eggsPerWeek,
  centerBoonRules,
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
  type EventAccess,
  type ExtremeCentersConfig,
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
  type WelcomeBackConfig,
  WELCOME_BACK_DAYS_MAX,
  WELCOME_BACK_TIERS_MAX,
  welcomeBackCooldown,
  welcomeBackTiers,
  type HiddenTalentsConfig,
  familyOf,
  familyTalent,
  isTalentKey,
  TALENT_KEYS,
  talentTier,
  marketShiny,
  marketWeek,
  normaliseMarketItem,
  type FriendshipConfig,
} from '@/engine'
import { PixelIcon, type IconName } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { cx } from '@/theme/util'
import { DataTable } from '../DataTable'
import { GiftEditor, giftName } from '../GiftEditor'
import { addRows, rowKey, updateRow, useAdmin, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, inputCls } from '../widgets'
import { LegendIntrosBox } from './LegendIntrosBox'
import { ChampionIntrosBox } from './ChampionIntrosBox'
import { PushBox } from './PushBox'
import { VersusLeagueBox } from './VersusLeagueBox'
import { AreaVersusBox } from './AreaVersusBox'
import { VersusLeagueGroups } from './VersusLeagueGroups'

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
        <Field label="Monthly goal" hint="The Saturday #support-me post's target · 0 = none">
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
        <Field label="Goal counts from" hint="What goes past a month's goal covers the next ones from here · empty = Ko-fi's first payment">
          <input
            className={inputCls}
            type="month"
            placeholder="2026-10"
            value={cfg.startMonth}
            onChange={(e) => set({ startMonth: e.target.value })}
          />
        </Field>
        <Field label="Raised before tracking" hint="Ko-fi only reports payments made after its webhook was set up: add what came in before (counted in that first month)">
          <NumInput min={0} value={cfg.raisedBefore} onChange={(v) => set({ raisedBefore: Math.max(0, v ?? 0) })} />
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
 * Extreme mode (docs/22): the second save that a league opens, with no Pokémon Centers, K.O.s that rest for hours and
 * healing only while the player is away. Every number here is read by the game's engine (engine/extreme).
 */
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
      hint="A second save, opened by a league of the main one: a world of its own (its own board, Versus and events; the same friends). Its Pokémon Centers: none, unless “Extreme Pokémon Centers” (below, its switch on the Switches tab) gives them a boon to pick instead of the heal, or “Pokémon Centers” here brings back the classic heal."
    >
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
 * Extreme mode's Pokémon Centers (docs/47): a boon to pick instead of the heal. The team heal is always on offer; the
 * other kinds are drawn by these weights. Every number is read by the game's engine (engine/extremeCenters).
 */
function ExtremeCentersBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('extremeCenters')
  const d = DEFAULT_CONFIG.extremeCenters
  const r = (raw ?? {}) as Partial<ExtremeCentersConfig>
  const cfg: ExtremeCentersConfig = {
    ...d,
    ...r,
    heal: { ...d.heal, ...r.heal },
    full: { ...d.full, ...r.full },
    item: { ...d.item, ...r.item },
    buff: { ...d.buff, ...r.buff },
    donor: { ...d.donor, ...r.donor },
    rocket: { ...d.rocket, ...r.rocket },
  }
  const set = (patch: Partial<ExtremeCentersConfig>) => setRaw({ ...cfg, ...patch })
  const num = (value: number, put: (v: number) => void, min = 0, max?: number) => (
    <NumInput min={min} max={max} value={value} onChange={(v) => put(Math.max(min, Math.min(max ?? Infinity, v ?? min)))} />
  )
  const odds = data ? centerBoonRules({ ...data, config: { ...data.config, extremeCenters: cfg } }).odds : null
  return (
    <Box
      title="Extreme Pokémon Centers"
      icon="heart"
      hint="Extreme mode's Centers heal nobody: each offers boons to pick one from. A round opens with one, the deck's Center cards are boons too; a completed area has none, a secret area only its first. A round lost to a K.O. starts over at a Center that only swaps. With Extreme mode's “Pokémon Centers” ticked, Centers heal as in the main game and none of this applies; no Idle mode while it's on."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Boons on offer" hint="the team heal included">
          {num(cfg.offers, (v) => set({ offers: v }), 1, 6)}
        </Field>
        <Field label="Team heal (%)" hint="always on offer: everyone standing, team and Box">
          {num(cfg.heal.percent, (v) => set({ heal: { percent: v } }), 0, 100)}
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Full heal on one" hint={`weight · ${odds?.full ?? 0} % of draws`}>
          {num(cfg.full.weight, (v) => set({ full: { weight: v } }))}
        </Field>
        <Field label="Healing item" hint={`weight · ${odds?.item ?? 0} %`}>
          {num(cfg.item.weight, (v) => set({ item: { ...cfg.item, weight: v } }))}
        </Field>
        <Field label="Pokébuff" hint={`weight · ${odds?.buff ?? 0} %`}>
          {num(cfg.buff.weight, (v) => set({ buff: { ...cfg.buff, weight: v } }))}
        </Field>
        <Field label="Generous donor" hint={`weight · ${odds?.donor ?? 0} %`}>
          {num(cfg.donor.weight, (v) => set({ donor: { ...cfg.donor, weight: v } }))}
        </Field>
        <Field label="Rocket Trade" hint={`weight · ${odds?.rocket ?? 0} %`}>
          {num(cfg.rocket.weight, (v) => set({ rocket: { ...cfg.rocket, weight: v } }))}
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Item: the potion" hint="weight; Potion, Super Potion from 3 badges, Hyper Potion from 6">
          {num(cfg.item.potion, (v) => set({ item: { ...cfg.item, potion: v } }))}
        </Field>
        <Field label="Item: Revive" hint="weight">
          {num(cfg.item.revive, (v) => set({ item: { ...cfg.item, revive: v } }))}
        </Field>
        <Field label="Item: Max Revive" hint="weight">
          {num(cfg.item.maxRevive, (v) => set({ item: { ...cfg.item, maxRevive: v } }))}
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Pokébuff lasts (hours)" hint="real time; +1 die of one of its types">
          {num(cfg.buff.hours, (v) => set({ buff: { ...cfg.buff, hours: v } }), 0)}
        </Field>
        <Field label="Pokébuff from badge" hint="never before this many badges in the region">
          {num(cfg.buff.badges ?? 0, (v) => set({ buff: { ...cfg.buff, badges: v } }), 0, 18)}
        </Field>
        <Field label="Pokébuff dice cap" hint="never past this many dice">
          {num(cfg.buff.maxDice, (v) => set({ buff: { ...cfg.buff, maxDice: v } }), 1, 12)}
        </Field>
        <Field label="Donor (× a trainer)" hint="× what an average trainer of the area pays">
          {num(cfg.donor.trainers, (v) => set({ donor: { ...cfg.donor, trainers: v } }), 0)}
        </Field>
        <Field label="Rocket: levels higher" hint="the mystery Pokémon's level over the one given">
          {num(cfg.rocket.levels, (v) => set({ rocket: { ...cfg.rocket, levels: v } }), 0, 20)}
        </Field>
        <Field label="Rocket: strength band (%)" hint="max HP × dice, same stage; else the 5 closest">
          {num(cfg.rocket.band, (v) => set({ rocket: { ...cfg.rocket, band: v } }), 0, 100)}
        </Field>
      </div>
    </Box>
  )
}

/**
 * Double battles (docs/33): the regions where they happen and how often a wild Pokémon comes with a
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
 * Trades (docs/23): the numbers (the board's picks among them, §2.1), the trade evolutions (a pair taken off evolves by
 * level again)
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
  const num = (
    k:
      | 'maxListings'
      | 'listingDays'
      | 'tradesPerDay'
      | 'levelCap'
      | 'minBadges'
      | 'boardPicks'
      | 'boardRerolls',
    min = 0,
    max?: number,
  ) => (
    <NumInput min={min} max={max} value={cfg[k]} onChange={(v) => set({ [k]: Math.max(min, Math.min(max ?? Infinity, v ?? min)) })} />
  )
  const name = (dex: number) => data?.species[dex]?.name ?? `#${dex}`
  return (
    <Box
      title="Trades" icon="trade"
      hint="Listings, like the games' GTS: a player puts a Pokémon up and says what they want; anyone allowed takes it while they're away. The server checks the switch too."
    >
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Open listings at most" hint="per player">{num('maxListings', 1, 20)}</Field>
        <Field label="A listing lasts (days)" hint="then its Pokémon comes back">{num('listingDays', 1, 30)}</Field>
        <Field label="Trades taken a day" hint="per player, UTC days">{num('tradesPerDay', 1, 100)}</Field>
        <Field label="Level cap" hint="traded Pokémon arrive at most at">{num('levelCap', 1, 100)}</Field>
        <Field label="Badges needed" hint="every region's counted">{num('minBadges', 0, 100)}</Field>
        <Field label="Board picks" hint="listings picked for a player; a search shows all">
          {num('boardPicks', 1, 20)}
        </Field>
        <Field label="New picks a day" hint="per player, UTC days">{num('boardRerolls', 0, 20)}</Field>
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

/**
 * Hidden talents (docs/51): the odds, and each family's talent. A family is every species joined to its lowest dex by
 * an evolution or a form; its talent is the game's own (src/data/talents.json, `pnpm talents`) unless picked here.
 * The switch is on the Switches tab.
 */
function HiddenTalentsBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('hiddenTalents')
  const cfg: HiddenTalentsConfig = { ...DEFAULT_CONFIG.hiddenTalents, ...(raw ?? {}) }
  const set = (patch: Partial<HiddenTalentsConfig>) => setRaw({ ...cfg, ...patch })
  const [q, setQ] = useState('')
  const families = useMemo(() => {
    if (!data) return []
    const seen = new Map<number, string[]>()
    for (const s of data.speciesList) {
      if (s.form) continue
      const root = familyOf(data, s.dex)
      seen.set(root, [...(seen.get(root) ?? []), s.name])
    }
    return [...seen.entries()].map(([root, names]) => ({ root, names }))
  }, [data])
  const needle = q.trim().toLowerCase()
  const shown = families.filter((f) => !needle || f.names.some((n) => n.toLowerCase().includes(needle)) || String(f.root) === needle)
  const pct = (v: number) => Math.round(v * 1000) / 10
  return (
    <Box
      title="Hidden talents"
      icon="talent"
      hint="One talent per evolution family. A wild Pokémon (a ghost, an Egg, a fossil, a gift…) carries its family's talent at the odds below; catching it unlocks the talent for every Pokémon of that family the player owns in that region. Legendaries and mythicals always carry theirs, starter lines never do and always find it as they evolve; any other family still locked may find it on each evolution. Gym leaders', the Elite Four's and Champions' aces always have theirs. Super talents (gold) go to strong families, base ones (blue) to the others."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Wild odds (%)" hint="a Pokémon met carries its talent">
          <NumInput min={0} max={100} step={0.5} value={pct(cfg.wildChance)} onChange={(v) => set({ wildChance: Math.max(0, Math.min(100, v ?? 0)) / 100 })} />
        </Field>
        <Field label="Evolution odds (%)" hint="a locked family finds it as one evolves">
          <NumInput min={0} max={100} step={1} value={pct(cfg.evolveChance)} onChange={(v) => set({ evolveChance: Math.max(0, Math.min(100, v ?? 0)) / 100 })} />
        </Field>
      </div>
      <input className={cx(inputCls, 'mt-3')} placeholder="Find a family (a name or the lowest dex)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 max-h-[480px] overflow-y-auto">
        <table className="w-full text-base">
          <tbody>
            {data &&
              shown.slice(0, 200).map((f) => {
                const own = cfg.families[String(f.root)]
                const talent = familyTalent({ ...data, config: { ...data.config, hiddenTalents: cfg } }, f.root)
                return (
                  <tr key={f.root} className="border-b border-shadow">
                    <td className="w-10 py-1">
                      <SpriteImg dex={f.root} size={32} />
                    </td>
                    <td className="py-1">
                      #{f.root} {f.names.join(' · ')}
                    </td>
                    <td className="w-16 py-1 text-muted">{talentTier(talent)}</td>
                    <td className="w-48 py-1">
                      <select
                        className={inputCls}
                        value={isTalentKey(own) ? own : ''}
                        onChange={(e) => {
                          const { [String(f.root)]: _old, ...rest } = cfg.families
                          set({ families: e.target.value ? { ...rest, [String(f.root)]: e.target.value } : rest })
                        }}
                      >
                        <option value="">{`game's: ${familyTalent({ ...data, config: { ...data.config, hiddenTalents: { ...cfg, families: {} } } }, f.root)}`}</option>
                        {TALENT_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {k} ({talentTier(k)})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        {shown.length > 200 && <p className="text-muted">{shown.length - 200} more: narrow the search.</p>}
      </div>
    </Box>
  )
}

/**
 * The Unown Pokédex (docs/41): the 28 letters, once an area where Unown live is opened, and the ₽ the last one pays.
 * The letters are noted on the device, so the game alone reads it.
 */
function UnownDexBox() {
  const [raw, setRaw] = useConfigRow('unownDex')
  const cfg = { ...DEFAULT_CONFIG.unownDex, ...(raw ?? {}) }
  return (
    <Box
      title="Unown Pokédex"
      icon="book"
      hint="Once the player opens an area where Unown live (Johto's Ruins of Alph), their Pokédex gets an Unown page with the 28 letters (A–Z, ! and ?), Home shows its banner while they stand in that area, and its rules come once as a pop-up with an INFO button. While a letter is missing, every Unown caught is a new one (even a weaker one can be caught). The last letter pays the prize below, once per region. The Pokédex itself keeps one Unown entry."
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Prize (₽)" hint="for all 28 letters, once">
          <NumInput
            min={0}
            value={cfg.reward}
            onChange={(v) => setRaw({ ...cfg, reward: Math.max(0, Math.floor(v ?? 0)) })}
          />
        </Field>
      </div>
    </Box>
  )
}

/**
 * Friendship streaks and the Friend Market (docs/60): what each tier of a streak pays a day, the day's cap, the
 * market's weekly shelf and the shiny of the week. The server prices and pays from this same row (friendship_cfg()).
 */
function FriendshipBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('friendship')
  const cfg: FriendshipConfig = { ...DEFAULT_CONFIG.friendship, ...(raw ?? {}) }
  const set = (patch: Partial<FriendshipConfig>) => setRaw({ ...cfg, ...patch })
  const n = (v: number | null | undefined, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, Math.round(v ?? d)))
  const week = marketWeek(new Date().toISOString().slice(0, 10))
  const shinyNow = data ? marketShiny(week, { ...data, config: { ...data.config, friendship: cfg } }) : null
  return (
    <Box
      title="Friendship & Friend Market"
      icon="heart"
      hint="Two friends who raid beside each other's team, trade together or make an Egg with the other's Pokémon keep a streak going (once per UTC day). Each new streak day pays both of them Heart Scales by its tier, up to the daily cap across every friend. A missed day starts the streak again. The coins buy from the Friend Market, whose limits and shiny reset every Monday 00:00 UTC."
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-5">
          {cfg.tiers.map((tier, i) => (
            <Field key={i} label={`Tier ${i + 1}: from day`} hint={`pays ${tier.coins} a day`}>
              <div className="flex gap-1.5">
                <NumInput
                  className="w-16"
                  min={1}
                  value={tier.from}
                  onChange={(v) => set({ tiers: cfg.tiers.map((x, j) => (j === i ? { ...x, from: n(v, 1, 9999, 1) } : x)) })}
                />
                <NumInput
                  className="w-16"
                  min={0}
                  max={99}
                  value={tier.coins}
                  onChange={(v) => set({ tiers: cfg.tiers.map((x, j) => (j === i ? { ...x, coins: n(v, 0, 99, 0) } : x)) })}
                />
              </div>
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {cfg.tiers.map((tier, i) => (
            <Field key={i} label={`Friend Ball ×, tier ${i + 1}`} hint={`hidden-talent odds × this from day ${tier.from}`}>
              <NumInput
                className="w-16"
                min={1}
                max={20}
                value={cfg.ballBoost?.[i] ?? 1}
                onChange={(v) => {
                  const boosts = cfg.tiers.map((_, j) => cfg.ballBoost?.[j] ?? 1)
                  boosts[i] = n(v, 1, 20, 1)
                  set({ ballBoost: boosts })
                }}
              />
            </Field>
          ))}
        </div>
        <Field label="Daily cap" hint="coins a player can earn a UTC day, every friend together">
          <NumInput className="w-24" min={0} value={cfg.dailyCap} onChange={(v) => set({ dailyCap: n(v, 0, 9999, 50) })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          {cfg.market.map((m, i) => (
            <Field key={m.key} label={data?.items[m.key]?.name ?? m.key} hint="price · weekly limit">
              <div className="flex gap-1.5">
                <NumInput
                  className="w-20"
                  min={1}
                  value={m.price}
                  onChange={(v) => set({ market: cfg.market.map((x, j) => (j === i ? normaliseMarketItem({ ...x, price: v ?? 1 }) : x)) })}
                />
                <NumInput
                  className="w-16"
                  min={1}
                  max={99}
                  value={m.limit}
                  onChange={(v) => set({ market: cfg.market.map((x, j) => (j === i ? normaliseMarketItem({ ...x, limit: v ?? 1 }) : x)) })}
                />
              </div>
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Shiny of the week: price">
            <NumInput className="w-24" min={1} value={cfg.shiny.price} onChange={(v) => set({ shiny: { ...cfg.shiny, price: n(v, 1, 99999, 150) } })} />
          </Field>
          <Field label="Shiny of the week: level">
            <NumInput className="w-20" min={1} max={100} value={cfg.shiny.level} onChange={(v) => set({ shiny: { ...cfg.shiny, level: n(v, 1, 100, 15) } })} />
          </Field>
          <Field
            label="Shiny pool (Pokédex numbers, one a week in this order)"
            hint={`this week: ${shinyNow ? `#${shinyNow} ${data?.species[shinyNow]?.name ?? ''}` : 'none'}`}
          >
            <input
              aria-label="Shiny pool"
              className={cx(inputCls, 'w-full')}
              defaultValue={cfg.shiny.pool.join(', ')}
              onBlur={(e) =>
                set({
                  shiny: {
                    ...cfg.shiny,
                    pool: e.target.value
                      .split(/[^0-9]+/)
                      .map(Number)
                      .filter((d) => Number.isInteger(d) && d > 0 && (!data || data.species[d])),
                  },
                })
              }
            />
          </Field>
        </div>
      </div>
    </Box>
  )
}

/**
 * The General upgrades (docs/25): the levels' numbers. Their switches (the tab, the Shiny Charm, and the Link Cable and
 * Bait that came with them) are on the Switches tab; the server reads the General one too, for the golden names.
 */
function GeneralBox() {
  const data = useAdminData()
  const wild = data?.config.shinyChance ?? 0
  const wildOdds = wild > 0 ? `1 in ${Math.round(1 / wild)}` : 'never'
  const [raw, setRaw] = useConfigRow('general')
  const cfg: GeneralConfig = { ...DEFAULT_CONFIG.general, ...(raw ?? {}) }
  const set = (patch: Partial<GeneralConfig>) => setRaw({ ...cfg, ...patch })
  const row = <K extends 'luck' | 'offline' | 'charm'>(k: K, i: number, patch: Partial<GeneralConfig[K][number]>) =>
    set({ [k]: cfg[k].map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  return (
    <Box
      title="General upgrades" icon="navUpgrades"
      hint={`The Upgrades screen's third tab: Capture Luck, offline earnings, I am just rich, the Shiny Charm (level 0 is the wild odds, now ${wildOdds}; a level never makes them worse).`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Offline earnings count up to (hours)" hint="per absence, on the server's clock">
          <NumInput min={1} max={168} value={cfg.offlineMaxHours} onChange={(v) => set({ offlineMaxHours: Math.max(1, v ?? 24) })} />
        </Field>
        <Field label="Offline earnings at level 0 (₽ / hour)" hint="before any level is bought; 0 = nothing">
          <NumInput min={0} value={cfg.offlineBase} onChange={(v) => set({ offlineBase: Math.max(0, v ?? 0) })} />
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
 * The battle powers (docs/35): the numbers of Mega Evolution's gem rules, Gigantamax's newer rules and Z-Moves. Their
 * switches are on the Switches tab (Off: Mega Evolution and Gigantamax as before, no Z-Moves; the server checks them
 * for Versus).
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

/**
 * Friend invite rewards (docs/15 §25): the gauge's tiers — each a number of invited new players who have won their first
 * badge, and the gifts it gives (the same editor as a message's gifts). The server reads the same row (0051): it counts
 * the invites only while the switch isn't off, and hands each tier over once.
 */
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

/**
 * Welcome-back gifts (docs/58): the cooldown and the tiers — each a number of days away and the gifts it gives (the
 * same editor as a message's gifts). The server reads the same row (0103): on a return it writes the player a message
 * from you with the highest tier's gifts, and only while the Gifts switch (Messages) is on for them too.
 */
function WelcomeBackBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('welcomeBack')
  const cfg: WelcomeBackConfig = { ...DEFAULT_CONFIG.welcomeBack, ...(raw ?? {}) }
  const set = (patch: Partial<WelcomeBackConfig>) => setRaw({ ...cfg, ...patch })
  const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : []
  const setTier = (i: number, patch: Partial<WelcomeBackConfig['tiers'][number]>) =>
    set({ tiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  // What the server will read: in order, each number of days once, only tiers whose every gift is readable.
  const seen = welcomeBackTiers(cfg)
  const nextDays = Math.min(WELCOME_BACK_DAYS_MAX, Math.max(0, ...tiers.map((t) => Number(t.minDays) || 0)) + 7)
  const clampDays = (v: number | null) => Math.max(1, Math.min(WELCOME_BACK_DAYS_MAX, Math.round(v ?? 1)))
  return (
    <Box
      title="Welcome back" icon="gift"
      hint="A player back after days away (the days the server saw them play: back the next day = 1) finds a message from you with the gifts of the highest tier reached, opened like any message's gifts, at most once per cooldown. Never for a new player. The server checks the switch, and needs the Gifts switch (Messages) on for the player too."
    >
      <Field
        label="Cooldown (days)"
        hint={`at most one welcome-back gift per player every this many days (1–${WELCOME_BACK_DAYS_MAX})`}
      >
        <NumInput
          className="w-24"
          value={cfg.cooldownDays}
          min={1}
          max={WELCOME_BACK_DAYS_MAX}
          onChange={(v) => set({ cooldownDays: clampDays(v) })}
        />
      </Field>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {tiers.map((t, i) => (
          <li key={i} className="flex flex-col gap-2 border-2 border-shadow p-2">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Days away, at least" hint={`1–${WELCOME_BACK_DAYS_MAX}`}>
                <NumInput
                  className="w-24"
                  value={t.minDays}
                  min={1}
                  max={WELCOME_BACK_DAYS_MAX}
                  onChange={(v) => setTier(i, { minDays: clampDays(v) })}
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
                hint="in your message when they come back"
              />
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <PixelButton
          size="sm"
          disabled={tiers.length >= WELCOME_BACK_TIERS_MAX}
          onClick={() => set({ tiers: [...tiers, { minDays: nextDays, gifts: [] }] })}
        >
          Add a tier
        </PixelButton>
        <span className="text-base text-muted">
          {WELCOME_BACK_TIERS_MAX} tiers at most. Only the highest tier reached is given. A tier without a gift, or a
          number of days already used, is left out.
        </span>
      </div>
      {data && (
        <p className="text-lg">
          Players get:{' '}
          {seen.length
            ? seen.map((t) => `${t.minDays}+ days → ${t.gifts.map((g) => giftName(data, g)).join(' + ')}`).join(' · ')
            : 'nothing (no tier).'}{' '}
          · one every {welcomeBackCooldown(cfg)} days at most.
        </p>
      )}
    </Box>
  )
}

/**
 * Pokémon Day Care, one for every region: when it opens, how fast residents train, the friend slots, the two Egg
 * checks, Egg now and what Eggs hatch into.
 */
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
        <Field label="Unowned weight" hint="× odds of a line, or a pool species, not in the Pokédex (owned = 1)">
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
          An Egg hatches the first form of one parent’s line (Ditto passes none on), from the regions the player
          has discovered, into the Box they pick. An Egg no parent passes a line on to (the free first one, Ditto
          × Ditto) hatches the first form of a line that evolves, starters excluded, from the region it is
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

/** The Game tab: pacing, encounters, XP, battles, saves, friends, the player's help, the XP curve and the starters. */
function GameSettings() {
  const data = useAdminData()
  const [encounterMode, setEncounterMode] = useConfigRow('encounterMode')
  const [hpMultiplier, setHpMultiplier] = useConfigRow('hpMultiplier')
  const [speedPerLevel, setSpeedPerLevel] = useConfigRow('speedPerLevel')
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
  const [multiExp, setMultiExp] = useConfigRow('multiExpShare')
  const [multiGap, setMultiGap] = useConfigRow('multiExpGapBonus')
  const [multiMax, setMultiMax] = useConfigRow('multiExpMaxShare')
  const [xpMult, setXpMult] = useConfigRow('xpMultiplier')
  const [showRound, setShowRound] = useConfigRow('showRoundGauge')
  const [showAhead, setShowAhead] = useConfigRow('showRoundPreview')
  const [shiny, setShiny] = useConfigRow('shinyChance')
  const [fossilShiny, setFossilShiny] = useConfigRow('fossilShinyChance')
  const [cloudSync, setCloudSync] = useConfigRow('cloudSyncMinutes')
  const [maxFriends, setMaxFriends] = useConfigRow('maxFriends')
  const [fph, setFph] = useState(80)
  const curve = useMemo(() => ({ ...DEFAULT_CONFIG.xpCurve, ...xpCurve }), [xpCurve])

  return (
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
          <Field label="speedPerLevel" hint="Speed = the species' base Speed stat + this × level: who acts first">
            <NumInput step={0.5} value={speedPerLevel} min={0} onChange={(v) => setSpeedPerLevel(Math.max(0, v ?? 1))} />
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
          <Field label="fossilShinyChance" hint={`chance a fossil revives shiny, wherever it was found · its own odds: the Shiny Charm and Shiny Parade don't change them · 0.1 = 1 in 10${Number(fossilShiny) > 0 ? ` · now 1 in ${Math.round(1 / Number(fossilShiny))}` : ' · now off'}`}>
            <NumInput step={0.01} value={fossilShiny} min={0} max={1} onChange={(v) => setFossilShiny(Math.max(0, Math.min(1, v ?? 0)))} />
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

      <Box title="XP curve" icon="up" hint="xpToNext(L) = ⌈A·L^B⌉ + C">
        <div className="flex flex-wrap gap-3">
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
      </Box>

      <Box title="Starters" icon="ball">
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
      </Box>
    </div>
  )
}

const TABS = [
  { id: 'switches', label: 'Switches', icon: 'gear' },
  { id: 'game', label: 'Game', icon: 'trophy' },
  { id: 'odds', label: 'Pity & status', icon: 'burn' },
  { id: 'dayCare', label: 'Day Care', icon: 'heal' },
  { id: 'extreme', label: 'Extreme mode', icon: 'skull' },
  { id: 'doubles', label: 'Double battles', icon: 'vs' },
  { id: 'trades', label: 'Trades', icon: 'trade' },
  { id: 'versus', label: 'Versus league', icon: 'trophy' },
  { id: 'areaVersus', label: 'Real-player battles', icon: 'user' },
  { id: 'general', label: 'General upgrades', icon: 'navUpgrades' },
  { id: 'powers', label: 'Battle powers', icon: 'up' },
  { id: 'invites', label: 'Invite rewards', icon: 'gift' },
  { id: 'friendship', label: 'Friendship', icon: 'heart' },
  { id: 'welcomeBack', label: 'Welcome back', icon: 'gift' },
  { id: 'push', label: 'Push', icon: 'bell' },
  { id: 'gameCorner', label: 'Game Corner', icon: 'coin' },
  { id: 'unown', label: 'Unown Pokédex', icon: 'book' },
  { id: 'talents', label: 'Hidden talents', icon: 'talent' },
  { id: 'intros', label: 'Intros', icon: 'sparkle' },
  { id: 'support', label: 'Support & Discord', icon: 'heart' },
  { id: 'rows', label: 'All rows', icon: 'wrench' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[]
type TabId = (typeof TABS)[number]['id']

/** A config row as stored: any shape, so a feature can say where in it its switch is. */
type Row = Record<string, unknown> | null | undefined

/**
 * A feature's Off / On for admin / On for everyone (docs/15 §20): its config row, where in the row the switch is, and
 * the tab with its numbers if it has any.
 */
interface Feature {
  name: string
  tab?: TabId
  row: keyof GameConfig
  get: (row: Row) => unknown
  put: (row: Row, access: EventAccess) => Row
}

const D = DEFAULT_CONFIG as unknown as Record<keyof GameConfig, Row>

/** The switch is the row's own `access`; the row is written whole, over its defaults (`defaults`: the row's own). */
const own = (name: string, row: keyof GameConfig, tab?: TabId, defaults: Row = D[row]): Feature => ({
  name,
  tab,
  row,
  get: (r) => r?.access ?? defaults?.access,
  put: (r, access) => ({ ...defaults, ...r, access }),
})

/** The switch alone is written: the rest of the row stays the game's own (Route 1's rounds). */
const bare = (name: string, row: keyof GameConfig): Feature => ({
  name,
  row,
  get: (r) => r?.access,
  put: (r, access) => ({ ...r, access }),
})

/** The switch is `part.access` in the row (the Mega gems', Gigantamax's newer rules). */
const inPart = (name: string, row: keyof GameConfig, part: string, tab?: TabId): Feature => ({
  name,
  tab,
  row,
  get: (r) => (r?.[part] as Row)?.access,
  put: (r, access) => ({ ...D[row], ...r, [part]: { ...(D[row]?.[part] as Row), ...(r?.[part] as Row), access } }),
})

/** The switch is one field of the row (the Shiny Charm's, an item's). */
const field = (name: string, row: keyof GameConfig, key: string, tab?: TabId): Feature => ({
  name,
  tab,
  row,
  get: (r) => r?.[key],
  put: (r, access) => ({ ...D[row], ...r, [key]: access }),
})

const FEATURES: Feature[] = [
  own('Day and night (Johto)', 'dayNight'),
  own('Idle mode', 'idleMode'),
  own('Trainer looks', 'looks'),
  bare('League heal', 'leagueHeal'),
  own('Legendary intros', 'legendCinema', 'intros'),
  own('Champion intros', 'championCinema', 'intros'),
  bare('Route 1 opening & tutorial', 'openingRounds'),
  own('Unown Pokédex', 'unownDex', 'unown'),
  own('Hidden talents', 'hiddenTalents', 'talents'),
  bare('Outfits', 'outfits'),
  own('Extreme mode', 'extreme', 'extreme'),
  own('Extreme Pokémon Centers', 'extremeCenters', 'extreme'),
  own('Double battles', 'doubleBattles', 'doubles'),
  own('Trades', 'trade', 'trades'),
  own('Versus league', 'versusLeague', 'versus', VERSUS_LEAGUE_DEFAULTS as unknown as Row),
  field('Versus global board', 'versusLeague', 'globalAccess', 'versus'),
  own('Real-player battles', 'areaVersus', 'areaVersus', AREA_VERSUS_DEFAULTS as unknown as Row),
  own('Game Corner', 'slotMachine', 'gameCorner'),
  own('General upgrades', 'general', 'general'),
  field('Shiny Charm', 'general', 'charmAccess', 'general'),
  field('Link Cable', 'itemSwitches', 'link-cable'),
  field('Bait', 'itemSwitches', 'bait'),
  inPart('Mega Gems', 'megaEvolution', 'gems', 'powers'),
  inPart('Gigantamax', 'gigantamax', 'boost', 'powers'),
  own('Z-Moves', 'zMove', 'powers'),
  own('Friend invite rewards', 'inviteRewards', 'invites'),
  own('Friendship & Friend Market', 'friendship', 'friendship'),
  own('Welcome back', 'welcomeBack', 'welcomeBack'),
  own('Push notifications', 'push', 'push'),
]

const isAccess = (v: unknown): v is EventAccess => (EVENT_ACCESS as readonly unknown[]).includes(v)

function FeatureRow({ feature, open }: { feature: Feature; open: (tab: TabId) => void }) {
  const [raw, setRaw] = useConfigRow(feature.row)
  const row = raw as unknown as Row
  // A row from before its switch has none: the default's, else Off.
  const stored = feature.get(row)
  const fallback = feature.get(D[feature.row])
  const access = isAccess(stored) ? stored : isAccess(fallback) ? fallback : 'off'
  const { tab } = feature
  return (
    <tr className="border-t-2 border-line">
      <th scope="row" className="py-1.5 pr-3 text-left text-lg font-normal">
        {tab ? (
          <button type="button" className="min-h-[34px] text-left underline" onClick={() => open(tab)}>
            {feature.name}
          </button>
        ) : (
          feature.name
        )}
      </th>
      <td className="py-1.5 text-right">
        <AccessSwitch
          value={access}
          onChange={(a) => setRaw(feature.put(row, a) as unknown as GameConfig[typeof feature.row])}
          label={`${feature.name}: who has it`}
        />
      </td>
    </tr>
  )
}

/** The switches, split in two tables side by side on a wide screen. */
function SwitchesTable({ open }: { open: (tab: TabId) => void }) {
  const half = Math.ceil(FEATURES.length / 2)
  return (
    <Box
      title="Feature switches" icon="gear"
      hint="Off: nowhere in the game. On for admin: only you, signed in, to try it first. On for everyone: open. A name opens its numbers. Save, then Publish."
    >
      <div className="grid gap-x-6 lg:grid-cols-2">
        {[FEATURES.slice(0, half), FEATURES.slice(half)].map((list, i) => (
          <table key={i} className="w-full">
            <tbody>
              {list.map((f) => (
                <FeatureRow key={f.name} feature={f} open={open} />
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </Box>
  )
}

/**
 * Admin → Config: sub-tabs at the top, the feature switches first, then one tab per feature with its numbers. The tab
 * is in the address (?tab=trades), so a reload stays on it.
 */
export function ConfigSection() {
  const [version] = useConfigRow('configVersion')
  const [params, setParams] = useSearchParams()
  const tab: TabId = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as TabId) : 'switches'
  const open = (id: TabId) => setParams({ tab: id }, { replace: true })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-3xl">
          <PixelIcon name="gear" size={26} />
          Config
        </h2>
        <span className="text-lg">content version {String(version)} (bumped by Publish)</span>
      </div>
      <nav aria-label="Config" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => open(t.id)}
            className={cx(
              'flex min-h-[44px] items-center gap-2 px-3 text-xl leading-none shadow-card',
              tab === t.id ? 'bg-gold-pale shadow-card-gold' : 'bg-panel',
            )}
          >
            <PixelIcon name={t.icon} size={20} />
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'switches' && <SwitchesTable open={open} />}
      {tab === 'game' && <GameSettings />}
      {tab === 'odds' && (
        <div className="grid gap-4 xl:grid-cols-2">
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
          <StatusRulesBox />
        </div>
      )}
      {tab === 'dayCare' && <DayCareBox />}
      {tab === 'extreme' && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <ExtremeBox />
          <ExtremeCentersBox />
        </div>
      )}
      {tab === 'doubles' && <DoubleBattlesBox />}
      {tab === 'trades' && <TradesBox />}
      {tab === 'versus' && (
        <div className="grid items-start gap-4">
          <VersusLeagueBox />
          <VersusLeagueGroups />
        </div>
      )}
      {tab === 'areaVersus' && <AreaVersusBox />}
      {tab === 'general' && <GeneralBox />}
      {tab === 'powers' && <BattlePowersBox />}
      {tab === 'invites' && <InviteRewardsBox />}
      {tab === 'friendship' && <FriendshipBox />}
      {tab === 'welcomeBack' && <WelcomeBackBox />}
      {tab === 'push' && <PushBox />}
      {tab === 'gameCorner' && <SlotMachineBox />}
      {tab === 'unown' && <UnownDexBox />}
      {tab === 'talents' && <HiddenTalentsBox />}
      {tab === 'intros' && <LegendIntrosBox />}
      {tab === 'intros' && <ChampionIntrosBox />}
      {tab === 'support' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <DonationBox />
          <DiscordBox />
        </div>
      )}
      {tab === 'rows' && (
        <>
          <section className="grid gap-3 md:grid-cols-2">
            <JsonField k="ai" />
            <JsonField k="startInventory" />
          </section>
          <DataTable
            table="game_config"
            title="All game_config rows"
            newRow={() => ({ key: `newKey${Date.now().toString(36)}`, value: null })}
            columns={[
              { key: 'key', label: 'Key', kind: 'text' },
              { key: 'value', label: 'Value (JSON)', kind: 'json', nullable: true },
            ]}
          />
        </>
      )}
    </div>
  )
}
