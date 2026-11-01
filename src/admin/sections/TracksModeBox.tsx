// Admin → Areas: an area's Tracks in the Snow (docs/61 §4.1), Moonlit Glade's mode. Its switch (the game_config row
// `tracks`, which the server reads too: tracks_open, 0122) and every number of the area's hide and seek: each round's
// glade (bushes a side, taps before the snow, what the bushes hold, Stantler kept away from the first bush's
// neighbours) and where the hoofprints show.
import type { Row } from '@/config/mapping'
import {
  DEFAULT_TRACKS,
  normaliseTracks,
  normaliseTracksRound,
  TRACKS_MAX_SIZE,
  type TracksMode,
  type TracksRound,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { updateRow, rowKey, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput } from '../widgets'
import { useConfigRow } from './ConfigSection'

export function TracksModeBox({ area }: { area: Row }) {
  const data = useAdminData()
  const [sw, setSw] = useConfigRow('tracks')
  const access = sw?.access ?? 'off'
  const mode = normaliseTracks(area.mode)
  const set = (next: TracksMode | null) => updateRow('areas', rowKey('areas', area), { mode: next })
  const patch = (p: Partial<TracksMode>) => mode && set({ ...mode, ...p })
  /** One round changed, cleaned as the game will read it (never more contents than bushes). */
  const setRound = (i: number, p: Partial<TracksRound>) =>
    mode &&
    patch({ rounds: mode.rounds.map((r, j) => (j === i ? normaliseTracksRound({ ...r, ...p }, r) : r)) })
  if (!data) return null
  return (
    <Box
      title="Special mode: Tracks in the Snow"
      icon="sparkle"
      hint="Moonlit Glade's mode (docs/61 §4.1): hide and seek with Stantler, round after round. Each round is a glade of snowy bushes; the first opened is never Stantler's (it's hidden only then), and with 'Not next to the first' not one of its 8 neighbours either. A bush holds a wild Pokémon of the area's pool, a find of its loot, a warm cabin (a Pokémon Center's heal) or nothing, and shows hoofprints pointing at Stantler. Out of taps, the snow falls: a fresh glade. Rounds before the last end on a wild Stantler (the boss's species), the last on the area's boss. Cleared rounds are kept through a wipe."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Tracks in the Snow (every area)</span>
        <AccessSwitch
          value={access}
          onChange={(a) => setSw({ access: a })}
          label="Tracks in the Snow: who plays it"
        />
        <span className="text-base text-muted">
          {access === 'all'
            ? 'Every player: the glade plays its hide and seek, its boss found in the last round.'
            : access === 'admin'
              ? 'Only you (signed in) play it; other players see a plain secret area.'
              : 'Off: the area plays as a plain secret area (its deck, then its boss). Glades in saves are kept.'}
        </span>
      </div>
      <label className="flex items-center gap-2 text-lg">
        <input
          type="checkbox"
          checked={!!mode}
          onChange={(e) => set(e.target.checked ? DEFAULT_TRACKS : null)}
        />{' '}
        This area is Tracks in the Snow
      </label>
      {mode && (
        <>
          <label className="flex items-center gap-2 text-lg">
            <input
              type="checkbox"
              checked={mode.emptyPrintsOnly}
              onChange={(e) => patch({ emptyPrintsOnly: e.target.checked })}
            />{' '}
            Hoofprints on empty bushes only (off: on every bush opened)
          </label>
          <div className="flex flex-col gap-3">
            {mode.rounds.map((r, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 border-t-2 border-line pt-2">
                <span className="w-24 text-lg">
                  Round {i + 1}
                  {i === mode.rounds.length - 1 ? ' (boss)' : ''}
                </span>
                <Field label="Bushes a side" hint={`${r.size} × ${r.size}`}>
                  <NumInput
                    min={2}
                    max={TRACKS_MAX_SIZE}
                    value={r.size}
                    onChange={(v) => setRound(i, { size: v ?? 3 })}
                  />
                </Field>
                <Field label="Taps a snowfall">
                  <NumInput
                    min={1}
                    max={r.size * r.size}
                    value={r.taps}
                    onChange={(v) => setRound(i, { taps: v ?? 1 })}
                  />
                </Field>
                <Field label="Wild">
                  <NumInput min={0} value={r.wild} onChange={(v) => setRound(i, { wild: v ?? 0 })} />
                </Field>
                <Field label="Finds">
                  <NumInput min={0} value={r.finds} onChange={(v) => setRound(i, { finds: v ?? 0 })} />
                </Field>
                <Field label="Cabins">
                  <NumInput min={0} value={r.cabins} onChange={(v) => setRound(i, { cabins: v ?? 0 })} />
                </Field>
                <span className="text-sm text-muted">
                  {r.size * r.size - 1 - r.wild - r.finds - r.cabins} empty
                </span>
                <label className="flex items-center gap-2 text-lg">
                  <input
                    type="checkbox"
                    checked={r.apart}
                    onChange={(e) => setRound(i, { apart: e.target.checked })}
                  />{' '}
                  Not next to the first
                </label>
                <PixelButton
                  size="sm"
                  variant="danger"
                  disabled={mode.rounds.length <= 1}
                  onClick={() => patch({ rounds: mode.rounds.filter((_, j) => j !== i) })}
                >
                  Remove
                </PixelButton>
              </div>
            ))}
            <PixelButton
              size="sm"
              disabled={mode.rounds.length >= 9}
              onClick={() =>
                patch({
                  rounds: [...mode.rounds.slice(0, -1), DEFAULT_TRACKS.rounds[0]!, mode.rounds.at(-1)!],
                })
              }
            >
              Add a round (before the boss's)
            </PixelButton>
          </div>
        </>
      )}
    </Box>
  )
}
