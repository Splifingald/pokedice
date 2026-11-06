// Admin → Config: Friend Battles (docs/65). Its numbers (game_config `friendBattles`, read by the server too: migration
// 0131; its switch is on the Switches tab, beta testers included), and the beta testers' list, beside the switches,
// which every feature set "On for beta testers" opens to.
import { useCallback, useEffect, useState } from 'react'
import { FRIEND_BATTLES_DEFAULTS, type FriendBattlesConfig } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { TrainerLook } from '@/components/TrainerLook'
import { avatarOf } from '@/lib/avatars'
import { getSupabase } from '@/lib/supabase'
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

interface Tester {
  id: string
  name: string
  avatar: string
  code: string | null
  addedAt: string
}

const parseTesters = (raw: unknown): Tester[] =>
  Array.isArray(raw)
    ? raw.map((r) => {
        const o = r as Record<string, unknown>
        return {
          id: String(o.id),
          name: String(o.name ?? 'Trainer'),
          avatar: String(o.avatar ?? 'red'),
          code: o.code ? String(o.code) : null,
          addedAt: String(o.addedAt ?? ''),
        }
      })
    : []

const ERRORS: Record<string, string> = {
  beta_not_found: 'Nobody found: try their friend ID.',
  beta_ambiguous: 'Several players have that name: use their friend ID.',
}

function refusal(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883')
    return 'The database has no beta testers yet: run supabase/migrations/0131_friend_battles.sql.'
  const key = Object.keys(ERRORS).find((k) => e.message?.includes(k))
  return key ? ERRORS[key]! : `Refused: ${e.message ?? String(err)}`
}

const friendId = (code: string | null) => (code ? `${code.slice(0, 4)}-${code.slice(4)}` : '—')

/** The beta testers (docs/65 §3): who sees what the admin set "On for beta testers", signed in. */
export function BetaTestersBox() {
  const [list, setList] = useState<Tester[] | null>(null)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const call = useCallback(async (fn: string, args?: Record<string, unknown>) => {
    const client = await getSupabase()
    if (!client) throw new Error('no database')
    const { data, error } = await client.rpc(fn, args)
    if (error) throw error
    return data as unknown
  }, [])
  const load = useCallback(() => {
    call('beta_testers_list')
      .then((d) => setList(parseTesters(d)))
      .catch((err) => setNote(refusal(err)))
  }, [call])
  useEffect(load, [load])
  const add = async () => {
    if (!query.trim()) return
    setNote('…')
    try {
      const t = parseTesters([await call('beta_tester_add', { p_query: query.trim() })])[0]!
      setNote(`${t.name} is a beta tester.`)
      setQuery('')
      load()
    } catch (err) {
      setNote(refusal(err))
    }
  }
  const remove = async (t: Tester) => {
    try {
      await call('beta_tester_remove', { p_user: t.id })
      setNote(`${t.name} is no longer a beta tester.`)
      load()
    } catch (err) {
      setNote(refusal(err))
    }
  }
  return (
    <Box
      title="Beta testers"
      icon="user"
      hint={`A tester sees every feature set to "On for beta testers", signed in, on any device; you always do. Removing one hides those features at their next load; their data stays. ${list ? `${list.length} tester${list.length === 1 ? '' : 's'}.` : ''}`}
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input
          className="min-h-[40px] min-w-0 flex-1 bg-paper px-2 text-lg shadow-field"
          aria-label="Find a player"
          placeholder="Name, friend ID or e-mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <PixelButton size="sm" type="submit">
          Add
        </PixelButton>
      </form>
      {note && <p className="text-base text-muted">{note}</p>}
      {list && list.length === 0 && <p className="text-base text-muted">No beta testers yet.</p>}
      <ul className="flex flex-col">
        {list?.map((t) => (
          <li key={t.id} className="flex items-center gap-2 border-t-2 border-line py-1.5">
            <TrainerLook src={avatarOf(t.avatar).src} w={40} h={44} />
            <span className="min-w-0 flex-1">
              <span className="block text-lg leading-tight">{t.name}</span>
              <span className="block text-base text-muted">
                {friendId(t.code)} · added {t.addedAt ? new Date(t.addedAt).toLocaleDateString() : '—'}
              </span>
            </span>
            <PixelButton size="sm" onClick={() => void remove(t)}>
              Remove
            </PixelButton>
          </li>
        ))}
      </ul>
    </Box>
  )
}
