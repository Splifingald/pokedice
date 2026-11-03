// Admin → Areas: an area's race of time and space (docs/64 §4.4), Spear Pillar's mode. Its switch (the game_config row
// `timeRace`, which the server reads too) and every number of the area's race: the forks, the last gate's legends, the
// clock, the gates' finds, the speed inside, the replay and the raids after it.
import type { Row } from '@/config/mapping'
import { DEFAULT_TIME_RACE, normaliseTimeRace, POKE_TYPES, type PokeType, type TimeRaceMode } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { updateRow, rowKey, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

type Fork = [PokeType, PokeType]

/** A type picker (the eighteen types). */
function TypeSelect({
  value,
  onChange,
  label,
}: {
  value: PokeType
  onChange: (t: PokeType) => void
  label: string
}) {
  return (
    <select
      aria-label={label}
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value as PokeType)}
    >
      {POKE_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

/** A list of forks, two gate types each: change, remove, add. */
function ForkList({
  title,
  forks,
  onChange,
}: {
  title: string
  forks: Fork[]
  onChange: (f: Fork[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-lg leading-none">{title}</span>
      {forks.map((f, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <span className="w-16 text-lg">Fork {i + 1}</span>
          {[0, 1].map((side) => (
            <Field key={side} label={side ? 'Gate B' : 'Gate A'}>
              <TypeSelect
                label={`${title}: fork ${i + 1}, gate ${side ? 'B' : 'A'}`}
                value={f[side]!}
                onChange={(t) =>
                  onChange(forks.map((x, j) => (j === i ? (side ? [x[0], t] : [t, x[1]]) : x)))
                }
              />
            </Field>
          ))}
          <PixelButton
            size="sm"
            variant="danger"
            disabled={forks.length <= 1}
            onClick={() => onChange(forks.filter((_, j) => j !== i))}
          >
            Remove
          </PixelButton>
        </div>
      ))}
      <PixelButton
        size="sm"
        disabled={forks.length >= 10}
        onClick={() => onChange([...forks, ['normal', 'fire']])}
      >
        Add a fork
      </PixelButton>
      <span className="text-sm text-muted">
        Two different types a fork; a fork with the same type twice is dropped.
      </span>
    </div>
  )
}

export function TimeRaceModeBox({ area }: { area: Row }) {
  const data = useAdminData()
  const [sw, setSw] = useConfigRow('timeRace')
  const access = sw?.access ?? 'off'
  const mode = normaliseTimeRace(area.mode)
  const set = (next: TimeRaceMode | null) => updateRow('areas', rowKey('areas', area), { mode: next })
  const patch = (p: Partial<TimeRaceMode>) => mode && set({ ...mode, ...p })
  const num = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts: { min?: number; max?: number; hint?: string; step?: number } = {},
  ) => (
    <Field label={label} hint={opts.hint}>
      <NumInput
        min={opts.min ?? 0}
        max={opts.max}
        step={opts.step}
        value={value}
        onChange={(v) => onChange(v ?? 0)}
      />
    </Field>
  )
  if (!data) return null
  return (
    <Box
      title="Special mode: race of time and space"
      icon="clock"
      hint="Spear Pillar's mode (docs/64 §4.4): a time trial. From READY! the clock runs on the server's time, kept in the save. A fork every few fights offers two gates, each a type (the next foes are of it, drawn from this area's wild pool) and a find (an item, or a time shard that adds time). The last fork's gates are the two legends': the one taken opens that legend's raid when the last fight is won in time. Out of time or a full K.O.: back to the start, healed, XP and items kept. No Center, no catch, no auto-battle, one battle speed for everyone inside. Once that legend is caught, one replay with its own forks opens the other."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Races (every area)</span>
        <AccessSwitch
          value={access}
          onChange={(a) => setSw({ access: a })}
          label="Races of time and space: who plays them"
        />
        <span className="text-base text-muted">
          {access === 'all'
            ? 'Every player: race areas play their race; each raid opens once the race is won at its gate.'
            : access === 'admin'
              ? 'Only you (signed in) play the races; other players see the areas as before.'
              : 'Off: race areas play as before (their short deck, then their raids). Races in saves are kept.'}
        </span>
      </div>
      <label className="flex items-center gap-2 text-lg">
        <input
          type="checkbox"
          checked={!!mode}
          onChange={(e) => set(e.target.checked ? DEFAULT_TIME_RACE : null)}
        />{' '}
        This area is a race of time and space
      </label>
      {mode && (
        <>
          <ForkList
            title="Forks, in order (before the last)"
            forks={mode.forks}
            onChange={(forks) => patch({ forks })}
          />
          <div className="flex flex-col gap-2">
            <span className="text-lg leading-none">
              The last fork: each gate opens its legend’s raid (one of the area’s raid bosses)
            </span>
            {mode.legends.map((l, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label={`Gate ${i ? 'B' : 'A'}`}>
                  <TypeSelect
                    label={`Last fork, gate ${i ? 'B' : 'A'}`}
                    value={l.type}
                    onChange={(type) =>
                      patch({ legends: mode.legends.map((x, j) => (j === i ? { ...x, type } : x)) })
                    }
                  />
                </Field>
                <PokemonPicker
                  data={data}
                  value={l.dex}
                  onChange={(dex) =>
                    patch({ legends: mode.legends.map((x, j) => (j === i ? { ...x, dex } : x)) })
                  }
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {num('Fights after each fork', mode.perFork, (v) => patch({ perFork: v }), { min: 1, max: 10 })}
            {num('Clock (seconds)', mode.seconds, (v) => patch({ seconds: v }), {
              min: 30,
              max: 7200,
              hint: '720 = 12:00',
            })}
            {num(
              'Time shard chance (%)',
              mode.shard.chance,
              (v) => patch({ shard: { ...mode.shard, chance: v } }),
              {
                max: 100,
                hint: 'of a gate’s find; else an item',
              },
            )}
            {num(
              'Time shard (seconds)',
              mode.shard.seconds,
              (v) => patch({ shard: { ...mode.shard, seconds: v } }),
              {
                max: 600,
              },
            )}
            {num('Battle speed inside (×)', mode.speed, (v) => patch({ speed: v }), {
              min: 1,
              max: 3,
              step: 0.25,
              hint: 'for everyone; 1.5 = the auto battle’s quick speed',
            })}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-lg leading-none">
              A gate’s items (drawn by weight when it isn’t a shard)
            </span>
            {mode.items.map((it, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label="Item">
                  <select
                    className={inputCls}
                    value={it.key}
                    onChange={(e) =>
                      patch({
                        items: mode.items.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
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
                    value={it.qty}
                    onChange={(v) =>
                      patch({ items: mode.items.map((x, j) => (j === i ? { ...x, qty: v ?? 1 } : x)) })
                    }
                  />
                </Field>
                <Field label="Weight">
                  <NumInput
                    min={0}
                    value={it.weight}
                    onChange={(v) =>
                      patch({ items: mode.items.map((x, j) => (j === i ? { ...x, weight: v ?? 0 } : x)) })
                    }
                  />
                </Field>
                <PixelButton
                  size="sm"
                  variant="danger"
                  onClick={() => patch({ items: mode.items.filter((_, j) => j !== i) })}
                >
                  Remove
                </PixelButton>
              </div>
            ))}
            <PixelButton
              size="sm"
              onClick={() => patch({ items: [...mode.items, { key: 'hyper-potion', qty: 1, weight: 10 }] })}
            >
              Add an item
            </PixelButton>
          </div>
          <ForkList
            title="The replay’s forks (once the first legend is caught; then the other legend’s gate alone)"
            forks={mode.replay.forks}
            onChange={(forks) => patch({ replay: { ...mode.replay, forks } })}
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {num(
              'Replay: foes’ extra levels',
              mode.replay.levelBonus,
              (v) => patch({ replay: { ...mode.replay, levelBonus: v } }),
              {
                max: 40,
              },
            )}
            {num(
              'Replay: clock (seconds)',
              mode.replay.seconds,
              (v) => patch({ replay: { ...mode.replay, seconds: v } }),
              {
                min: 30,
                max: 7200,
                hint: '600 = 10:00',
              },
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {num('Raid level', mode.raid.level, (v) => patch({ raid: { ...mode.raid, level: v } }), {
              min: 1,
              max: 100,
              hint: 'both legends, once won',
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
