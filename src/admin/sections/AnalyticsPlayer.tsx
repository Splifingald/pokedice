// Admin → Analytics → a player's profile: where their game stands, the leaderboard ban and the cheats. A Google player's
// game is read from their cloud save (as fresh as their last sync); a guest's from the snapshot their daily ping sent.
import { useEffect, useState } from 'react'
import { snapshotOf, type PlayerSnapshot } from '@/analytics/events'
import { AreaBanner } from '@/components/AreaBanner'
import { PixelIcon } from '@/components/icons'
import { SpriteImg } from '@/components/SpriteImg'
import type { GameData } from '@/engine/types'
import { getSupabase } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { fetchPlayerSave } from '../playerSave'
import { LeaderboardBan } from './LeaderboardBan'
import { PlayerCheats } from './PlayerCheats'

/** Supabase errors are plain objects, not Errors: without this they print as "[object Object]". */
export const errorText = (err: unknown) =>
  err instanceof Error
    ? err.message
    : err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)

interface GameState {
  at: string
  snap: PlayerSnapshot
  from: 'cloud save' | 'daily snapshot'
}

/** A Google player's cloud save if there is one, else the snapshot in their `players` row. Null: nothing recorded. */
async function fetchGameState(player: string, data: GameData): Promise<GameState | null> {
  const client = await getSupabase()
  if (!client) return null
  if (!player.startsWith('device:')) {
    const save = await fetchPlayerSave(client, player)
    if (save)
      return { at: new Date(save.updatedAt).toISOString(), snap: snapshotOf(save, data), from: 'cloud save' }
  }
  const { data: row, error } = await client
    .from('players')
    .select('snapshot,updated_at')
    .eq('player', player)
    .maybeSingle()
  if (error) throw error
  const r = row as { snapshot: PlayerSnapshot | null; updated_at: string } | null
  return r?.snapshot ? { at: r.updated_at, snap: r.snapshot, from: 'daily snapshot' } : null
}

function Block({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-col gap-2 border-2 border-edge bg-panel p-3', className)}>
      <h4 className="text-xl leading-none">{title}</h4>
      {children}
    </div>
  )
}

/** The selected player: their game as it stands, then the leaderboard ban and the cheats. */
export function PlayerPanel({ player, name }: { player: string; name: string }) {
  const data = useGame((s) => s.data)
  const [state, setState] = useState<GameState | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setState(undefined)
    setErr(null)
    fetchGameState(player, data)
      .then((s) => live && setState(s))
      .catch((e: unknown) => live && setErr(errorText(e)))
    return () => {
      live = false
    }
  }, [player, data])

  const s = state?.snap
  const area = s ? data.areas.find((a) => a.id === s.areaId) : undefined

  return (
    <section className="pixel-panel flex flex-col gap-3 p-3" aria-label={`${name}'s profile`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-3xl leading-none">{name}</h3>
        <span className="text-base text-muted">
          {state ? `From their ${state.from}, ${new Date(state.at).toLocaleString()}` : ''}
        </span>
      </div>

      {err && <p className="text-danger">Could not load this player's game: {err}</p>}
      {state === undefined && !err && <p className="text-lg text-muted">Loading game…</p>}
      {state === null && (
        <p className="text-lg text-muted">No cloud save and no snapshot for this player yet.</p>
      )}
      {s && (
        <div className="grid gap-3 md:grid-cols-2">
          <Block title="Pokédex">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl leading-none">{s.dex.length}</span>
              <span className="text-lg text-muted">/ {data.speciesList.length} caught</span>
            </div>
            <div className="h-3 border-2 border-edge bg-parchment">
              <div
                className="h-full bg-hp-green"
                style={{ width: `${(s.dex.length / Math.max(1, data.speciesList.length)) * 100}%` }}
              />
            </div>
            <div className="pixel-scroll flex max-h-40 flex-wrap gap-0.5 overflow-auto">
              {s.dex.map((d) => (
                <SpriteImg key={d} dex={d} size={32} alt={data.species[d]?.name} />
              ))}
            </div>
          </Block>

          <Block title="Current area">
            {area?.bannerUrl && <AreaBanner url={area.bannerUrl} className="h-14 border-2 border-edge" />}
            <div className="text-2xl leading-none">{area?.name ?? (s.area || '?')}</div>
            <div className="text-lg text-muted">
              {s.badges} badge{s.badges === 1 ? '' : 's'} · {s.box} in the Box
              {s.dayCare.length > 0 && ` · ${s.dayCare.length} at the Day Care`}
            </div>
          </Block>

          <Block title="Team">
            <ul className="flex flex-wrap gap-2">
              {s.team.map((m, i) => (
                <li
                  key={i}
                  className="flex flex-col items-center border-2 border-edge bg-parchment px-2 py-1"
                >
                  <SpriteImg dex={m.dex} size={64} shiny={m.shiny} />
                  <span className="text-lg leading-none">{data.species[m.dex]?.name ?? `#${m.dex}`}</span>
                  <span className="text-base text-muted">Lv.{m.level}</span>
                </li>
              ))}
            </ul>
            {s.dayCare.length > 0 && (
              <p className="text-base text-muted">
                Day Care:{' '}
                {s.dayCare.map((m) => `${data.species[m.dex]?.name ?? `#${m.dex}`} Lv.${m.level}`).join(', ')}
              </p>
            )}
          </Block>

          <Block title="Inventory">
            <div className="flex items-center gap-1 text-2xl">
              <PixelIcon name="coin" size={20} /> ₽{s.gold.toLocaleString()}
            </div>
            {Object.keys(s.inventory).length ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-lg">
                {Object.entries(s.inventory)
                  .sort((a, b) =>
                    (data.items[a[0]]?.name ?? a[0]).localeCompare(data.items[b[0]]?.name ?? b[0]),
                  )
                  .map(([k, n]) => (
                    <li key={k} className="flex items-center gap-1.5">
                      {data.items[k]?.spriteUrl ? (
                        <img
                          src={data.items[k]!.spriteUrl!}
                          alt=""
                          width={24}
                          height={24}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <PixelIcon name="potion" size={18} />
                      )}
                      <span className="min-w-0 flex-1 truncate">{data.items[k]?.name ?? k}</span>
                      <span className="font-mono">×{n}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-lg text-muted">The bag is empty.</p>
            )}
          </Block>
        </div>
      )}

      <Block title="Leaderboard">
        <LeaderboardBan player={player} name={name} />
      </Block>

      <Block title="Cheats">
        <PlayerCheats player={player} name={name} />
      </Block>
    </section>
  )
}
