// Admin → Analytics → player → Cheats: give a signed-in player a Pokémon, or take one away, by editing their cloud save.
import { useEffect, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import type { PokemonInstance, SaveData } from '@/engine/types'
import { getSupabase } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { newId } from '@/store/run'
import { adminAddPokemon, adminRemovePokemon, fetchPlayerSave, pushPlayerSave } from '../playerSave'
import { NumInput, PokemonPicker } from '../widgets'

type Where = 'Team' | 'Box' | 'Day Care'

export function PlayerCheats({ player, name }: { player: string; name: string }) {
  const data = useGame((s) => s.data)
  const guest = player.startsWith('device:')
  const [save, setSave] = useState<SaveData | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dex, setDex] = useState<number | null>(null)
  const [level, setLevel] = useState(5)
  const [shiny, setShiny] = useState(false)

  useEffect(() => {
    if (guest) return
    let live = true
    setSave(undefined)
    setErr(null)
    void (async () => {
      const client = await getSupabase()
      if (!client) throw new Error('Supabase is not configured')
      return fetchPlayerSave(client, player)
    })()
      .then((s) => live && setSave(s))
      .catch((e: unknown) => live && setErr(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [player, guest])

  if (guest) {
    return <p className="text-lg text-muted">Guest player: their save only lives on their device, so there is nothing to edit.</p>
  }

  const apply = async (edit: (s: SaveData) => SaveData, done: string) => {
    if (!save) return
    setBusy(true)
    try {
      const client = await getSupabase()
      if (!client) throw new Error('Supabase is not configured')
      // Edit the latest cloud save, not the one loaded when the panel opened.
      const latest = (await fetchPlayerSave(client, player)) ?? save
      const next = edit(latest)
      await pushPlayerSave(client, player, next)
      setSave(next)
      pushToast(done, 'good')
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!dex) return
    const lv = Math.max(1, Math.min(data.config.maxLevel, Math.round(level)))
    void apply(
      (s) => adminAddPokemon(s, { dex, level: lv, shiny }, data, Date.now(), newId()),
      `${data.species[dex]?.name ?? `#${dex}`} Lv.${lv} given to ${name}`,
    )
  }

  const remove = (p: PokemonInstance) => {
    const label = `${data.species[p.dex]?.name ?? `#${p.dex}`} Lv.${p.level}`
    if (!window.confirm(`Take ${label} away from ${name}? This can't be undone.`)) return
    void apply((s) => adminRemovePokemon(s, p.id, Date.now()), `${label} removed from ${name}'s save`)
  }

  const mons: { p: PokemonInstance; where: Where }[] = save
    ? [
        ...save.team.map((id) => save.box.find((p) => p.id === id)).filter((p): p is PokemonInstance => !!p).map((p) => ({ p, where: 'Team' as const })),
        ...save.box.filter((p) => !save.team.includes(p.id)).map((p) => ({ p, where: 'Box' as const })),
        ...(save.dayCare?.residents ?? []).map((r) => ({ p: r.inst, where: 'Day Care' as const })),
      ]
    : []

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base leading-snug text-muted">
        Edits {name}'s cloud save. They get it the next time they open the game: if they're playing right now, their
        game will overwrite it, so do this while they're away.
      </p>
      {err && <p className="text-danger">Could not load this player's save: {err}</p>}
      {save === undefined && !err && <p className="text-lg text-muted">Loading save…</p>}
      {save === null && <p className="text-lg text-muted">No cloud save for this player.</p>}
      {save && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[240px] flex-1 flex-col text-base">
              Pokémon
              <PokemonPicker data={data} value={dex} onChange={setDex} />
            </label>
            <label className="flex w-24 flex-col text-base">
              Level
              <NumInput value={level} min={1} max={data.config.maxLevel} onChange={(v) => setLevel(v ?? 1)} />
            </label>
            <label className="flex min-h-[34px] items-center gap-1.5 text-lg">
              <input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} />
              Shiny
            </label>
            <PixelButton size="sm" variant="success" disabled={!dex || busy} onClick={add}>
              Give Pokémon
            </PixelButton>
          </div>
          <ul className="pixel-scroll flex max-h-80 flex-col gap-1 overflow-auto">
            {mons.map(({ p, where }) => (
              <li key={p.id} className="flex items-center gap-2 border-2 border-ink bg-parchment px-2 py-0.5">
                <SpriteImg dex={p.dex} size={40} shiny={p.shiny} />
                <span className="min-w-0 flex-1 truncate text-lg">
                  {data.species[p.dex]?.name ?? `#${p.dex}`} Lv.{p.level}
                  {p.shiny && <span className="text-gold"> ★ shiny</span>}
                </span>
                <span className="text-base text-muted">{where}</span>
                <PixelButton
                  size="sm"
                  variant="danger"
                  disabled={busy || (where !== 'Day Care' && save.box.length === 1)}
                  onClick={() => remove(p)}
                >
                  Delete
                </PixelButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
