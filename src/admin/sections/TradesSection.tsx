// Admin → Trades (docs/23): the open listings, newest first (table trade_listings, migration 0044, admin-only reads
// via RLS), with Remove: the listing ends as "removed" and its Pokémon goes back to its owner at their next check.
import { useCallback, useEffect, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { parseWant, removeListing } from '@/lib/trades'
import { pushToast } from '@/store/game'
import { useAdminData } from '../store'
import { Box } from '../widgets'

interface Row {
  id: string
  code: string
  owner_name: string | null
  dex: number
  level: number
  shiny: boolean
  want: unknown
  visibility: string
  created_at: string
  ends_at: string
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function TradesSection() {
  const data = useAdminData()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const client = await getSupabase()
    if (!client) return setError('Supabase is not configured')
    const { data: list, error: err } = await client
      .from('trade_listings')
      .select('id, code, owner_name, dex, level, shiny, want, visibility, created_at, ends_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(500)
    if (err) setError(err.message)
    else setRows((list ?? []) as Row[])
  }, [])
  useEffect(() => void load(), [load])

  const name = (dex: number) => data?.species[dex]?.name ?? `#${dex}`
  const wantText = (raw: unknown) => {
    const w = parseWant(raw)
    return w.kind === 'species' ? name(w.dex) : w.kind === 'notOwned' ? 'any they don’t own' : 'anything'
  }
  const remove = async (r: Row) => {
    setBusy(r.id)
    try {
      if (!(await removeListing(r.id))) throw new Error('Not removed: it was taken or ended meanwhile')
      setRows((cur) => cur?.filter((x) => x.id !== r.id) ?? null)
      pushToast(`Removed: ${name(r.dex)} goes back to ${r.owner_name ?? 'its owner'}`, 'good')
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setBusy(null)
    }
  }

  if (!isSupabaseConfigured) return <p className="text-lg text-muted">Trades need Supabase.</p>
  return (
    <Box
      title="Trades"
      icon="trade"
      hint="Open listings. Remove ends one: its Pokémon goes back to its owner the next time they play."
      actions={
        <PixelButton size="sm" onClick={() => void load()}>
          Refresh
        </PixelButton>
      }
    >
      {error && <p className="text-lg text-danger">{error}</p>}
      {!rows && !error && <p className="text-lg text-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-lg text-muted">No open listing.</p>}
      {rows && rows.length > 0 && (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 bg-paper py-1 pl-1.5 pr-2 shadow-ring-line">
              <MiniSprite dex={r.dex} size={32} />
              <span className="min-w-0 flex-1 text-lg">
                <b className="font-normal">
                  {name(r.dex)}
                  {r.shiny ? ' ★' : ''} Lv.{r.level}
                </b>{' '}
                <span className="text-muted">
                  by {r.owner_name ?? '—'} · for {wantText(r.want)} · {r.visibility} · {r.code} · ends {when(r.ends_at)}
                </span>
              </span>
              <PixelButton size="sm" variant="danger" disabled={busy === r.id} onClick={() => void remove(r)}>
                Remove
              </PixelButton>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}
