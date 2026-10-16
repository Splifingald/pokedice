// Admin → Areas: an area's nightmare (docs/30), Newmoon Island's mode. Its switch (the game_config row `nightmare`,
// which the server reads too) and every number of the area's nightmare: its foes in their order, Darkrai's strike, the
// rounds' gifts and the raid after it.
import type { Row } from '@/config/mapping'
import { DEFAULT_NIGHTMARE, normaliseNightmare, type NightmareMode } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { updateRow, rowKey, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

export function NightmareModeBox({ area }: { area: Row }) {
  const data = useAdminData()
  const [sw, setSw] = useConfigRow('nightmare')
  const access = sw?.access ?? 'off'
  const mode = normaliseNightmare(area.mode)
  const set = (next: NightmareMode | null) => updateRow('areas', rowKey('areas', area), { mode: next })
  const patch = (p: Partial<NightmareMode>) => mode && set({ ...mode, ...p })
  const num = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts: { min?: number; max?: number; hint?: string } = {},
  ) => (
    <Field label={label} hint={opts.hint}>
      <NumInput min={opts.min ?? 0} max={opts.max} value={value} onChange={(v) => onChange(v ?? 0)} />
    </Field>
  )
  if (!data) return null
  return (
    <Box
      title="Special mode: nightmare"
      icon="moon"
      hint="Newmoon Island's mode (docs/30): Darkrai's nightmare. Its foes are fought one a round, in this order (wild Pokémon that can't be caught); after each round but the last, Darkrai's shadow takes a share of each team member's max HP (never a K.O.); a round may leave an item in the bag (once for good). Until it ends the player can't travel to another area (the Mart, the menus and Home stay open). The last round won opens the area's raid at the numbers below; a wipe sends the rounds back to 0."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Nightmares (every area)</span>
        <AccessSwitch
          value={access}
          onChange={(a) => setSw({ access: a })}
          label="Nightmares: who plays them"
        />
        <span className="text-base text-muted">
          {access === 'all'
            ? 'Every player: nightmare areas play their nightmare; their raid opens once it is over.'
            : access === 'admin'
              ? 'Only you (signed in) play the nightmares; other players see the areas as before.'
              : 'Off: nightmare areas play as before (rounds, Centers, their raid once cleared). Nightmares in saves are kept.'}
        </span>
      </div>
      <label className="flex items-center gap-2 text-lg">
        <input
          type="checkbox"
          checked={!!mode}
          onChange={(e) => set(e.target.checked ? DEFAULT_NIGHTMARE : null)}
        />{' '}
        This area is a nightmare
      </label>
      {mode && (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-lg leading-none">Foes, one a round, in order (weakest first)</span>
            {mode.foes.map((f, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <span className="w-16 text-lg">Round {i + 1}</span>
                <PokemonPicker
                  data={data}
                  value={f.dex}
                  onChange={(dex) => patch({ foes: mode.foes.map((x, j) => (j === i ? { ...x, dex } : x)) })}
                />
                <Field label="Level">
                  <NumInput
                    min={1}
                    max={100}
                    value={f.level}
                    onChange={(v) =>
                      patch({ foes: mode.foes.map((x, j) => (j === i ? { ...x, level: v ?? 1 } : x)) })
                    }
                  />
                </Field>
                <PixelButton
                  size="sm"
                  disabled={i === 0}
                  onClick={() => {
                    const foes = [...mode.foes]
                    ;[foes[i - 1], foes[i]] = [foes[i]!, foes[i - 1]!]
                    patch({ foes })
                  }}
                >
                  Up
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="danger"
                  disabled={mode.foes.length <= 1}
                  onClick={() => patch({ foes: mode.foes.filter((_, j) => j !== i) })}
                >
                  Remove
                </PixelButton>
              </div>
            ))}
            <PixelButton
              size="sm"
              disabled={mode.foes.length >= 20}
              onClick={() => {
                const last = mode.foes.at(-1)
                patch({
                  foes: [
                    ...mode.foes,
                    { dex: last?.dex ?? 491, level: Math.min(100, (last?.level ?? 60) + 1) },
                  ],
                })
              }}
            >
              Add a foe
            </PixelButton>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {num("Darkrai's strike (% of max HP)", mode.strikePercent, (v) => patch({ strikePercent: v }), {
              max: 99,
              hint: 'after each round but the last; never a K.O.',
            })}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-lg leading-none">
              Gifts (into the bag when that round is won, once for good)
            </span>
            {mode.gifts.map((g, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label="Round">
                  <NumInput
                    min={1}
                    max={mode.foes.length}
                    value={g.round}
                    onChange={(v) =>
                      patch({ gifts: mode.gifts.map((x, j) => (j === i ? { ...x, round: v ?? 1 } : x)) })
                    }
                  />
                </Field>
                <Field label="Item">
                  <select
                    className={inputCls}
                    value={g.key}
                    onChange={(e) =>
                      patch({
                        gifts: mode.gifts.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                      })
                    }
                  >
                    {Object.values(data.items).map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="How many">
                  <NumInput
                    min={1}
                    max={99}
                    value={g.qty}
                    onChange={(v) =>
                      patch({ gifts: mode.gifts.map((x, j) => (j === i ? { ...x, qty: v ?? 1 } : x)) })
                    }
                  />
                </Field>
                <PixelButton
                  size="sm"
                  variant="danger"
                  onClick={() => patch({ gifts: mode.gifts.filter((_, j) => j !== i) })}
                >
                  Remove
                </PixelButton>
              </div>
            ))}
            <PixelButton
              size="sm"
              onClick={() =>
                patch({ gifts: [...mode.gifts, { round: mode.foes.length, key: 'revive', qty: 1 }] })
              }
            >
              Add a gift
            </PixelButton>
            <span className="text-sm text-muted">One gift a round; a round past the last is dropped.</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {num('Raid level', mode.raid.level, (v) => patch({ raid: { ...mode.raid, level: v } }), {
              min: 1,
              max: 100,
              hint: 'its boss, once the nightmare is over',
            })}
            {num(
              'Raid foe dice level',
              mode.raid.upgradeLevel,
              (v) => patch({ raid: { ...mode.raid, upgradeLevel: v } }),
              {
                min: 1,
                max: 10,
              },
            )}
            {num('Raid HP bars', mode.raid.bars, (v) => patch({ raid: { ...mode.raid, bars: v } }), {
              min: 1,
              max: 10,
            })}
            {num(
              'Raid team level cap',
              mode.raid.teamCap,
              (v) => patch({ raid: { ...mode.raid, teamCap: v } }),
              {
                min: 1,
                max: 100,
                hint: 'teams from the world’s Box',
              },
            )}
          </div>
        </>
      )}
    </Box>
  )
}
