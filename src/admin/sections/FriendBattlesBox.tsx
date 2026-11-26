// Admin → Config: Friend Battles (docs/65). Its numbers (game_config `friendBattles`, read by the server too: migration
// 0131; its switch is on the Switches tab, beta testers included). The beta testers' list is the whitelist's
// (PlayerCapBox.tsx, docs/74), beside the switches.
import { FRIEND_BATTLES_DEFAULTS, type FriendBattlesConfig } from '@/engine'
import { Box, Field, NumInput } from '../widgets'
import { useConfigRow } from './ConfigSection'

export function FriendBattlesBox() {
  const [raw, setRaw] = useConfigRow('friendBattles')
  const cfg: FriendBattlesConfig = { ...FRIEND_BATTLES_DEFAULTS, ...(raw ?? {}) }
  const set = (patch: Partial<FriendBattlesConfig>) => setRaw({ ...cfg, ...patch })
  const secs = (v: number | null, min = 5) => Math.max(min, Math.min(3600, Math.floor(v ?? 0)))
  return (
    <Box
      title="Friend Battles"
      icon="vs"
      hint="Live 3 v 3 between two friends who are both in the game, from the Friends page. Classic: each brings their Versus team, unseen until the fight. Draft: the server tosses a coin, then one pick each in turn (A-B-A-B-A-B) from their own Lv.50+ Pokémon, a species taken by one gone for the other; the first picker's team carries the Bonus Shield. Lv.50 with their own dice, no items, no battle powers, no ₽: a head to head per friend, and a friendship interaction. A fight costs each player a battle ticket, taken as it starts. Times in seconds."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Challenge expires" hint="a challenge waits this long for its answer">
          <NumInput min={5} value={cfg.expiry} onChange={(v) => set({ expiry: secs(v) })} />
        </Field>
        <Field label="Draft pick" hint="each pick; time out: the strongest left is picked">
          <NumInput min={5} value={cfg.pick} onChange={(v) => set({ pick: secs(v) })} />
        </Field>
        <Field label="Order / ready" hint="to set the team's order; time out: the order shown is kept">
          <NumInput min={5} value={cfg.order} onChange={(v) => set({ order: secs(v) })} />
        </Field>
        <Field label="Turn" hint="time out: the dice in hand attack">
          <NumInput min={5} value={cfg.turn} onChange={(v) => set({ turn: secs(v) })} />
        </Field>
        <Field label="Reconnect grace" hint="a player not seen this long during a match loses it">
          <NumInput min={10} value={cfg.grace} onChange={(v) => set({ grace: secs(v, 10) })} />
        </Field>
        {/* Stored as the share of the hit still taken (the engine's number); shown as the share blocked, the way the
            players' rules say it ("25% less"). */}
        <Field label="Bonus Shield (% of the hit blocked)" hint="Draft: the opponent's first attack on the first picker's team">
          <NumInput
            min={0}
            max={100}
            value={100 - cfg.shield}
            onChange={(v) => set({ shield: 100 - Math.max(0, Math.min(100, Math.round(v ?? 0))) })}
          />
        </Field>
        <Field label="Switch cooldown (turns)" hint="after a switch, the side's own turns before it may switch again; 0 = none">
          <NumInput
            min={0}
            max={20}
            value={cfg.switchCooldown}
            onChange={(v) => set({ switchCooldown: Math.max(0, Math.min(20, Math.floor(v ?? 0))) })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Battle tickets a midnight" hint="given at each UTC midnight while a player holds fewer than the cap">
          <NumInput min={0} value={cfg.ticketDaily} onChange={(v) => set({ ticketDaily: Math.max(0, Math.floor(v ?? 0)) })} />
        </Field>
        <Field label="Ticket cap" hint="midnights never give past this (bought ones can); a new player starts here">
          <NumInput min={0} value={cfg.ticketCap} onChange={(v) => set({ ticketCap: Math.max(0, Math.floor(v ?? 0)) })} />
        </Field>
        <Field label="Ticket price (Heart Scales)" hint="at the Friend Market; 0 takes them off the shelf">
          <NumInput min={0} value={cfg.ticketPrice} onChange={(v) => set({ ticketPrice: Math.max(0, Math.floor(v ?? 0)) })} />
        </Field>
        <Field label="Tickets sold a week" hint="per player, the market's week">
          <NumInput min={0} value={cfg.ticketWeekly} onChange={(v) => set({ ticketWeekly: Math.max(0, Math.floor(v ?? 0)) })} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-lg">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.classic} onChange={(e) => set({ classic: e.target.checked })} /> Classic mode
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.draft} onChange={(e) => set({ draft: e.target.checked })} /> Draft mode
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.lv100} onChange={(e) => set({ lv100: e.target.checked })} /> Lv.100 battles
          (beside Lv.50)
        </label>
      </div>
    </Box>
  )
}
