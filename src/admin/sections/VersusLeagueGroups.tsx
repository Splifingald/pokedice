// Admin → Config → Versus league: the week's groups as they are when "Fetch the groups" is pressed (migration 0086,
// the admin's alone), never fetched by itself: how many groups, who is in each (players and bots told apart, ranked as
// their board), each player's matches this week, and how often each member was fought. This week's or last week's.
import { useState } from 'react'
import { VERSUS_LEAGUE_DEFAULTS, type VersusLeagueConfig } from '@/engine'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerLook } from '@/components/TrainerLook'
import { avatarOf } from '@/lib/avatars'
import {
  fetchLeagueAdminBoard,
  leagueAdminTotals,
  leagueErrorCode,
  type LeagueAdminBoard,
  type LeagueAdminMember,
} from '@/lib/versusLeague'
import { cx } from '@/theme/util'
import { useAdminData } from '../store'
import { Box } from '../widgets'
import { useConfigRow } from './ConfigSection'

const clock = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/** "5 min ago", "3 h ago", "2 d ago". */
function ago(ms: number, now: number) {
  const mins = Math.max(0, Math.round((now - ms) / 60_000))
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}

/** "3 d 18 h", "5 h 12 min". */
function left(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(mins / 60)
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${mins % 60} min`
}

export function VersusLeagueGroups() {
  const data = useAdminData()
  const speciesName = (dex: number) => data?.species[dex]?.name ?? `#${dex}`
  const [raw] = useConfigRow('versusLeague')
  const cfg: VersusLeagueConfig = { ...VERSUS_LEAGUE_DEFAULTS, ...(raw ?? {}) }
  const [shown, setShown] = useState<{ board: LeagueAdminBoard; at: number; last: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (last: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const board = await fetchLeagueAdminBoard(last)
      setShown({ board, at: Date.now(), last })
    } catch (err) {
      const code = leagueErrorCode(err)
      setError(
        code === 'versus_league_missing'
          ? 'The database has no such view yet: run supabase/migrations/0086_versus_league_admin_board.sql (after 0082).'
          : `Refused: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  const totals = shown && leagueAdminTotals(shown.board)
  return (
    <Box
      title="The week's groups"
      icon="friends"
      hint="Every group of the league as it is when you press Fetch (nothing loads by itself): who is in each, players and bots, ranked as their board, each player's matches this week and how often each was fought."
      actions={
        <>
          <PixelButton size="sm" variant="primary" disabled={busy} onClick={() => void load(false)}>
            {busy ? 'Fetching…' : 'Fetch the groups'}
          </PixelButton>
          <PixelButton size="sm" disabled={busy} onClick={() => void load(true)}>
            Last week
          </PixelButton>
        </>
      }
    >
      {error && <p className="m-0 text-lg text-danger">{error}</p>}
      {!shown && !error && <p className="m-0 text-lg text-muted">Not fetched yet.</p>}
      {shown && totals && (
        <>
          <p className="m-0 text-lg leading-snug">
            {shown.last ? 'Last week' : 'This week'}, from Monday {shown.board.week} ·{' '}
            {shown.board.closed
              ? 'rewards sent'
              : shown.board.endsAt > shown.at
                ? `ends in ${left(shown.board.endsAt - shown.at)}`
                : 'ended, rewards not sent yet'}{' '}
            · <span className="text-muted">fetched {clock(shown.at)}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="dark">
              {totals.groups} group{totals.groups === 1 ? '' : 's'}
              {shown.board.opened != null && ` (opened with ${shown.board.opened})`}
            </Chip>
            <Chip>{totals.members} in them</Chip>
            <Chip tone="blue">
              {totals.players} player{totals.players === 1 ? '' : 's'}
            </Chip>
            <Chip>
              {totals.bots} bot{totals.bots === 1 ? '' : 's'}
            </Chip>
            <Chip tone="green">{totals.fought} fought this week</Chip>
            <Chip>
              {totals.matches} match{totals.matches === 1 ? '' : 'es'}
              {totals.open > 0 && `, ${totals.open} being fought`}
            </Chip>
          </div>
          {shown.board.groups.length === 0 && (
            <p className="m-0 text-lg text-muted">
              No group {shown.last ? 'that week' : 'yet'}: the week's first match opens them.
            </p>
          )}
          {shown.board.groups.map((g) => (
            <Group
              key={g.n}
              n={g.n}
              members={g.members}
              size={cfg.groupSize}
              now={shown.at}
              speciesName={speciesName}
            />
          ))}
        </>
      )}
    </Box>
  )
}

function Group({
  n,
  members,
  size,
  now,
  speciesName,
}: {
  n: number
  members: LeagueAdminMember[]
  size: number
  now: number
  speciesName: (dex: number) => string
}) {
  const players = members.filter((m) => m.botId == null)
  const matches = players.reduce((sum, m) => sum + m.matches, 0)
  return (
    <section className="grid gap-1.5">
      <h4 className="m-0 flex flex-wrap items-baseline gap-x-2 text-xl font-normal leading-none">
        Group {n}
        <span className="text-base text-muted">
          {members.length}/{size} · {players.length} player{players.length === 1 ? '' : 's'} ·{' '}
          {members.length - players.length} bot{members.length - players.length === 1 ? '' : 's'} · {matches}{' '}
          match
          {matches === 1 ? '' : 'es'}
        </span>
      </h4>
      {members.length === 0 ? (
        <p className="m-0 text-base text-muted">Empty.</p>
      ) : (
        <ol className="m-0 grid list-none gap-1 p-0">
          {members.map((m) => (
            <Member key={m.userId ?? `bot:${m.botId}`} m={m} now={now} speciesName={speciesName} />
          ))}
        </ol>
      )}
    </section>
  )
}

function Member({
  m,
  now,
  speciesName,
}: {
  m: LeagueAdminMember
  now: number
  speciesName: (dex: number) => string
}) {
  const bot = m.botId != null
  return (
    <li
      className={cx(
        'flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 pl-1.5 pr-2',
        bot ? 'bg-well shadow-ring-line' : 'bg-paper shadow-ring-line',
      )}
      title={bot ? `bot #${m.botId}` : (m.userId ?? undefined)}
    >
      <span className="w-7 shrink-0 text-center text-lg tabular-nums text-muted">{m.rank}</span>
      <TrainerLook src={avatarOf(m.avatar).src} w={30} h={32} />
      <span className="flex min-w-[9rem] flex-1 items-center gap-1.5 text-lg leading-none">
        {bot ? (
          <Chip tone="plain" className="text-[14px]">
            BOT
          </Chip>
        ) : (
          <Chip tone="blue" className="text-[14px]">
            PLAYER
          </Chip>
        )}
        <b className="truncate font-normal">{m.name}</b>
      </span>
      <span className="flex shrink-0 items-center">
        {m.team.map((mon, i) => (
          <MiniSprite key={i} dex={mon.dex} size={28} alt={speciesName(mon.dex)} className="-my-1" />
        ))}
      </span>
      <span className="inline-flex w-20 shrink-0 items-center justify-end gap-1 text-lg tabular-nums">
        {m.trophies}
        <PixelIcon name="trophy" size={16} />
      </span>
      <span className="w-full pl-9 text-base leading-tight text-muted">
        {bot
          ? `headed to ${m.botTarget ?? '?'} by Sunday night`
          : m.matches === 0
            ? 'no match this week yet'
            : `${m.matches} match${m.matches === 1 ? '' : 'es'}: ${m.won} won · ${m.lost} lost · ${m.leaves} left${
                m.open ? ` · ${m.open} being fought` : ''
              } · last ${m.lastMatchAt ? ago(m.lastMatchAt, now) : '?'}`}
        {` · fought ${m.faced}× · joined ${ago(m.joinedAt, now)}`}
      </span>
    </li>
  )
}
