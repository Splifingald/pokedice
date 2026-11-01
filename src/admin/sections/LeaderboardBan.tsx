// Admin → Analytics → player → Leaderboard: ban a signed-in player from everything other players see, or lift the ban.
// Their game and cloud save are untouched. `leaderboard()` leaves them out (table leaderboard_bans, migration 0011), and
// since 0108 (docs/61) their Versus, raid and area versus teams go, their open listings are cancelled, their League
// trophies this week go to 0, and none of these take them back until the ban is lifted.
import { useEffect, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase } from '@/lib/supabase'
import { pushToast } from '@/store/game'

async function client() {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase is not configured')
  return c
}

export function LeaderboardBan({ player, name }: { player: string; name: string }) {
  const guest = player.startsWith('device:')
  const [banned, setBanned] = useState<boolean | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (guest) return
    let live = true
    setBanned(undefined)
    setErr(null)
    void (async () => {
      const { data, error } = await (await client()).from('leaderboard_bans').select('user_id').eq('user_id', player).maybeSingle()
      if (error) throw error
      return !!data
    })()
      .then((b) => live && setBanned(b))
      .catch((e: unknown) => live && setErr(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [player, guest])

  if (guest) return <p className="text-lg text-muted">Guest player: guests never appear on the leaderboard.</p>
  if (err) return <p className="text-lg text-danger">Couldn't read the ban list: {err}</p>
  if (banned === undefined) return <p className="text-lg text-muted">Loading…</p>

  const toggle = async () => {
    if (
      !banned &&
      !window.confirm(
        `Ban ${name}? They leave the boards, their Versus, raid and area teams go and their open trades are cancelled. You can lift it later.`,
      )
    )
      return
    setBusy(true)
    try {
      const c = await client()
      const { error } = banned
        ? await c.from('leaderboard_bans').delete().eq('user_id', player)
        : await c.from('leaderboard_bans').insert({ user_id: player })
      if (error) throw error
      setBanned(!banned)
      pushToast(banned ? `${name} is no longer banned` : `${name} is banned`, 'good')
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-lg">
        {banned ? (
          <span className="text-danger">Banned — off the boards, Versus, raids and trades.</span>
        ) : (
          <span className="text-muted">Not banned.</span>
        )}
      </p>
      <PixelButton size="sm" variant={banned ? 'secondary' : 'danger'} disabled={busy} onClick={() => void toggle()}>
        {banned ? 'LIFT THE BAN' : 'BAN'}
      </PixelButton>
    </div>
  )
}
