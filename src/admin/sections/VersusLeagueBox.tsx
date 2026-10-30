// Admin → Config: the weekly Versus league (docs/44). Its numbers (game_config `versusLeague`, which the server reads
// too: migration 0082; its switch is on the Switches tab), and buttons to try it without waiting: the hourly tick now,
// bots seated now, and the week's bot teams (0092): which set they come from, and this week's made now, from here.
import { useState } from 'react'
import { VERSUS_LEAGUE_DEFAULTS, weekBotTeams, type VersusLeagueConfig } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import {
  fetchLeagueBotSet,
  leagueAdmin,
  leagueErrorCode,
  putLeagueBotTeams,
  type LeagueBotSet,
} from '@/lib/versusLeague'
import { useAdminData } from '../store'
import { Box, Field, NumInput } from '../widgets'
import { useConfigRow } from './ConfigSection'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const when = (ms: number | null) =>
  ms == null
    ? '?'
    : new Date(ms).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })

/** "This week's own teams (40 / 40 / 40 / 80 a tier), made Mon 27 Oct, 00:13." and the like. */
function botSetNote(s: LeagueBotSet): string {
  const tiers = `${s.tiers.join(' / ')} a tier`
  if (s.set === s.week) return `This week's own bot teams (${tiers}), made ${when(s.madeAt)}.`
  const from = s.set ? `the teams made for the week of ${s.set} (${tiers})` : `the built-in teams (${tiers})`
  const next = s.due
    ? 'The hourly job makes them on the live site, or press Make.'
    : 'Nothing is made while the league is Off.'
  return `This week's bot teams aren't made yet: its bots take ${from}. ${next}`
}

export function VersusLeagueBox() {
  const [raw, setRaw] = useConfigRow('versusLeague')
  const [gifts] = useConfigRow('gifts')
  const cfg: VersusLeagueConfig = { ...VERSUS_LEAGUE_DEFAULTS, ...(raw ?? {}) }
  const set = (patch: Partial<VersusLeagueConfig>) => setRaw({ ...cfg, ...patch })
  const whole = (v: number | null, min = 0) => Math.max(min, Math.floor(v ?? 0))
  const [note, setNote] = useState<string | null>(null)
  const data = useAdminData()
  const refused = (err: unknown) =>
    setNote(
      leagueErrorCode(err) === 'versus_league_missing'
        ? 'The database has no weekly bot teams yet: run supabase/migrations/0092_versus_bot_weeks.sql (after 0082).'
        : `Refused: ${leagueErrorCode(err)} (${err instanceof Error ? err.message : String(err)})`,
    )
  const run = async (action: 'tick' | 'seat_bots') => {
    setNote('…')
    try {
      const n = await leagueAdmin(action)
      setNote(action === 'seat_bots' ? `${n} bot(s) seated in this week's groups.` : 'Tick done.')
    } catch (err) {
      refused(err)
    }
  }
  const checkTeams = async () => {
    setNote('…')
    try {
      setNote(botSetNote(await fetchLeagueBotSet()))
    } catch (err) {
      refused(err)
    }
  }
  // Drawn here as the hourly job draws them (the same week, the same seeds), over the content as Admin has it.
  const makeTeams = async () => {
    if (!data) return
    setNote('…')
    try {
      const before = await fetchLeagueBotSet()
      if (before.set === before.week) {
        setNote(`Made already. ${botSetNote(before)}`)
        return
      }
      setNote('Drawing this week’s teams…')
      // Lets the note show before the draw holds the page for a second or two.
      await new Promise((r) => setTimeout(r, 30))
      const n = await putLeagueBotTeams(before.week, weekBotTeams(data, before.week))
      const after = await fetchLeagueBotSet()
      setNote(n ? `${n} teams made for the week of ${after.week}. ${botSetNote(after)}` : botSetNote(after))
    } catch (err) {
      refused(err)
    }
  }
  const access = cfg.access
  return (
    <Box
      title="Versus league"
      icon="trophy"
      hint="On: Versus becomes a weekly league (Monday to Sunday, UTC). Players fight their matches themselves (AUTO optional; no items), against one of 3 opponents near their trophies (players first, bots where nobody fits). A win gives trophies by the Pokémon left, a loss takes the opponent's, a leave the most; nothing is taken below the safe line. Groups of 20 fill as players come, spread over the week's groups; bots take empty places on the bot days and climb. At the end of the week each player gets ₽ for each trophy and the top 10 their Raid Balls and Rare Candies, as a gift message. Bots look like players to everyone but you, and get new teams every week (40 a tier, 80 in the last), made within the hour of Monday 00:00 UTC by a job on the live site. Off: Versus as before; the league's data stays."
    >
      {access !== 'off' && gifts?.access !== 'all' && (
        <p className="m-0 bg-gold-pale p-2 text-base leading-snug">
          The week's rewards arrive as gift messages: switch Gifts on for everyone (Admin → Messages), or they
          wait on their messages until it is.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {([0, 1, 2] as const).map((i) => (
          <Field key={i} label={`Win with ${i + 1} left`} hint="trophies (a loss to that: the same, taken)">
            <NumInput
              min={0}
              value={cfg.trophies[i]}
              onChange={(v) => {
                const next = [...cfg.trophies] as [number, number, number]
                next[i] = whole(v)
                set({ trophies: next })
              }}
            />
          </Field>
        ))}
        <Field label="Safe line" hint="below this many trophies, a loss costs nothing">
          <NumInput min={0} value={cfg.safeBelow} onChange={(v) => set({ safeBelow: whole(v) })} />
        </Field>
        <Field label="Group size" hint="places in a group">
          <NumInput min={2} value={cfg.groupSize} onChange={(v) => set({ groupSize: whole(v, 2) })} />
        </Field>
        <Field label="Players per group on Monday" hint="the rest wait for late players and bots">
          <NumInput min={1} value={cfg.groupFill} onChange={(v) => set({ groupFill: whole(v, 1) })} />
        </Field>
        <Field label="Bots a day" hint="seated per group with room, on each bot day">
          <NumInput min={0} value={cfg.botsPerDay} onChange={(v) => set({ botsPerDay: whole(v) })} />
        </Field>
        <Field label="Opponents' range (%)" hint="of your trophies, either way">
          <NumInput
            min={0}
            value={Math.round(cfg.range * 100)}
            onChange={(v) => set({ range: whole(v) / 100 })}
          />
        </Field>
        <Field label="…at least" hint="trophies either way">
          <NumInput min={0} value={cfg.rangeMin} onChange={(v) => set({ rangeMin: whole(v) })} />
        </Field>
        <Field label="Fastest win (s)" hint="a win sooner is refused">
          <NumInput min={0} value={cfg.minWinSeconds} onChange={(v) => set({ minWinSeconds: whole(v) })} />
        </Field>
        <Field label="Seconds a move" hint="…and sooner than this for each of the player's moves">
          <NumInput
            min={0}
            step={0.05}
            value={cfg.secondsPerMove}
            onChange={(v) => set({ secondsPerMove: Math.max(0, v ?? 0) })}
          />
        </Field>
        <Field label="₽ a trophy" hint="at the end of the week">
          <NumInput
            min={0}
            value={cfg.goldPerTrophy}
            onChange={(v) => set({ goldPerTrophy: Math.max(0, v ?? 0) })}
          />
        </Field>
      </div>
      <Field label="Bot days" hint="UTC; bots take empty places on these days">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = cfg.botDays.includes(i + 1)
            return (
              <label key={d} className="flex items-center gap-1 text-base">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    set({
                      botDays: on
                        ? cfg.botDays.filter((x) => x !== i + 1)
                        : [...cfg.botDays, i + 1].sort((a, b) => a - b),
                    })
                  }
                />
                {d}
              </label>
            )
          })}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((tier) => (
          <Field
            key={tier}
            label={`Bot tier ${tier} from`}
            hint={`trophies; ${tier} battle power${tier > 1 ? 's' : ''}`}
          >
            <NumInput
              min={0}
              value={cfg.botTiers[tier]}
              onChange={(v) => {
                const next = [...cfg.botTiers]
                next[tier] = whole(v)
                set({ botTiers: next })
              }}
            />
          </Field>
        ))}
      </div>
      <Field label="Rewards" hint="each band: the places up to this rank (after the band before)">
        <table className="text-base">
          <thead>
            <tr className="text-left text-muted">
              <th className="pr-3 font-normal">Up to rank</th>
              <th className="pr-3 font-normal">Raid Balls</th>
              <th className="font-normal">Rare Candies</th>
            </tr>
          </thead>
          <tbody>
            {cfg.rewards.map((band, i) => {
              const edit = (patch: Partial<typeof band>) =>
                set({ rewards: cfg.rewards.map((b, j) => (j === i ? { ...b, ...patch } : b)) })
              return (
                <tr key={i}>
                  <td className="pr-3">
                    <NumInput min={1} value={band.upTo} onChange={(v) => edit({ upTo: whole(v, 1) })} />
                  </td>
                  <td className="pr-3">
                    <NumInput
                      min={0}
                      value={band.raidBalls}
                      onChange={(v) => edit({ raidBalls: whole(v) })}
                    />
                  </td>
                  <td>
                    <NumInput
                      min={0}
                      value={band.rareCandies}
                      onChange={(v) => edit({ rareCandies: whole(v) })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <PixelButton size="sm" onClick={() => void run('tick')}>
          Run the hourly tick now
        </PixelButton>
        <PixelButton size="sm" onClick={() => void run('seat_bots')}>
          Seat bots now
        </PixelButton>
        <PixelButton size="sm" onClick={() => void checkTeams()}>
          This week's bot teams
        </PixelButton>
        <PixelButton size="sm" disabled={!data} onClick={() => void makeTeams()}>
          Make this week's bot teams now
        </PixelButton>
        {note && <span className="text-base text-muted">{note}</span>}
      </div>
    </Box>
  )
}
