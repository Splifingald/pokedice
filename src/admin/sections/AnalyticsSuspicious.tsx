// Admin → Analytics → Suspicious saves (docs/63): every cloud save with something no honest game has reached, and why.
// The database reads every save for it (about a second), so it is asked (admin_suspicious, migration 0114) only when
// FETCH is pressed. A row opens the player's panel, where the ban is.
import { useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase } from '@/lib/supabase'
import { cx } from '@/theme/util'
import { errorText } from './AnalyticsPlayer'

export interface SuspiciousRow {
  user_id: string
  realm: string
  name: string
  box: number
  shinies: number
  lv100: number
  gold: number
  candies: number
  masters: number
  top_stack: number
  days: number
  first_day: string | null
  dupes: number
  dex_over: boolean
  future: boolean
  banned: boolean
  reasons: string[]
}

/** What each reason means, as the admin reads it. */
export const REASONS: Record<string, string> = {
  box: 'Box too big for the days played',
  shinies: 'Too many shinies',
  levels: 'Too many Lv.100',
  gold: 'Over ₽5,000,000',
  items: 'Rare Candies, Master Balls or a stack too big',
  trade: 'Still holds a Pokémon it traded away',
  dex: 'Pokédex at its region’s cap',
  future: 'Dated in the future',
}

async function fetchSuspicious(): Promise<SuspiciousRow[]> {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase client unavailable')
  const { data, error } = await c.rpc('admin_suspicious')
  if (error) throw error
  return Array.isArray(data) ? (data as SuspiciousRow[]) : []
}

const num = (n: number) => Number(n).toLocaleString()

export function SuspiciousSaves({ onPick }: { onPick: (player: string, name: string) => void }) {
  const [rows, setRows] = useState<SuspiciousRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBanned, setShowBanned] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchSuspicious())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  const shown = (rows ?? []).filter((r) => showBanned || !r.banned)
  const banned = (rows ?? []).filter((r) => r.banned).length

  return (
    <section className="pixel-panel-dark flex flex-col gap-3 p-4" aria-label="Suspicious saves">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <span className="text-xl uppercase tracking-wider text-gold">Suspicious saves</span>
          <span className="text-base opacity-80">
            Cloud saves with something no honest game has reached. Open one to check it and ban it.
          </span>
        </div>
        <span className="flex-1" />
        {rows && banned > 0 && (
          <label className="flex items-center gap-2 text-lg">
            <input type="checkbox" checked={showBanned} onChange={(e) => setShowBanned(e.target.checked)} />
            Show the banned ({banned})
          </label>
        )}
        <PixelButton size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Fetching…' : 'Fetch'}
        </PixelButton>
      </div>
      {error && (
        <p className="text-lg text-danger-light">
          Could not fetch: {error}. Has supabase/migrations/0114_anti_cheat.sql been run?
        </p>
      )}
      {rows && !shown.length && <p className="text-lg opacity-80">Nothing suspicious.</p>}
      {shown.length > 0 && (
        <div className="pixel-scroll max-h-[420px] overflow-auto">
          <table className="w-full min-w-[640px] text-lg">
            <thead className="sticky top-0 bg-ink text-left uppercase text-gold">
              <tr>
                <th className="px-2 py-1">Player</th>
                <th className="px-2 py-1">Why</th>
                <th className="px-2 py-1 text-right">Box</th>
                <th className="px-2 py-1 text-right">Shinies</th>
                <th className="px-2 py-1 text-right">Lv.100</th>
                <th className="px-2 py-1 text-right">₽</th>
                <th className="px-2 py-1 text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={`${r.user_id}-${r.realm}`}
                  onClick={() => onPick(r.user_id, r.name)}
                  className="cursor-pointer border-t border-white/20 hover:bg-white/10"
                >
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPick(r.user_id, r.name)
                      }}
                    >
                      {r.name}
                    </button>
                    {r.realm !== 'main' && <span className="ml-1 text-sm opacity-80">({r.realm})</span>}
                    {r.banned && <span className="ml-1 text-sm text-danger-light">banned</span>}
                  </td>
                  <td className="px-2 py-1">
                    <span className="flex flex-wrap gap-1">
                      {r.reasons.map((k) => (
                        <span
                          key={k}
                          title={REASONS[k] ?? k}
                          className={cx(
                            'border-2 border-edge bg-parchment px-1 text-sm leading-tight text-ink',
                          )}
                        >
                          {REASONS[k] ?? k}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right">{num(r.box)}</td>
                  <td className="px-2 py-1 text-right">{num(r.shinies)}</td>
                  <td className="px-2 py-1 text-right">{num(r.lv100)}</td>
                  <td className="px-2 py-1 text-right">{num(r.gold)}</td>
                  <td className="px-2 py-1 text-right">{num(r.days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
