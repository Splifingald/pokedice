// Admin → Areas: an area's whiteout (docs/64 §4.3), Crown Shrine's mode. Its switch (the game_config row `whiteout`,
// which the server reads too: whiteout_open, 0125) and every number of the area's whiteout: its waves of foes in
// order, the weather of its fights, the bonfires' heal. Its boss is the area's own (Legendary boss, above).
import type { Row } from '@/config/mapping'
import {
  DEFAULT_WHITEOUT,
  blizzardPercent,
  normaliseWhiteout,
  type WhiteoutFoe,
  type WhiteoutMode,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { updateRow, rowKey, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

export function WhiteoutModeBox({ area }: { area: Row }) {
  const data = useAdminData()
  const [sw, setSw] = useConfigRow('whiteout')
  const access = sw?.access ?? 'off'
  const mode = normaliseWhiteout(area.mode)
  const set = (next: WhiteoutMode | null) => updateRow('areas', rowKey('areas', area), { mode: next })
  const patch = (p: Partial<WhiteoutMode>) => mode && set({ ...mode, ...p })
  const setWave = (i: number, wave: WhiteoutFoe[]) =>
    mode && patch({ waves: mode.waves.map((w, j) => (j === i ? wave : w)) })
  if (!data) return null
  return (
    <Box
      title="Special mode: whiteout"
      icon="frozen"
      hint="Crown Shrine's mode (docs/64 §4.3): weather survival. Its waves of foes are fought one after the other, in this order (wild Pokémon that can't be caught), every fight in the weather below (both sides lose a share of their max HP each round, its spared types excepted: the raids' rule). After each wave a bonfire heals the team, and it is the only place the team can change and items be used; the bag stays shut in battle. After the last bonfire, the area's boss. Caught, the area closes for good; a wipe sends the player back to wave 1. Until it ends the player can't travel to another area (the Mart, the menus and Home stay open). Off: the area plays as a plain secret area."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Whiteouts (every area)</span>
        <AccessSwitch
          value={access}
          onChange={(a) => setSw({ access: a })}
          label="Whiteouts: who plays them"
        />
        <span className="text-base text-muted">
          {access === 'all'
            ? 'Every player: whiteout areas play their waves, bonfires and boss.'
            : access === 'admin'
              ? 'Only you (signed in) play the whiteouts; other players see the areas as before.'
              : 'Off: whiteout areas play as plain secret areas (their deck, then their boss). Whiteouts in saves are kept.'}
        </span>
      </div>
      <label className="flex items-center gap-2 text-lg">
        <input
          type="checkbox"
          checked={!!mode}
          onChange={(e) => set(e.target.checked ? DEFAULT_WHITEOUT : null)}
        />{' '}
        This area is a whiteout
      </label>
      {mode && (
        <>
          <div className="flex flex-col gap-3">
            <span className="text-lg leading-none">
              Waves, in order (a bonfire after each, the boss after the last)
            </span>
            {mode.waves.map((wave, i) => (
              <div key={i} className="flex flex-col gap-2 border-2 border-edge p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg">Wave {i + 1}</span>
                  <PixelButton
                    size="sm"
                    disabled={i === 0}
                    onClick={() => {
                      const waves = [...mode.waves]
                      ;[waves[i - 1], waves[i]] = [waves[i]!, waves[i - 1]!]
                      patch({ waves })
                    }}
                  >
                    Up
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    variant="danger"
                    disabled={mode.waves.length <= 1}
                    onClick={() => patch({ waves: mode.waves.filter((_, j) => j !== i) })}
                  >
                    Remove the wave
                  </PixelButton>
                </div>
                {wave.map((f, j) => (
                  <div key={j} className="flex flex-wrap items-end gap-2">
                    <span className="w-16 text-lg">Foe {j + 1}</span>
                    <PokemonPicker
                      data={data}
                      value={f.dex}
                      onChange={(dex) =>
                        setWave(
                          i,
                          wave.map((x, k) => (k === j ? { ...x, dex } : x)),
                        )
                      }
                    />
                    <Field label="Level">
                      <NumInput
                        min={1}
                        max={100}
                        value={f.level}
                        onChange={(v) =>
                          setWave(
                            i,
                            wave.map((x, k) => (k === j ? { ...x, level: v ?? 1 } : x)),
                          )
                        }
                      />
                    </Field>
                    <PixelButton
                      size="sm"
                      variant="danger"
                      disabled={wave.length <= 1}
                      onClick={() =>
                        setWave(
                          i,
                          wave.filter((_, k) => k !== j),
                        )
                      }
                    >
                      Remove
                    </PixelButton>
                  </div>
                ))}
                <PixelButton
                  size="sm"
                  disabled={wave.length >= 8}
                  onClick={() => {
                    const last = wave.at(-1)
                    setWave(i, [...wave, { dex: last?.dex ?? 460, level: last?.level ?? 50 }])
                  }}
                >
                  Add a foe
                </PixelButton>
              </div>
            ))}
            <PixelButton
              size="sm"
              disabled={mode.waves.length >= 10}
              onClick={() => {
                const last = mode.waves.at(-1)?.at(-1)
                patch({
                  waves: [
                    ...mode.waves,
                    [{ dex: last?.dex ?? 460, level: Math.min(100, (last?.level ?? 50) + 1) }],
                  ],
                })
              }}
            >
              Add a wave
            </PixelButton>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Field
              label="Weather"
              hint={`the raids' rule: ${blizzardPercent()}% of max HP a round, both sides`}
            >
              <select
                className={inputCls}
                value={mode.weather ?? ''}
                onChange={(e) => patch({ weather: (e.target.value || null) as WhiteoutMode['weather'] })}
              >
                <option value="snow">Snow (Ice spared)</option>
                <option value="sand">Sandstorm (Rock, Ground, Steel spared)</option>
                <option value="">None</option>
              </select>
            </Field>
            <Field
              label="Bonfire heal (% of max HP)"
              hint="to every team member still standing, once a bonfire"
            >
              <NumInput
                min={0}
                max={100}
                value={mode.bonfirePercent}
                onChange={(v) => patch({ bonfirePercent: v ?? 0 })}
              />
            </Field>
          </div>
        </>
      )}
    </Box>
  )
}
